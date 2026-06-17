import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../db/database.module.js";
import { ObservabilityModule } from "../observability/observability.module.js";
import { EvaluationController } from "./evaluation.controller.js";
import { EVALUATION_STORE } from "./evaluation.constants.js";
import { EvaluationService } from "./evaluation.service.js";
import { PostgresEvaluationStore } from "./postgres-evaluation.store.js";

@Module({
  imports: [AuthModule, DatabaseModule, ObservabilityModule],
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
