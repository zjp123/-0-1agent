import { Injectable } from "@nestjs/common";

import type {
  IngestKnowledgeInput,
  KnowledgeChunk,
  KnowledgeDocument,
} from "./rag.types.js";

const DEFAULT_CHUNK_SIZE = 1_200;
const DEFAULT_CHUNK_OVERLAP = 160;

@Injectable()
export class KnowledgeChunkerService {
  createDocument(input: IngestKnowledgeInput): KnowledgeDocument {
    const now = new Date().toISOString();
    const document: KnowledgeDocument = {
      id: crypto.randomUUID(),
      tenantId: input.tenantId,
      title: input.title,
      content: input.content,
      sourceType: input.sourceType ?? "manual",
      tags: input.tags ?? [],
      createdAt: now,
      updatedAt: now,
    };
    if (input.sourceUri) {
      document.sourceUri = input.sourceUri;
    }
    return document;
  }

  chunk(document: KnowledgeDocument): KnowledgeChunk[] {
    const normalized = document.content.replace(/\s+/g, " ").trim();
    if (!normalized) {
      return [];
    }

    const chunks: KnowledgeChunk[] = [];
    let start = 0;
    let index = 0;

    while (start < normalized.length) {
      const end = Math.min(start + DEFAULT_CHUNK_SIZE, normalized.length);
      const content = normalized.slice(start, end).trim();
      if (content) {
        const chunk: KnowledgeChunk = {
          id: crypto.randomUUID(),
          documentId: document.id,
          tenantId: document.tenantId,
          content,
          index,
          tokenEstimate: this.estimateTokens(content),
          title: document.title,
          sourceType: document.sourceType,
          tags: document.tags,
        };
        if (document.sourceUri) {
          chunk.sourceUri = document.sourceUri;
        }
        chunks.push(chunk);
        index += 1;
      }

      if (end >= normalized.length) {
        break;
      }
      start = Math.max(end - DEFAULT_CHUNK_OVERLAP, start + 1);
    }

    return chunks;
  }

  private estimateTokens(text: string): number {
    const asciiWords = text.match(/[A-Za-z0-9_]+/g)?.length ?? 0;
    const cjkChars = text.match(/[\u4e00-\u9fff]/g)?.length ?? 0;
    const nonAsciiChars = [...text.replace(/[A-Za-z0-9_\s\u4e00-\u9fff]/g, "")].length;
    return Math.max(1, Math.ceil(asciiWords * 1.3 + cjkChars + nonAsciiChars));
  }
}
