import { Body, Controller, Get, Post } from "@nestjs/common";

import { ExecuteToolDto } from "./dto/execute-tool.dto.js";
import { ToolRegistryService } from "./tool-registry.service.js";
import type {
  ToolCallResponse,
  ToolDefinition,
  ToolExecutionContext,
} from "./tool.types.js";

@Controller("tools")
export class ToolsController {
  constructor(private readonly registry: ToolRegistryService) {}

  @Get()
  listTools(): ToolDefinition[] {
    return this.registry.listDefinitions();
  }

  @Post("execute")
  executeTool(@Body() body: ExecuteToolDto): Promise<ToolCallResponse> {
    const context: ToolExecutionContext = {
      requestId: body.requestId,
      permissions: [],
    };
    if (body.userId) {
      context.userId = body.userId;
    }
    if (body.tenantId) {
      context.tenantId = body.tenantId;
    }

    return this.registry.execute({
      name: body.name,
      arguments: body.arguments,
      context,
    });
  }
}
