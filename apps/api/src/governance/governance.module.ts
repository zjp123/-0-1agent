import { Module } from "@nestjs/common";

import { GovernanceController } from "./governance.controller.js";
import { QuotaService } from "./quota.service.js";
import { RedisRateLimitStore } from "./redis-rate-limit.store.js";

@Module({
  controllers: [GovernanceController],
  providers: [QuotaService, RedisRateLimitStore],
  exports: [QuotaService],
})
export class GovernanceModule {}
