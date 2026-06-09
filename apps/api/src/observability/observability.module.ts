import { Module } from "@nestjs/common";

import { InMemoryTraceStore } from "./in-memory-trace.store.js";
import { ObservabilityController } from "./observability.controller.js";
import { ObservabilityService } from "./observability.service.js";

@Module({
  controllers: [ObservabilityController],
  providers: [InMemoryTraceStore, ObservabilityService],
  exports: [ObservabilityService],
})
export class ObservabilityModule {}
