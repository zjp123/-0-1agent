import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";

import { ApiKeyGuard } from "../auth/api-key.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { RequirePermissions } from "../auth/permissions.decorator.js";
import { PermissionsGuard } from "../auth/permissions.guard.js";
import type { RequestUser } from "../auth/auth.types.js";
import { QuotaService } from "../governance/quota.service.js";
import {
  AgentCapabilitySnapshot,
  AgentRuntimeService,
} from "./agent-runtime.service.js";
import { RunAgentDto } from "./dto/run-agent.dto.js";
import type { AgentRunOptions, AgentRunResult } from "./agent-runtime.types.js";

@Controller("agent")
export class AgentRuntimeController {
  constructor(
    private readonly agentRuntime: AgentRuntimeService,
    private readonly quota: QuotaService,
  ) {}

  @Get("capabilities")
  getCapabilities(): AgentCapabilitySnapshot {
    return this.agentRuntime.getCapabilitySnapshot();
  }

  @Post("run")
  @UseGuards(ApiKeyGuard, PermissionsGuard)
  @RequirePermissions("agent:run")
  async runAgent(
    @Body() body: RunAgentDto,
    @CurrentUser() user: RequestUser,
  ): Promise<AgentRunResult> {
    await this.quota.enforce({
      tenantId: user.tenantId,
      userId: user.userId,
      action: "agent.run",
      metadata: { requestId: body.requestId, model: body.model ?? null },
    });
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

    const result = await this.agentRuntime.run(options);
    if (result.usage.totalTokens > 0) {
      await this.quota.enforce({
        tenantId: user.tenantId,
        userId: user.userId,
        action: "agent.run",
        requestCost: 0,
        tokenCost: result.usage.totalTokens,
        metadata: {
          requestId: body.requestId,
          model: body.model ?? null,
          promptTokens: result.usage.promptTokens,
          completionTokens: result.usage.completionTokens,
        },
      });
    }
    return result;
  }
}
