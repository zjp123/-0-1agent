import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  Inject,
  NotFoundException,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";

import { ApiKeyGuard } from "../auth/api-key.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { RequirePermissions } from "../auth/permissions.decorator.js";
import { PermissionsGuard } from "../auth/permissions.guard.js";
import type { RequestUser } from "../auth/auth.types.js";
import { QuotaService } from "../governance/quota.service.js";
import { DocumentExtractorService } from "./document-extractor.service.js";
import { IndexingWorkerService } from "./indexing-worker.service.js";
import { IngestKnowledgeDto } from "./dto/ingest-knowledge.dto.js";
import { RetrieveKnowledgeDto } from "./dto/retrieve-knowledge.dto.js";
import { RagService } from "./rag.service.js";
import type {
  DeadLetterBatchResult,
  IndexingJob,
  IndexingWorkerAlerts,
  IndexingWorkerMetrics,
  IndexingWorkerStatus,
  KnowledgeDocument,
  KnowledgeIngestResult,
  KnowledgeSearchResult,
  IngestKnowledgeInput,
  RetrieveKnowledgeInput,
} from "./rag.types.js";
import type { IndexingQueueMessage } from "./redis-indexing-queue.js";

@Controller("knowledge")
export class RagController {
  constructor(
    @Inject(RagService)
    private readonly rag: RagService,
    @Inject(IndexingWorkerService)
    private readonly indexingWorker: IndexingWorkerService,
    @Inject(QuotaService)
    private readonly quota: QuotaService,
    @Inject(DocumentExtractorService)
    private readonly extractor: DocumentExtractorService,
  ) {}

  @Post("ingest")
  @UseGuards(ApiKeyGuard, PermissionsGuard)
  @RequirePermissions("knowledge:write")
  async ingest(
    @Body() body: IngestKnowledgeDto,
    @CurrentUser() user: RequestUser,
  ): Promise<KnowledgeIngestResult> {
    await this.quota.enforce({
      tenantId: user.tenantId,
      userId: user.userId,
      action: "knowledge.ingest",
      tokenCost: Math.ceil(body.content.length / 4),
      metadata: { title: body.title, sourceType: body.sourceType ?? null },
    });
    const input: IngestKnowledgeInput = {
      tenantId: user.tenantId,
      title: body.title,
      content: body.content,
    };
    if (body.sourceType) {
      input.sourceType = body.sourceType;
    }
    if (body.sourceUri) {
      input.sourceUri = body.sourceUri;
    }
    if (body.tags) {
      input.tags = body.tags;
    }

    return this.rag.ingest(input);
  }

  @Post("upload")
  @UseGuards(ApiKeyGuard, PermissionsGuard)
  @RequirePermissions("knowledge:write")
  @UseInterceptors(
    FileInterceptor("file", {
      limits: { fileSize: 20 * 1024 * 1024 },
    }),
  )
  async uploadFile(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() body: { tags?: string; sourceUri?: string },
    @CurrentUser() user: RequestUser,
  ): Promise<KnowledgeIngestResult> {
    if (!file) {
      throw new NotFoundException("No file uploaded. Use 'file' field in multipart form data.");
    }
    if (!file.buffer || file.buffer.length === 0) {
      throw new NotFoundException("Uploaded file is empty.");
    }

    // Multer interprets multipart filenames as Latin-1 by default.
    // Re-decode as UTF-8 so CJK characters are preserved.
    const originalName = Buffer.from(file.originalname, "latin1").toString("utf-8");

    const extracted = await this.extractor.extract(
      file.buffer,
      originalName,
      file.mimetype,
    );

    if (!extracted.text.trim()) {
      throw new NotFoundException("No text content could be extracted from the file.");
    }

    await this.quota.enforce({
      tenantId: user.tenantId,
      userId: user.userId,
      action: "knowledge.ingest",
      tokenCost: Math.ceil(extracted.text.length / 4),
      metadata: {
        title: extracted.title,
        sourceType: extracted.sourceType,
        fileName: originalName,
      },
    });

    const input: IngestKnowledgeInput = {
      tenantId: user.tenantId,
      title: extracted.title,
      content: extracted.text,
      sourceType: "upload",
      sourceUri: body.sourceUri?.trim() || originalName,
    };

    if (body.tags) {
      const tags = body.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean);
      if (tags.length > 0) {
        input.tags = [...tags, "upload", extracted.sourceType];
      } else {
        input.tags = ["upload", extracted.sourceType];
      }
    } else {
      input.tags = ["upload", extracted.sourceType];
    }

