import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../db/database.module.js";
import { ObservabilityModule } from "../observability/observability.module.js";
import { PostgresWorkflowStore } from "./postgres-workflow.store.js";
import { WorkflowSchedulerService } from "./workflow-scheduler.service.js";
import { WORKFLOW_STORE } from "./workflow.constants.js";
import { WorkflowController } from "./workflow.controller.js";
import { WorkflowService } from "./workflow.service.js";

@Module({
  imports: [AuthModule, DatabaseModule, ObservabilityModule],
  controllers: [WorkflowController],
  providers: [
    PostgresWorkflowStore,
    {
      provide: WORKFLOW_STORE,
      useExisting: PostgresWorkflowStore,
    },
    WorkflowService,
    WorkflowSchedulerService,
  ],
  exports: [WorkflowService, WorkflowSchedulerService],
})
export class WorkflowModule {}
