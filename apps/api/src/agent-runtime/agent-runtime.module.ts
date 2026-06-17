import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { GovernanceModule } from "../governance/governance.module.js";
import { MemoryContextModule } from "../memory-context/memory-context.module.js";
import { ModelGatewayModule } from "../model-gateway/model-gateway.module.js";
import { ObservabilityModule } from "../observability/observability.module.js";
import { RagModule } from "../rag/rag.module.js";
import { ToolsModule } from "../tools/tools.module.js";
import { WorkflowModule } from "../workflow/workflow.module.js";
import { EvaluationModule } from "../evaluation/evaluation.module.js";
import { AgentRuntimeController } from "./agent-runtime.controller.js";
import { AgentRuntimeService } from "./agent-runtime.service.js";
import { EvaluationAgentRunnerService } from "./evaluation-agent-runner.service.js";
import { WorkflowRunExecutorService } from "./workflow-run-executor.service.js";

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
    EvaluationModule,
  ],
  controllers: [AgentRuntimeController],
  providers: [AgentRuntimeService, WorkflowRunExecutorService, EvaluationAgentRunnerService],
  exports: [AgentRuntimeService, WorkflowRunExecutorService, EvaluationAgentRunnerService],
})
export class AgentRuntimeModule {}
