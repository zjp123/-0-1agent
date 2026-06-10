import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";

import { ApiKeyGuard } from "../auth/api-key.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { RequirePermissions } from "../auth/permissions.decorator.js";
import { PermissionsGuard } from "../auth/permissions.guard.js";
import type { RequestUser } from "../auth/auth.types.js";
import { IndexingWorkerService } from "./indexing-worker.service.js";
import { IngestKnowledgeDto } from "./dto/ingest-knowledge.dto.js";
import { RetrieveKnowledgeDto } from "./dto/retrieve-knowledge.dto.js";
import { RagService } from "./rag.service.js";
import type {
  IndexingJob,
  KnowledgeDocument,
  KnowledgeIngestResult,
  KnowledgeSearchResult,
  IngestKnowledgeInput,
  RetrieveKnowledgeInput,
} from "./rag.types.js";

@Controller("knowledge")
export class RagController {
  constructor(
    private readonly rag: RagService,
    private readonly indexingWorker: IndexingWorkerService,
  ) {}

  @Post("ingest")
  @UseGuards(ApiKeyGuard, PermissionsGuard)
  @RequirePermissions("knowledge:write")
  ingest(
    @Body() body: IngestKnowledgeDto,
    @CurrentUser() user: RequestUser,
  ): Promise<KnowledgeIngestResult> {
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

  @Post("retrieve")
  @UseGuards(ApiKeyGuard, PermissionsGuard)
  @RequirePermissions("knowledge:read")
  retrieve(
    @Body() body: RetrieveKnowledgeDto,
    @CurrentUser() user: RequestUser,
  ): Promise<KnowledgeSearchResult[]> {
    return this.rag.retrieve(this.toRetrieveInput(body, user));
  }

  @Get("documents")
  @UseGuards(ApiKeyGuard, PermissionsGuard)
  @RequirePermissions("knowledge:read")
  listDocuments(@CurrentUser() user: RequestUser): Promise<KnowledgeDocument[]> {
    return this.rag.listDocuments(user.tenantId);
  }

  @Post("reindex")
  @UseGuards(ApiKeyGuard, PermissionsGuard)
  @RequirePermissions("knowledge:write")
  reindex(@CurrentUser() user: RequestUser): Promise<IndexingJob> {
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
