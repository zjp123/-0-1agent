import { Body, Controller, Get, Post, Query } from "@nestjs/common";

import { IngestKnowledgeDto } from "./dto/ingest-knowledge.dto.js";
import { RetrieveKnowledgeDto } from "./dto/retrieve-knowledge.dto.js";
import { RagService } from "./rag.service.js";
import type {
  KnowledgeDocument,
  KnowledgeIngestResult,
  KnowledgeSearchResult,
  IngestKnowledgeInput,
  RetrieveKnowledgeInput,
} from "./rag.types.js";

@Controller("knowledge")
export class RagController {
  constructor(private readonly rag: RagService) {}

  @Post("ingest")
  ingest(@Body() body: IngestKnowledgeDto): Promise<KnowledgeIngestResult> {
    const input: IngestKnowledgeInput = {
      tenantId: body.tenantId,
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
  retrieve(@Body() body: RetrieveKnowledgeDto): Promise<KnowledgeSearchResult[]> {
    return this.rag.retrieve(this.toRetrieveInput(body));
  }

  @Get("documents")
  listDocuments(@Query("tenantId") tenantId: string): Promise<KnowledgeDocument[]> {
    return this.rag.listDocuments(tenantId);
  }

  private toRetrieveInput(body: RetrieveKnowledgeDto): RetrieveKnowledgeInput {
    const input: RetrieveKnowledgeInput = {
      tenantId: body.tenantId,
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
