import { Controller, Get } from "@nestjs/common";

import {
  AgentCapabilitySnapshot,
  AgentRuntimeService,
} from "./agent-runtime.service.js";

@Controller("agent")
export class AgentRuntimeController {
  constructor(private readonly agentRuntime: AgentRuntimeService) {}

  @Get("capabilities")
  getCapabilities(): AgentCapabilitySnapshot {
    return this.agentRuntime.getCapabilitySnapshot();
  }
}
