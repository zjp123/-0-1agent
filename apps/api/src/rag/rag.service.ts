import { Inject, Injectable } from "@nestjs/common";

import type { ModelMessage } from "../model-gateway/model-gateway.types.js";
import { ObservabilityService } from "../observability/observability.service.js";
import {
  EMBEDDING_PROVIDER,
  VECTOR_STORE,
} from "../vector-store/vector-store.constants.js";
import type {
  EmbeddingProvider,
  VectorPoint,
  VectorStore,
} from "../vector-store/vector-store.types.js";
import {
  INDEXING_JOB_STORE,
  KNOWLEDGE_STORE,
} from "./knowledge.constants.js";
import { KnowledgeChunkerService } from "./knowledge-chunker.service.js";
import type {
  IndexingJob,
  IndexingJobStore,
  IngestKnowledgeInput,
  KnowledgeDocument,
  KnowledgeIngestResult,
  RunIndexingJobResult,
  KnowledgeSearchResult,
  KnowledgeStore,
  RetrieveKnowledgeInput,
  RetrievedKnowledgeContext,
} from "./rag.types.js";

const VECTOR_CANDIDATE_MULTIPLIER = 3;
const INDEXING_BATCH_SIZE = 64;

export type RagStatus = {
  enabled: boolean;
  store: string;
  retrievalMode: string;
  vectorIndexing: {
    enabled: boolean;
    collection: string;
    embeddingModel: string;
    dimensions: number;
  };
  pipeline: string[];
};

@Injectable()
export class RagService {
  constructor(
    @Inject(KnowledgeChunkerService)
    private readonly chunker: KnowledgeChunkerService,
    @Inject(KNOWLEDGE_STORE) private readonly store: KnowledgeStore,
    @Inject(INDEXING_JOB_STORE)
    private readonly indexingJobs: IndexingJobStore,
    @Inject(EMBEDDING_PROVIDER)
    private readonly embeddingProvider: EmbeddingProvider,
    @Inject(VECTOR_STORE) private readonly vectorStore: VectorStore,
    @Inject(ObservabilityService)
    private readonly observability: ObservabilityService,
  ) {}

  async ingest(input: IngestKnowledgeInput): Promise<KnowledgeIngestResult> {
    const document = this.chunker.createDocument(input);
    const chunks = this.chunker.chunk(document);
    const result = { document, chunks };
    await this.store.saveDocument(result);
    await this.indexChunks(result.chunks);
    return result;
  }

  listDocuments(tenantId: string): Promise<KnowledgeDocument[]> {
    return this.store.listDocuments(tenantId);
  }

  async deleteDocument(tenantId: string, documentId: string): Promise<void> {
    const chunkIds = await this.store.deleteDocument(tenantId, documentId);
    if (chunkIds.length > 0) {
      await this.vectorStore.delete(chunkIds);
    }
  }

  async createReindexJob(input: {
    tenantId: string;
    userId: string;
    maxAttempts: number;
  }): Promise<IndexingJob> {
    const job = await this.indexingJobs.create({
      tenantId: input.tenantId,
      userId: input.userId,
      type: "tenant_reindex",
      maxAttempts: input.maxAttempts,
      metadata: {
        collection: this.vectorStore.getCollectionName(),
        embeddingModel: this.embeddingProvider.getModel(),
        dimensions: this.embeddingProvider.getDimension(),
        vectorStoreEnabled: this.vectorStore.isEnabled(),
      },
    });

    return job;
  }

  listIndexingJobs(tenantId: string): Promise<IndexingJob[]> {
    return this.indexingJobs.list(tenantId);
  }

  getIndexingJob(
    tenantId: string,
    jobId: string,
  ): Promise<IndexingJob | undefined> {
    return this.indexingJobs.get(tenantId, jobId);
  }

  findExpiredIndexingJobs(now: Date): Promise<IndexingJob[]> {
    return this.indexingJobs.findExpiredRunningJobs(now);
  }

  acquireIndexingJobLease(input: {
    tenantId: string;
    jobId: string;
    workerId: string;
    leaseUntil: Date;
  }): Promise<IndexingJob | undefined> {
    return this.indexingJobs.acquireLease(input);
  }

  releaseIndexingJobLease(job: IndexingJob): Promise<void> {
    return this.indexingJobs.releaseLease(job.tenantId, job.id);
  }

  incrementIndexingJobAttempts(job: IndexingJob): Promise<IndexingJob | undefined> {
    return this.indexingJobs.incrementAttempts(job.tenantId, job.id);
  }

  heartbeatIndexingJob(input: {
    job: IndexingJob;
    workerId: string;
    leaseUntil: Date;
  }): Promise<void> {
    return this.indexingJobs.heartbeat({
      tenantId: input.job.tenantId,
      jobId: input.job.id,
      workerId: input.workerId,
      leaseUntil: input.leaseUntil,
    });
  }

