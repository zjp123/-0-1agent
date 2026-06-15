import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { ApprovalService } from "./approval.service.js";
import { GovernanceController } from "./governance.controller.js";
import { QuotaService } from "./quota.service.js";
import { RedisRateLimitStore } from "./redis-rate-limit.store.js";

@Module({
  imports: [AuthModule],
  controllers: [GovernanceController],
  providers: [ApprovalService, QuotaService, RedisRateLimitStore],
  exports: [ApprovalService, QuotaService],
})
export class GovernanceModule {}
