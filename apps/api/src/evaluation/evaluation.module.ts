import { Module } from "@nestjs/common";

import { DatabaseModule } from "../db/database.module.js";
import { EvaluationController } from "./evaluation.controller.js";
import { EVALUATION_STORE } from "./evaluation.constants.js";
import { EvaluationService } from "./evaluation.service.js";
import { PostgresEvaluationStore } from "./postgres-evaluation.store.js";

@Module({
  imports: [DatabaseModule],
  controllers: [EvaluationController],
  providers: [
    PostgresEvaluationStore,
    {
      provide: EVALUATION_STORE,
      useExisting: PostgresEvaluationStore,
    },
    EvaluationService,
  ],
  exports: [EvaluationService],
})
export class EvaluationModule {}
