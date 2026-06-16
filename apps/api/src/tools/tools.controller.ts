import { Body, Controller, Get, Inject, Post, UseGuards } from "@nestjs/common";

import { ApiKeyGuard } from "../auth/api-key.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { RequirePermissions } from "../auth/permissions.decorator.js";
import { PermissionsGuard } from "../auth/permissions.guard.js";
import type { RequestUser } from "../auth/auth.types.js";
import { QuotaService } from "../governance/quota.service.js";
import { ExecuteToolDto } from "./dto/execute-tool.dto.js";
import { ToolRegistryService } from "./tool-registry.service.js";
import type {
  ToolCallResponse,
  ToolDefinition,
  ToolExecutionContext,
} from "./tool.types.js";

@Controller("tools")
export class ToolsController {
  constructor(
    @Inject(ToolRegistryService)
    private readonly registry: ToolRegistryService,
    @Inject(QuotaService)
    private readonly quota: QuotaService,
  ) {}

  @Get()
  listTools(): ToolDefinition[] {
    return this.registry.listDefinitions();
  }

  @Post("execute")
  @UseGuards(ApiKeyGuard, PermissionsGuard)
  @RequirePermissions("tools:execute")
  async executeTool(
    @Body() body: ExecuteToolDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ToolCallResponse> {
    await this.quota.enforce({
      tenantId: user.tenantId,
      userId: user.userId,
      action: "tool.execute",
      metadata: { requestId: body.requestId, toolName: body.name },
    });
    const context: ToolExecutionContext = {
      requestId: body.requestId,
      userId: user.userId,
      tenantId: user.tenantId,
      permissions: user.permissions,
    };

    return this.registry.execute({
      name: body.name,
      arguments: body.arguments,
      context,
    });
  }
}
