import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../db/database.module.js";
import { TRACE_STORE } from "./observability.constants.js";
import { ObservabilityController } from "./observability.controller.js";
import { ObservabilityService } from "./observability.service.js";
import { PostgresTraceStore } from "./postgres-trace.store.js";

@Module({
  imports: [AuthModule, DatabaseModule],
  controllers: [ObservabilityController],
  providers: [
    PostgresTraceStore,
    {
      provide: TRACE_STORE,
      useExisting: PostgresTraceStore,
    },
    ObservabilityService,
  ],
  exports: [ObservabilityService],
})
export class ObservabilityModule {}