  cancelIndexingJob(
    tenantId: string,
    jobId: string,
  ): Promise<IndexingJob | undefined> {
    return this.indexingJobs.cancel(tenantId, jobId);
  }

  async deadLetterIndexingJob(job: IndexingJob, error: string): Promise<void> {
    await this.indexingJobs.markDeadLettered(
      job.tenantId,
      job.id,
      error,
      {
        ...this.indexingMetadata(job),
        deadLettered: true,
      },
    );
  }

  replayDeadLetterIndexingJob(
    tenantId: string,
    jobId: string,
  ): Promise<IndexingJob | undefined> {
    return this.indexingJobs.replayDeadLetter(tenantId, jobId);
  }

  recordIndexingAdminAction(input: {
    tenantId: string;
    userId: string;
    action: string;
    jobId?: string;
    result: string;
  }): void {
    const event: Parameters<ObservabilityService["record"]>[0] = {
      requestId: `indexing-admin-${crypto.randomUUID()}`,
      type: "rag.indexing.admin",
      tenantId: input.tenantId,
      userId: input.userId,
      attributes: {
        action: input.action,
        jobId: input.jobId ?? null,
        result: input.result,
      },
    };
    this.observability.record(event);
  }

  recordIndexingRecoveryAction(input: {
    workerId: string;
    promotedDelayed: number;
    claimedPending: number;
    requeuedExpired: number;
    result: "completed" | "failed";
    error?: string;
  }): void {
    const attributes: Parameters<ObservabilityService["record"]>[0]["attributes"] = {
      workerId: input.workerId,
      promotedDelayed: input.promotedDelayed,
      claimedPending: input.claimedPending,
      requeuedExpired: input.requeuedExpired,
      result: input.result,
      error: input.error ?? null,
    };
    this.observability.record({
      requestId: `indexing-recovery-${crypto.randomUUID()}`,
      type: "rag.indexing.recovery",
      attributes,
    });
  }

  async runReindexJob(job: IndexingJob): Promise<RunIndexingJobResult> {
    const metadata = this.indexingMetadata(job);
    try {
      const latest = await this.indexingJobs.get(job.tenantId, job.id);
      if (latest?.status === "cancelled") {
        return {
          status: "skipped",
          processedChunks: latest.processedChunks,
          totalChunks: latest.totalChunks,
        };
      }

      if (!this.vectorStore.isEnabled()) {
        await this.indexingJobs.markCompleted(job.tenantId, job.id, 0, {
          ...metadata,
          skippedReason: "vector_store_disabled",
        });
        this.recordIndexingTrace(job, "rag.indexing.completed", {
          status: "skipped",
          processedChunks: 0,
          totalChunks: 0,
        });
        return {
          status: "skipped",
          processedChunks: 0,
          totalChunks: 0,
        };
      }

      const chunks = await this.store.listChunks(job.tenantId);
      await this.indexingJobs.markRunning(job.tenantId, job.id, chunks.length);
      await this.vectorStore.ensureCollection();
      await this.vectorStore.ensurePayloadIndexes();

      let processedChunks = 0;
      for (let index = 0; index < chunks.length; index += INDEXING_BATCH_SIZE) {
        const current = await this.indexingJobs.get(job.tenantId, job.id);
        if (current?.status === "cancelled") {
          return {
            status: "skipped",
            processedChunks: current.processedChunks,
            totalChunks: current.totalChunks,
          };
        }
        const batch = chunks.slice(index, index + INDEXING_BATCH_SIZE);
        await this.indexChunks(batch);
        processedChunks += batch.length;
        await this.indexingJobs.markProgress(
          job.tenantId,
          job.id,
          processedChunks,
        );
      }

      await this.indexingJobs.markCompleted(job.tenantId, job.id, processedChunks, {
        ...metadata,
        totalChunks: chunks.length,
      });
      this.recordIndexingTrace(job, "rag.indexing.completed", {
        status: "completed",
        processedChunks,
        totalChunks: chunks.length,
      });
      return {
        status: "completed",
        processedChunks,
        totalChunks: chunks.length,
      };
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Unknown indexing error";
      const current = await this.indexingJobs.get(job.tenantId, job.id);
      const processedChunks = current?.processedChunks ?? 0;
      await this.indexingJobs.markFailed(
        job.tenantId,
        job.id,
        processedChunks,
        Math.max(1, (current?.totalChunks ?? 0) - processedChunks),
        errorMessage,
        {
          ...metadata,
          errorName: error instanceof Error ? error.name : "UnknownError",
        },
      );
      this.recordIndexingTrace(job, "rag.indexing.failed", {
        status: "failed",
        processedChunks,
        totalChunks: current?.totalChunks ?? 0,
        errorMessage,
      });
      return {
        status: "failed",
        processedChunks,
        totalChunks: current?.totalChunks ?? 0,
        error: errorMessage,
      };
    }
  }

