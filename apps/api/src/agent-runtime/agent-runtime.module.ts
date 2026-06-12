import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { GovernanceModule } from "../governance/governance.module.js";
import { MemoryContextModule } from "../memory-context/memory-context.module.js";
import { ModelGatewayModule } from "../model-gateway/model-gateway.module.js";
import { ObservabilityModule } from "../observability/observability.module.js";
import { RagModule } from "../rag/rag.module.js";
import { ToolsModule } from "../tools/tools.module.js";
import { WorkflowModule } from "../workflow/workflow.module.js";
import { AgentRuntimeController } from "./agent-runtime.controller.js";
import { AgentRuntimeService } from "./agent-runtime.service.js";

@Module({
  imports: [
    ModelGatewayModule,
    ToolsModule,
    MemoryContextModule,
    RagModule,
    WorkflowModule,
    AuthModule,
    GovernanceModule,
    ObservabilityModule,
  ],
  controllers: [AgentRuntimeController],
  providers: [AgentRuntimeService],
  exports: [AgentRuntimeService],
})
export class AgentRuntimeModule {}
