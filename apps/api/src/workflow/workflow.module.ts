import { Module } from "@nestjs/common";

import { InMemoryWorkflowStore } from "./in-memory-workflow.store.js";
import { WorkflowController } from "./workflow.controller.js";
import { WorkflowService } from "./workflow.service.js";

@Module({
  controllers: [WorkflowController],
  providers: [InMemoryWorkflowStore, WorkflowService],
  exports: [WorkflowService],
})
export class WorkflowModule {}
