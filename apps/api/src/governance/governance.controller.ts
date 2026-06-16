import { Body, Controller, Get, Inject, Param, Patch, Post, UseGuards } from "@nestjs/common";

import { ApiKeyGuard } from "../auth/api-key.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { RequirePermissions } from "../auth/permissions.decorator.js";
import { PermissionsGuard } from "../auth/permissions.guard.js";
import type { RequestUser } from "../auth/auth.types.js";
import type {
  ApprovalPolicyResponse,
  ApprovalRequestResponse,
} from "./approval.types.js";
import { ApprovalService } from "./approval.service.js";
import { CreateApprovalPolicyDto } from "./dto/create-approval-policy.dto.js";
import { CreateApprovalRequestDto } from "./dto/create-approval-request.dto.js";
import { DecideApprovalRequestDto } from "./dto/decide-approval-request.dto.js";
import { CreateQuotaPolicyDto } from "./dto/create-quota-policy.dto.js";
import { UpdateQuotaPolicyDto } from "./dto/update-quota-policy.dto.js";
import { QuotaService } from "./quota.service.js";
import type { QuotaPolicy, QuotaUsageEvent } from "./governance.types.js";

@Controller("governance")
@UseGuards(ApiKeyGuard, PermissionsGuard)
@RequirePermissions("auth:manage")
export class GovernanceController {
  constructor(
    @Inject(QuotaService)
    private readonly quota: QuotaService,
    @Inject(ApprovalService)
    private readonly approvals: ApprovalService,
  ) {}

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

  @Get("approval/policies")
  listApprovalPolicies(
    @CurrentUser() user: RequestUser,
  ): Promise<ApprovalPolicyResponse[]> {
    return this.approvals.listPolicies(user);
  }

  @Post("approval/policies")
  createApprovalPolicy(
    @Body() body: CreateApprovalPolicyDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApprovalPolicyResponse> {
    return this.approvals.createPolicy(body, user);
  }

  @Get("approval/requests")
  listApprovalRequests(
    @CurrentUser() user: RequestUser,
  ): Promise<ApprovalRequestResponse[]> {
    return this.approvals.listRequests(user);
  }

  @Post("approval/requests")
  createApprovalRequest(
    @Body() body: CreateApprovalRequestDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApprovalRequestResponse> {
    return this.approvals.createRequest(body, user);
  }

  @Post("approval/requests/:requestId/approve")
  approveApprovalRequest(
    @Param("requestId") requestId: string,
    @Body() body: DecideApprovalRequestDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApprovalRequestResponse> {
    return this.approvals.approveRequest(requestId, body, user);
  }

  @Post("approval/requests/:requestId/reject")
  rejectApprovalRequest(
    @Param("requestId") requestId: string,
    @Body() body: DecideApprovalRequestDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApprovalRequestResponse> {
    return this.approvals.rejectRequest(requestId, body, user);
  }

  @Post("approval/requests/:requestId/cancel")
  cancelApprovalRequest(
    @Param("requestId") requestId: string,
    @Body() body: DecideApprovalRequestDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ApprovalRequestResponse> {
    return this.approvals.cancelRequest(requestId, body, user);
  }
}
