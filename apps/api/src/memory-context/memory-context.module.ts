import { Module } from "@nestjs/common";

import { MemoryContextService } from "./memory-context.service.js";

@Module({
  providers: [MemoryContextService],
  exports: [MemoryContextService],
})
export class MemoryContextModule {}
