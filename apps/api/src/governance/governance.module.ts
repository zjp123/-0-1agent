import { Module } from "@nestjs/common";

import { ApprovalService } from "./approval.service.js";
import { GovernanceController } from "./governance.controller.js";
import { QuotaService } from "./quota.service.js";
import { RedisRateLimitStore } from "./redis-rate-limit.store.js";

@Module({
  controllers: [GovernanceController],
  providers: [ApprovalService, QuotaService, RedisRateLimitStore],
  exports: [ApprovalService, QuotaService],
})
export class GovernanceModule {}
