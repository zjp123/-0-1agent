import { Injectable } from "@nestjs/common";

import { AuthService } from "../auth/auth.service.js";
import { MemoryContextService } from "../memory-context/memory-context.service.js";
import { ModelGatewayService } from "../model-gateway/model-gateway.service.js";
import { ObservabilityService } from "../observability/observability.service.js";
import { RagService } from "../rag/rag.service.js";
import { ToolRegistryService } from "../tools/tool-registry.service.js";
import { WorkflowService } from "../workflow/workflow.service.js";

export type AgentCapabilitySnapshot = {
  runtime: {
    strategies: string[];
    controls: string[];
  };
  modelGateway: ReturnType<ModelGatewayService["getStatus"]>;
  tools: ReturnType<ToolRegistryService["getStatus"]>;
  memoryContext: ReturnType<MemoryContextService["getStatus"]>;
  rag: ReturnType<RagService["getStatus"]>;
  workflow: ReturnType<WorkflowService["getStatus"]>;
  auth: ReturnType<AuthService["getStatus"]>;
  observability: ReturnType<ObservabilityService["getStatus"]>;
};

@Injectable()
export class AgentRuntimeService {
  constructor(
    private readonly modelGateway: ModelGatewayService,
    private readonly tools: ToolRegistryService,
    private readonly memoryContext: MemoryContextService,
    private readonly rag: RagService,
    private readonly workflow: WorkflowService,
    private readonly auth: AuthService,
    private readonly observability: ObservabilityService,
  ) {}

  getCapabilitySnapshot(): AgentCapabilitySnapshot {
    return {
      runtime: {
        strategies: ["ReAct", "Plan/Execute", "Reflection"],
        controls: [
          "max steps",
          "max duration",
          "tool error recovery",
          "loop termination",
          "task state tracking",
        ],
      },
      modelGateway: this.modelGateway.getStatus(),
      tools: this.tools.getStatus(),
      memoryContext: this.memoryContext.getStatus(),
      rag: this.rag.getStatus(),
      workflow: this.workflow.getStatus(),
      auth: this.auth.getStatus(),
      observability: this.observability.getStatus(),
    };
  }
}
