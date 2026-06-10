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
import { KNOWLEDGE_STORE } from "./knowledge.constants.js";
import { KnowledgeChunkerService } from "./knowledge-chunker.service.js";
import type {
  IngestKnowledgeInput,
  KnowledgeDocument,
  KnowledgeIngestResult,
  KnowledgeReindexResult,
  KnowledgeSearchResult,
  KnowledgeStore,
  RetrieveKnowledgeInput,
} from "./rag.types.js";

const VECTOR_CANDIDATE_MULTIPLIER = 3;

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
    private readonly chunker: KnowledgeChunkerService,
    @Inject(KNOWLEDGE_STORE) private readonly store: KnowledgeStore,
    @Inject(EMBEDDING_PROVIDER)
    private readonly embeddingProvider: EmbeddingProvider,
    @Inject(VECTOR_STORE) private readonly vectorStore: VectorStore,
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

  async reindexTenant(tenantId: string): Promise<KnowledgeReindexResult> {
    if (!this.vectorStore.isEnabled()) {
      return {
        tenantId,
        status: "skipped",
        chunkCount: 0,
        vectorStoreEnabled: false,
        collection: this.vectorStore.getCollectionName(),
        embeddingModel: this.embeddingProvider.getModel(),
        dimensions: this.embeddingProvider.getDimension(),
      };
    }

    const chunks = await this.store.listChunks(tenantId);
    await this.vectorStore.ensureCollection();
    await this.vectorStore.ensurePayloadIndexes();
    if (chunks.length > 0) {
      await this.indexChunks(chunks);
    }

    return {
      tenantId,
      status: "completed",
      chunkCount: chunks.length,
      vectorStoreEnabled: true,
      collection: this.vectorStore.getCollectionName(),
      embeddingModel: this.embeddingProvider.getModel(),
      dimensions: this.embeddingProvider.getDimension(),
    };
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
    const results = await this.retrieve(input);
    if (results.length === 0) {
      return [];
    }

    return [
      {
        role: "system",
        content: this.formatResults(results),
      },
    ];
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
