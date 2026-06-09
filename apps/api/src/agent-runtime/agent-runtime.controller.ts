import { Body, Controller, Get, Post } from "@nestjs/common";

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
  runAgent(@Body() body: RunAgentDto): Promise<AgentRunResult> {
    const options: AgentRunOptions = {
      requestId: body.requestId,
      userMessage: body.message,
      permissions: [],
    };

    if (body.userId) {
      options.userId = body.userId;
    }
    if (body.tenantId) {
      options.tenantId = body.tenantId;
    }
    if (body.systemPrompt) {
      options.systemPrompt = body.systemPrompt;
    }
    if (body.messages) {
      options.messages = body.messages;
    }
    if (body.maxSteps !== undefined) {
      options.maxSteps = body.maxSteps;
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