  async retrieve(input: RetrieveKnowledgeInput): Promise<KnowledgeSearchResult[]> {
    const keywordResults = await this.store.search(input);
    if (!this.vectorStore.isEnabled()) {
      return keywordResults.map((result) => ({
        ...result,
        retrievalMode: "keyword",
        scores: {
          keyword: result.score,
        },
      }));
    }

    const vectorResults = await this.retrieveVectorWithFallback(input);
    if (vectorResults.length === 0) {
      return keywordResults.map((result) => ({
        ...result,
        retrievalMode: "keyword",
        scores: {
          keyword: result.score,
        },
      }));
    }

    return this.mergeHybridResults(
      keywordResults,
      vectorResults,
      input.limit ?? 5,
    );
  }

  async retrieveAsContextMessages(
    input: RetrieveKnowledgeInput,
  ): Promise<ModelMessage[]> {
    const context = await this.retrieveAsContext(input);
    return context.messages;
  }

  async retrieveAsContext(
    input: RetrieveKnowledgeInput,
  ): Promise<RetrievedKnowledgeContext> {
    const results = await this.retrieve(input);
    if (results.length === 0) {
      return {
        messages: [],
        sources: [],
        results: [],
      };
    }

    return {
      messages: [
        {
          role: "system",
          content: this.formatResults(results),
        },
      ],
      sources: results.map((result, index) => ({
        id: result.chunk.id,
        metadata: {
          documentId: result.chunk.documentId,
          chunkId: result.chunk.id,
          chunkIndex: result.chunk.index,
          title: result.chunk.title,
          sourceType: result.chunk.sourceType,
          sourceUri: result.chunk.sourceUri ?? null,
          score: result.score,
          retrievalMode: result.retrievalMode ?? "keyword",
          matchedTerms: result.matchedTerms.join(", "),
          citationIndex: index + 1,
          tags: result.chunk.tags.join(", "),
        },
      })),
      results,
    };
  }

  getStatus(): RagStatus {
    return {
      enabled: true,
      store: "postgres",
      retrievalMode: "keyword",
      vectorIndexing: {
        enabled: this.vectorStore.isEnabled(),
        collection: this.vectorStore.getCollectionName(),
        embeddingModel: this.embeddingProvider.getModel(),
        dimensions: this.embeddingProvider.getDimension(),
      },
      pipeline: [
        "document ingestion",
        "chunking",
        "embedding",
        "vector indexing",
        "keyword retrieval",
        "source citation",
        "tenant filtering",
      ],
    };
  }

  private async indexChunks(
    chunks: KnowledgeIngestResult["chunks"],
  ): Promise<void> {
    if (!this.vectorStore.isEnabled() || chunks.length === 0) {
      return;
    }

    const vectors = await this.embeddingProvider.embedMany(
      chunks.map((chunk) => `${chunk.title}\n${chunk.content}`),
    );
    const points: VectorPoint[] = chunks.map((chunk, index) => ({
      id: chunk.id,
      vector: vectors[index] ?? [],
      payload: {
        tenantId: chunk.tenantId,
        documentId: chunk.documentId,
        chunkId: chunk.id,
        title: chunk.title,
        sourceType: chunk.sourceType,
        sourceUri: chunk.sourceUri ?? null,
        tags: chunk.tags,
        chunkIndex: chunk.index,
        tokenEstimate: chunk.tokenEstimate,
      },
    }));

    await this.vectorStore.upsert(points);
  }

  private async retrieveVector(
    input: RetrieveKnowledgeInput,
  ): Promise<KnowledgeSearchResult[]> {
    const [queryVector] = await this.embeddingProvider.embedMany([input.query]);
    if (!queryVector) {
      return [];
    }

    const vectorLimit = Math.max(
      input.limit ?? 5,
      (input.limit ?? 5) * VECTOR_CANDIDATE_MULTIPLIER,
    );
    const vectorResults = await this.vectorStore.search({
      vector: queryVector,
      limit: vectorLimit,
      filter: this.toVectorFilter(input),
    });
    if (vectorResults.length === 0) {
      return [];
    }

    const chunks = await this.store.findChunksByIds(
      input.tenantId,
      vectorResults.map((result) => result.id),
    );
    const chunksById = new Map(chunks.map((chunk) => [chunk.id, chunk]));
    const requiredTags = input.tags ?? [];

    return vectorResults
      .map((result) => {
        const chunk = chunksById.get(result.id);
        if (!chunk) {
          return undefined;
        }
        if (!requiredTags.every((tag) => chunk.tags.includes(tag))) {
          return undefined;
        }
        const searchResult: KnowledgeSearchResult = {
          chunk,
          score: result.score,
          matchedTerms: [],
          retrievalMode: "vector" as const,
          scores: {
            vector: result.score,
          },
        };
        return searchResult;
      })
      .filter((result): result is KnowledgeSearchResult => Boolean(result));
  }

