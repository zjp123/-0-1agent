import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";

import { AgentRuntimeModule } from "./agent-runtime/agent-runtime.module.js";
import { AppController } from "./app.controller.js";
import { AuthModule } from "./auth/auth.module.js";
import { configuration } from "./common/config/configuration.js";
import { validateEnv } from "./common/config/validate-env.js";
import { DatabaseModule } from "./db/database.module.js";
import { EvaluationModule } from "./evaluation/evaluation.module.js";
import { HealthModule } from "./health/health.module.js";
import { MemoryContextModule } from "./memory-context/memory-context.module.js";
import { ModelGatewayModule } from "./model-gateway/model-gateway.module.js";
import { ObservabilityModule } from "./observability/observability.module.js";
import { RagModule } from "./rag/rag.module.js";
import { ToolsModule } from "./tools/tools.module.js";
import { WorkflowModule } from "./workflow/workflow.module.js";

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [configuration],
      validate: validateEnv,
    }),
    DatabaseModule,
    HealthModule,
    ModelGatewayModule,
    AgentRuntimeModule,
    ToolsModule,
    MemoryContextModule,
    RagModule,
    WorkflowModule,
    AuthModule,
    ObservabilityModule,
    EvaluationModule,
  ],
  controllers: [AppController],
})
export class AppModule {}
