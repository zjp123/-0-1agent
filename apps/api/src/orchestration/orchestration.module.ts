import { Module } from "@nestjs/common";

import { AgentRuntimeModule } from "../agent-runtime/agent-runtime.module.js";
import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../db/database.module.js";
import { ObservabilityModule } from "../observability/observability.module.js";
import { OrchestrationController } from "./orchestration.controller.js";
import { OrchestrationService } from "./orchestration.service.js";

@Module({
  imports: [AuthModule, DatabaseModule, AgentRuntimeModule, ObservabilityModule],
  controllers: [OrchestrationController],
  providers: [OrchestrationService],
  exports: [OrchestrationService],
})
export class OrchestrationModule {}
