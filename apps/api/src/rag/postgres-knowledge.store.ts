import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, inArray } from "drizzle-orm";

import { DRIZZLE_DB } from "../db/database.constants.js";
import type { Database } from "../db/database.types.js";
import { IdentityService } from "../db/identity.service.js";
import { knowledgeChunks, knowledgeDocuments } from "../db/schema.js";
import type {
  KnowledgeChunk,
  KnowledgeDocument,
  KnowledgeIngestResult,
  KnowledgeSearchResult,
  KnowledgeSourceType,
  KnowledgeStore,
  RetrieveKnowledgeInput,
} from "./rag.types.js";

@Injectable()
export class PostgresKnowledgeStore implements KnowledgeStore {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    private readonly identity: IdentityService,
  ) {}

  async saveDocument(result: KnowledgeIngestResult): Promise<void> {
    const tenantId = await this.identity.ensureTenant(result.document.tenantId);
    const [document] = await this.db
      .insert(knowledgeDocuments)
      .values({
        id: result.document.id,
        tenantId,
        title: result.document.title,
        content: result.document.content,
        sourceType: result.document.sourceType,
        sourceUri: result.document.sourceUri,
        tags: result.document.tags,
        createdAt: new Date(result.document.createdAt),
        updatedAt: new Date(result.document.updatedAt),
      })
      .returning();

    if (!document) {
      throw new Error("Failed to save knowledge document");
    }

    if (result.chunks.length > 0) {
      await this.db.insert(knowledgeChunks).values(
        result.chunks.map((chunk) => ({
          id: chunk.id,
          tenantId,
          documentId: document.id,
          chunkIndex: chunk.index,
          content: chunk.content,
          tokenEstimate: chunk.tokenEstimate,
          metadata: {
            title: chunk.title,
            sourceType: chunk.sourceType,
            sourceUri: chunk.sourceUri ?? null,
            tags: chunk.tags,
            externalTenantId: result.document.tenantId,
          },
        })),
      );
    }
  }

  async listDocuments(tenantId: string): Promise<KnowledgeDocument[]> {
    const resolvedTenantId = await this.identity.ensureTenant(tenantId);
    const rows = await this.db
      .select()
      .from(knowledgeDocuments)
      .where(eq(knowledgeDocuments.tenantId, resolvedTenantId))
      .orderBy(desc(knowledgeDocuments.createdAt));

    return rows.map((row) => this.toDocument(row, tenantId));
  }

  async listChunks(tenantId: string): Promise<KnowledgeChunk[]> {
    const resolvedTenantId = await this.identity.ensureTenant(tenantId);
    const rows = await this.db
      .select({
        chunk: knowledgeChunks,
        document: knowledgeDocuments,
      })
      .from(knowledgeChunks)
      .innerJoin(
        knowledgeDocuments,
        eq(knowledgeChunks.documentId, knowledgeDocuments.id),
      )
      .where(eq(knowledgeChunks.tenantId, resolvedTenantId))
      .orderBy(knowledgeChunks.chunkIndex);

    return rows.map((row) => this.toChunk(row.chunk, row.document, tenantId));
  }

  async search(input: RetrieveKnowledgeInput): Promise<KnowledgeSearchResult[]> {
    const terms = this.tokenize(input.query);
    if (terms.length === 0) {
      return [];
    }

    const resolvedTenantId = await this.identity.ensureTenant(input.tenantId);
    const rows = await this.db
      .select({
        chunk: knowledgeChunks,
        document: knowledgeDocuments,
      })
      .from(knowledgeChunks)
      .innerJoin(
        knowledgeDocuments,
        eq(knowledgeChunks.documentId, knowledgeDocuments.id),
      )
      .where(eq(knowledgeChunks.tenantId, resolvedTenantId));

    const requiredTags = input.tags ?? [];
    return rows
      .map((row) => this.toChunk(row.chunk, row.document, input.tenantId))
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
  }

  async findChunksByIds(
    tenantId: string,
    chunkIds: string[],
  ): Promise<KnowledgeChunk[]> {
    if (chunkIds.length === 0) {
      return [];
    }

    const resolvedTenantId = await this.identity.ensureTenant(tenantId);
    const rows = await this.db
      .select({
        chunk: knowledgeChunks,
        document: knowledgeDocuments,
      })
      .from(knowledgeChunks)
      .innerJoin(
        knowledgeDocuments,
        eq(knowledgeChunks.documentId, knowledgeDocuments.id),
      )
      .where(
        and(
          eq(knowledgeChunks.tenantId, resolvedTenantId),
          inArray(knowledgeChunks.id, chunkIds),
        ),
      );

    const byId = new Map(
      rows.map((row) => [
        row.chunk.id,
        this.toChunk(row.chunk, row.document, tenantId),
      ]),
    );
    return chunkIds
      .map((chunkId) => byId.get(chunkId))
      .filter((chunk): chunk is KnowledgeChunk => Boolean(chunk));
  }

  private toDocument(
    row: typeof knowledgeDocuments.$inferSelect,
    externalTenantId: string,
  ): KnowledgeDocument {
    const document: KnowledgeDocument = {
      id: row.id,
      tenantId: externalTenantId,
      title: row.title,
      content: row.content,
      sourceType: row.sourceType as KnowledgeSourceType,
      tags: row.tags,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
    if (row.sourceUri) {
      document.sourceUri = row.sourceUri;
    }
    return document;
  }

  private toChunk(
    chunk: typeof knowledgeChunks.$inferSelect,
    document: typeof knowledgeDocuments.$inferSelect,
    externalTenantId: string,
  ): KnowledgeChunk {
    const result: KnowledgeChunk = {
      id: chunk.id,
      documentId: document.id,
      tenantId: externalTenantId,
      content: chunk.content,
      index: chunk.chunkIndex,
      tokenEstimate: chunk.tokenEstimate,
      title: document.title,
      sourceType: document.sourceType as KnowledgeSourceType,
      tags: document.tags,
    };
    if (document.sourceUri) {
      result.sourceUri = document.sourceUri;
    }
    return result;
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
