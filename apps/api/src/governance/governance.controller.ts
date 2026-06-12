import { Body, Controller, Get, Param, Patch, Post, UseGuards } from "@nestjs/common";

import { ApiKeyGuard } from "../auth/api-key.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { RequirePermissions } from "../auth/permissions.decorator.js";
import { PermissionsGuard } from "../auth/permissions.guard.js";
import type { RequestUser } from "../auth/auth.types.js";
import { CreateQuotaPolicyDto } from "./dto/create-quota-policy.dto.js";
import { UpdateQuotaPolicyDto } from "./dto/update-quota-policy.dto.js";
import { QuotaService } from "./quota.service.js";
import type { QuotaPolicy, QuotaUsageEvent } from "./governance.types.js";

@Controller("governance")
@UseGuards(ApiKeyGuard, PermissionsGuard)
@RequirePermissions("auth:manage")
export class GovernanceController {
  constructor(private readonly quota: QuotaService) {}

  @Get("quota/policies")
  listPolicies(@CurrentUser() user: RequestUser): Promise<QuotaPolicy[]> {
    return this.quota.listPolicies(user);
  }

  @Post("quota/policies")
  createPolicy(
    @Body() body: CreateQuotaPolicyDto,
    @CurrentUser() user: RequestUser,
  ): Promise<QuotaPolicy> {
    return this.quota.createPolicy(body, user);
  }

  @Patch("quota/policies/:policyId")
  updatePolicy(
    @Param("policyId") policyId: string,
    @Body() body: UpdateQuotaPolicyDto,
    @CurrentUser() user: RequestUser,
  ): Promise<QuotaPolicy> {
    return this.quota.updatePolicy(policyId, body, user);
  }

  @Get("quota/events")
  listUsageEvents(
    @CurrentUser() user: RequestUser,
  ): Promise<QuotaUsageEvent[]> {
    return this.quota.listUsageEvents(user);
  }
}