  private mergeHybridResults(
    keywordResults: KnowledgeSearchResult[],
    vectorResults: KnowledgeSearchResult[],
    limit: number,
  ): KnowledgeSearchResult[] {
    const merged = new Map<string, KnowledgeSearchResult>();

    for (const result of keywordResults) {
      merged.set(result.chunk.id, {
        ...result,
        retrievalMode: "keyword",
        scores: {
          keyword: result.score,
        },
      });
    }

    for (const result of vectorResults) {
      const existing = merged.get(result.chunk.id);
      if (!existing) {
        merged.set(result.chunk.id, result);
        continue;
      }

      merged.set(result.chunk.id, {
        chunk: existing.chunk,
        score: existing.score + result.score,
        matchedTerms: existing.matchedTerms,
        retrievalMode: "hybrid",
        scores: {
          keyword: existing.scores?.keyword ?? existing.score,
          vector: result.scores?.vector ?? result.score,
        },
      });
    }

    return [...merged.values()]
      .map((result) => ({
        ...result,
        score:
          (result.scores?.keyword ?? 0) * 1 +
          (result.scores?.vector ?? 0) * 4,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }

  private toVectorFilter(input: RetrieveKnowledgeInput): Record<string, unknown> {
    const must: Array<Record<string, unknown>> = [
      {
        key: "tenantId",
        match: {
          value: input.tenantId,
        },
      },
    ];

    for (const tag of input.tags ?? []) {
      must.push({
        key: "tags",
        match: {
          value: tag,
        },
      });
    }

    return { must };
  }

  private async retrieveVectorWithFallback(
    input: RetrieveKnowledgeInput,
  ): Promise<KnowledgeSearchResult[]> {
    try {
      return await this.retrieveVector(input);
    } catch (error) {
      this.recordVectorFallback(input, error);
      return [];
    }
  }

  private recordVectorFallback(
    input: RetrieveKnowledgeInput,
    error: unknown,
  ): void {
    const event: Parameters<ObservabilityService["record"]>[0] = {
      requestId: input.requestId ?? `rag-${crypto.randomUUID()}`,
      type: "rag.vector.failed",
      tenantId: input.tenantId,
      attributes: {
        queryLength: input.query.length,
        requestedLimit: input.limit ?? 5,
        tagCount: input.tags?.length ?? 0,
        vectorStore: this.vectorStore.getCollectionName(),
        embeddingModel: this.embeddingProvider.getModel(),
        errorName: error instanceof Error ? error.name : "UnknownError",
        errorMessage: error instanceof Error ? error.message : "Unknown error",
        fallbackMode: "keyword",
      },
    };
    if (input.userId) {
      event.userId = input.userId;
    }
    this.observability.record(event);
  }

  private indexingMetadata(job: IndexingJob): Record<string, unknown> {
    return {
      ...job.metadata,
      collection: this.vectorStore.getCollectionName(),
      embeddingModel: this.embeddingProvider.getModel(),
      dimensions: this.embeddingProvider.getDimension(),
      vectorStoreEnabled: this.vectorStore.isEnabled(),
    };
  }

  private recordIndexingTrace(
    job: IndexingJob,
    type: "rag.indexing.completed" | "rag.indexing.failed",
    attributes: Record<string, string | number | boolean | null>,
  ): void {
    const event: Parameters<ObservabilityService["record"]>[0] = {
      requestId: `indexing-${job.id}`,
      type,
      tenantId: job.tenantId,
      attributes: {
        jobId: job.id,
        jobType: job.type,
        collection: this.vectorStore.getCollectionName(),
        embeddingModel: this.embeddingProvider.getModel(),
        dimensions: this.embeddingProvider.getDimension(),
        ...attributes,
      },
    };
    if (job.createdBy) {
      event.userId = job.createdBy;
    }
    this.observability.record(event);
  }

  private formatResults(results: KnowledgeSearchResult[]): string {
    const lines = [
      "Retrieved enterprise knowledge. Use it only when relevant and cite the source title:",
    ];

    for (const [index, result] of results.entries()) {
      const source = result.chunk.sourceUri
        ? `${result.chunk.title} (${result.chunk.sourceUri})`
        : result.chunk.title;
      lines.push(
        [
          `[${index + 1}] ${source}`,
          `Score: ${result.score}`,
          `Matched terms: ${result.matchedTerms.join(", ") || "none"}`,
          `Content: ${result.chunk.content}`,
        ].join("\n"),
      );
    }

    return lines.join("\n\n");
  }
}
