import { Body, Controller, Get, Post, Query, UseGuards } from "@nestjs/common";

import { ApiKeyGuard } from "../auth/api-key.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { RequirePermissions } from "../auth/permissions.decorator.js";
import { PermissionsGuard } from "../auth/permissions.guard.js";
import type { RequestUser } from "../auth/auth.types.js";
import { IngestKnowledgeDto } from "./dto/ingest-knowledge.dto.js";
import { RetrieveKnowledgeDto } from "./dto/retrieve-knowledge.dto.js";
import { RagService } from "./rag.service.js";
import type {
  KnowledgeDocument,
  KnowledgeIngestResult,
  KnowledgeReindexResult,
  KnowledgeSearchResult,
  IngestKnowledgeInput,
  RetrieveKnowledgeInput,
} from "./rag.types.js";

@Controller("knowledge")
export class RagController {
  constructor(private readonly rag: RagService) {}

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
  reindex(@CurrentUser() user: RequestUser): Promise<KnowledgeReindexResult> {
    return this.rag.reindexTenant(user.tenantId);
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
