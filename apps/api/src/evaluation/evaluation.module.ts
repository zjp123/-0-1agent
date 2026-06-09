import { Module } from "@nestjs/common";

import { EvaluationController } from "./evaluation.controller.js";
import { EvaluationService } from "./evaluation.service.js";
import { InMemoryEvaluationStore } from "./in-memory-evaluation.store.js";

@Module({
  controllers: [EvaluationController],
  providers: [InMemoryEvaluationStore, EvaluationService],
  exports: [EvaluationService],
})
export class EvaluationModule {}
