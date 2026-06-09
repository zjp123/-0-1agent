import { Injectable } from "@nestjs/common";

import type { ModelMessage } from "../model-gateway/model-gateway.types.js";
import { InMemoryKnowledgeStore } from "./in-memory-knowledge.store.js";
import { KnowledgeChunkerService } from "./knowledge-chunker.service.js";
import type {
  IngestKnowledgeInput,
  KnowledgeDocument,
  KnowledgeIngestResult,
  KnowledgeSearchResult,
  RetrieveKnowledgeInput,
} from "./rag.types.js";

export type RagStatus = {
  enabled: boolean;
  store: string;
  retrievalMode: string;
  pipeline: string[];
};

@Injectable()
export class RagService {
  constructor(
    private readonly chunker: KnowledgeChunkerService,
    private readonly store: InMemoryKnowledgeStore,
  ) {}

  async ingest(input: IngestKnowledgeInput): Promise<KnowledgeIngestResult> {
    const document = this.chunker.createDocument(input);
    const chunks = this.chunker.chunk(document);
    const result = { document, chunks };
    await this.store.saveDocument(result);
    return result;
  }

  listDocuments(tenantId: string): Promise<KnowledgeDocument[]> {
    return this.store.listDocuments(tenantId);
  }

  retrieve(input: RetrieveKnowledgeInput): Promise<KnowledgeSearchResult[]> {
    return this.store.search(input);
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
      store: "in-memory",
      retrievalMode: "keyword",
      pipeline: [
        "document ingestion",
        "chunking",
        "embedding planned",
        "keyword retrieval",
        "source citation",
        "tenant filtering",
      ],
    };
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
