import { Module } from "@nestjs/common";

import { DatabaseModule } from "../db/database.module.js";
import { VectorStoreModule } from "../vector-store/vector-store.module.js";
import { HealthController } from "./health.controller.js";

@Module({
  imports: [DatabaseModule, VectorStoreModule],
  controllers: [HealthController],
})
export class HealthModule {}
