import { Injectable } from "@nestjs/common";

import type {
  KnowledgeDocument,
  KnowledgeIngestResult,
  KnowledgeSearchResult,
  KnowledgeStore,
  RetrieveKnowledgeInput,
} from "./rag.types.js";

@Injectable()
export class InMemoryKnowledgeStore implements KnowledgeStore {
  private readonly documents = new Map<string, KnowledgeDocument>();
  private readonly chunksByTenant = new Map<string, KnowledgeIngestResult["chunks"]>();

  async saveDocument(result: KnowledgeIngestResult): Promise<void> {
    this.documents.set(result.document.id, result.document);
    const chunks = this.chunksByTenant.get(result.document.tenantId) ?? [];
    chunks.push(...result.chunks);
    this.chunksByTenant.set(result.document.tenantId, chunks);
  }

  async listDocuments(tenantId: string): Promise<KnowledgeDocument[]> {
    return [...this.documents.values()].filter(
      (document) => document.tenantId === tenantId,
    );
  }

  async listChunks(tenantId: string): Promise<KnowledgeIngestResult["chunks"]> {
    return this.chunksByTenant.get(tenantId) ?? [];
  }

  async search(input: RetrieveKnowledgeInput): Promise<KnowledgeSearchResult[]> {
    const terms = this.tokenize(input.query);
    if (terms.length === 0) {
      return [];
    }

    const requiredTags = input.tags ?? [];
    const chunks = this.chunksByTenant.get(input.tenantId) ?? [];
    const results = chunks
      .filter((chunk) =>
        requiredTags.every((tag) => chunk.tags.includes(tag)),
      )
      .map((chunk) => {
        const haystack = `${chunk.title} ${chunk.content} ${chunk.tags.join(" ")}`.toLowerCase();
        const matchedTerms = terms.filter((term) => haystack.includes(term));
        const titleBoost = terms.filter((term) =>
          chunk.title.toLowerCase().includes(term),
        ).length;
        return {
          chunk,
          matchedTerms,
          score: matchedTerms.length + titleBoost * 2,
        };
      })
      .filter((result) => result.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, input.limit ?? 5);

    return results;
  }

  async findChunksByIds(
    tenantId: string,
    chunkIds: string[],
  ): Promise<KnowledgeIngestResult["chunks"]> {
    const requested = new Set(chunkIds);
    return (this.chunksByTenant.get(tenantId) ?? []).filter((chunk) =>
      requested.has(chunk.id),
    );
  }

  async deleteDocument(tenantId: string, documentId: string): Promise<string[]> {
    const document = this.documents.get(documentId);
    if (!document || document.tenantId !== tenantId) {
      return [];
    }

    const allChunks = this.chunksByTenant.get(tenantId) ?? [];
    const deletedChunks = allChunks.filter((chunk) => chunk.documentId === documentId);
    const remainingChunks = allChunks.filter((chunk) => chunk.documentId !== documentId);
    this.chunksByTenant.set(tenantId, remainingChunks);

    this.documents.delete(documentId);

    return deletedChunks.map((chunk) => chunk.id);
  }

  private tokenize(query: string): string[] {
    return [
      ...new Set(
        query
          .toLowerCase()
          .split(/[\s,，。！？!?;；:：、]+/)
          .map((term) => term.trim())
          .filter((term) => term.length > 0),
      ),
    ];
  }
}