    return this.rag.ingest(input);
  }

  @Post("retrieve")
  @UseGuards(ApiKeyGuard, PermissionsGuard)
  @RequirePermissions("knowledge:read")
  async retrieve(
    @Body() body: RetrieveKnowledgeDto,
    @CurrentUser() user: RequestUser,
  ): Promise<KnowledgeSearchResult[]> {
    await this.quota.enforce({
      tenantId: user.tenantId,
      userId: user.userId,
      action: "knowledge.retrieve",
      metadata: { limit: body.limit ?? null, tagCount: body.tags?.length ?? 0 },
    });
    return this.rag.retrieve(this.toRetrieveInput(body, user));
  }

  @Get("documents")
  @UseGuards(ApiKeyGuard, PermissionsGuard)
  @RequirePermissions("knowledge:read")
  listDocuments(@CurrentUser() user: RequestUser): Promise<KnowledgeDocument[]> {
    return this.rag.listDocuments(user.tenantId);
  }

  @Delete("documents/:documentId")
  @UseGuards(ApiKeyGuard, PermissionsGuard)
  @RequirePermissions("knowledge:write")
  async deleteDocument(
    @Param("documentId") documentId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<{ deleted: boolean; documentId: string }> {
    await this.rag.deleteDocument(user.tenantId, documentId);
    return { deleted: true, documentId };
  }

  @Post("reindex")
  @UseGuards(ApiKeyGuard, PermissionsGuard)
  @RequirePermissions("knowledge:write")
  async reindex(@CurrentUser() user: RequestUser): Promise<IndexingJob> {
    await this.quota.enforce({
      tenantId: user.tenantId,
      userId: user.userId,
      action: "knowledge.reindex",
    });
    return this.indexingWorker.enqueueReindexJob({
      tenantId: user.tenantId,
      userId: user.userId,
    });
  }

  @Get("reindex/jobs")
  @UseGuards(ApiKeyGuard, PermissionsGuard)
  @RequirePermissions("knowledge:read")
  listIndexingJobs(@CurrentUser() user: RequestUser): Promise<IndexingJob[]> {
    return this.rag.listIndexingJobs(user.tenantId);
  }

  @Get("reindex/worker/status")
  @UseGuards(ApiKeyGuard, PermissionsGuard)
  @RequirePermissions("knowledge:read")
  getIndexingWorkerStatus(): Promise<IndexingWorkerStatus> {
    return this.indexingWorker.getStatus();
  }

  @Get("reindex/worker/metrics")
  @UseGuards(ApiKeyGuard, PermissionsGuard)
  @RequirePermissions("knowledge:read")
  getIndexingWorkerMetrics(): Promise<IndexingWorkerMetrics> {
    return this.indexingWorker.getMetrics();
  }

  @Get("reindex/worker/alerts")
  @UseGuards(ApiKeyGuard, PermissionsGuard)
  @RequirePermissions("knowledge:read")
  getIndexingWorkerAlerts(): Promise<IndexingWorkerAlerts> {
    return this.indexingWorker.getAlerts();
  }

  @Get("reindex/worker/prometheus")
  @Header("Content-Type", "text/plain; version=0.0.4; charset=utf-8")
  @UseGuards(ApiKeyGuard, PermissionsGuard)
  @RequirePermissions("knowledge:read")
  getIndexingWorkerPrometheusMetrics(): Promise<string> {
    return this.indexingWorker.getPrometheusMetrics();
  }

  @Get("reindex/jobs/stuck")
  @UseGuards(ApiKeyGuard, PermissionsGuard)
  @RequirePermissions("knowledge:read")
  async listStuckIndexingJobs(
    @CurrentUser() user: RequestUser,
  ): Promise<IndexingJob[]> {
    const jobs = await this.indexingWorker.listStuckJobs();
    return jobs.filter((job) => job.tenantId === user.tenantId);
  }

  @Get("reindex/dead-letter")
  @UseGuards(ApiKeyGuard, PermissionsGuard)
  @RequirePermissions("knowledge:read")
  async listDeadLetters(
    @CurrentUser() user: RequestUser,
  ): Promise<IndexingQueueMessage[]> {
    const messages = await this.indexingWorker.listDeadLetters(50);
    return messages.filter((message) => message.tenantId === user.tenantId);
  }

  @Post("reindex/dead-letter/replay-all")
  @UseGuards(ApiKeyGuard, PermissionsGuard)
  @RequirePermissions("knowledge:write")
  replayAllDeadLetters(
    @CurrentUser() user: RequestUser,
  ): Promise<DeadLetterBatchResult> {
    return this.indexingWorker.replayTenantDeadLetters({
      tenantId: user.tenantId,
      userId: user.userId,
    });
  }

  @Post("reindex/dead-letter/purge")
  @UseGuards(ApiKeyGuard, PermissionsGuard)
  @RequirePermissions("knowledge:write")
  purgeDeadLetters(
    @CurrentUser() user: RequestUser,
  ): Promise<DeadLetterBatchResult> {
    return this.indexingWorker.purgeTenantDeadLetters({
      tenantId: user.tenantId,
      userId: user.userId,
    });
  }

  @Get("reindex/jobs/:jobId")
  @UseGuards(ApiKeyGuard, PermissionsGuard)
  @RequirePermissions("knowledge:read")
  async getIndexingJob(
    @Param("jobId") jobId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<IndexingJob> {
    const job = await this.rag.getIndexingJob(user.tenantId, jobId);
    if (!job) {
      throw new NotFoundException("Indexing job not found");
    }
    return job;
  }

  @Post("reindex/jobs/:jobId/cancel")
  @UseGuards(ApiKeyGuard, PermissionsGuard)
  @RequirePermissions("knowledge:write")
  async cancelIndexingJob(
    @Param("jobId") jobId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<IndexingJob> {
    const job = await this.rag.cancelIndexingJob(user.tenantId, jobId);
    if (!job) {
      throw new NotFoundException("Indexing job not found");
    }
    this.indexingWorker.recordCancel({
      tenantId: user.tenantId,
      userId: user.userId,
      jobId,
      result: "accepted",
    });
    return job;
  }

  @Post("reindex/jobs/:jobId/replay")
  @UseGuards(ApiKeyGuard, PermissionsGuard)
  @RequirePermissions("knowledge:write")
  async replayDeadLetterJob(
    @Param("jobId") jobId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<IndexingJob> {
    const job = await this.indexingWorker.replayDeadLetterJob({
      tenantId: user.tenantId,
      userId: user.userId,
      jobId,
    });
    if (!job) {
      throw new NotFoundException("Dead-letter indexing job not found");
    }
    return job;
  }

  private toRetrieveInput(
    body: RetrieveKnowledgeDto,
    user: RequestUser,
  ): RetrieveKnowledgeInput {
    const input: RetrieveKnowledgeInput = {
      tenantId: user.tenantId,
      query: body.query,
    };
    if (body.limit !== undefined) {
      input.limit = body.limit;
    }
    if (body.tags) {
      input.tags = body.tags;
    }
    return input;
  }
}
