import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";

import { ApiKeyGuard } from "../auth/api-key.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { RequirePermissions } from "../auth/permissions.decorator.js";
import { PermissionsGuard } from "../auth/permissions.guard.js";
import type { RequestUser } from "../auth/auth.types.js";
import {
  AgentCapabilitySnapshot,
  AgentRuntimeService,
} from "./agent-runtime.service.js";
import { RunAgentDto } from "./dto/run-agent.dto.js";
import type { AgentRunOptions, AgentRunResult } from "./agent-runtime.types.js";

@Controller("agent")
export class AgentRuntimeController {
  constructor(private readonly agentRuntime: AgentRuntimeService) {}

  @Get("capabilities")
  getCapabilities(): AgentCapabilitySnapshot {
    return this.agentRuntime.getCapabilitySnapshot();
  }

  @Post("run")
  @UseGuards(ApiKeyGuard, PermissionsGuard)
  @RequirePermissions("agent:run")
  runAgent(
    @Body() body: RunAgentDto,
    @CurrentUser() user: RequestUser,
  ): Promise<AgentRunResult> {
    const options: AgentRunOptions = {
      requestId: body.requestId,
      userMessage: body.message,
      userId: user.userId,
      tenantId: user.tenantId,
      permissions: user.permissions,
    };

    if (body.systemPrompt) {
      options.systemPrompt = body.systemPrompt;
    }
    if (body.messages) {
      options.messages = body.messages;
    }
    if (body.maxSteps !== undefined) {
      options.maxSteps = body.maxSteps;
    }
    if (body.contextMaxTokens !== undefined) {
      options.contextMaxTokens = body.contextMaxTokens;
    }
    if (body.reservedResponseTokens !== undefined) {
      options.reservedResponseTokens = body.reservedResponseTokens;
    }
    if (body.maxDurationMs !== undefined) {
      options.maxDurationMs = body.maxDurationMs;
    }
    if (body.model) {
      options.model = body.model;
    }

    return this.agentRuntime.run(options);
  }
}
