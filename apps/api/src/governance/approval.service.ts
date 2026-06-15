import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";

import type { RequestUser } from "../auth/auth.types.js";
import { DRIZZLE_DB } from "../db/database.constants.js";
import type { Database } from "../db/database.types.js";
import { IdentityService } from "../db/identity.service.js";
import {
  approvalPolicies,
  approvalRequests,
  authAdminAuditEvents,
} from "../db/schema.js";
import type {
  ApprovalPolicyResponse,
  ApprovalRequestResponse,
  ApprovalStatus,
} from "./approval.types.js";
import type { CreateApprovalPolicyDto } from "./dto/create-approval-policy.dto.js";
import type { CreateApprovalRequestDto } from "./dto/create-approval-request.dto.js";
import type { DecideApprovalRequestDto } from "./dto/decide-approval-request.dto.js";

export type ApprovalRequirementInput = {
  tenantId: string;
  userId: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  approvalId?: string;
};

@Injectable()
export class ApprovalService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    private readonly identity: IdentityService,
  ) {}

  async listPolicies(actor: RequestUser): Promise<ApprovalPolicyResponse[]> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    const rows = await this.db
      .select()
      .from(approvalPolicies)
      .where(eq(approvalPolicies.tenantId, tenantUuid))
      .orderBy(desc(approvalPolicies.createdAt));

    return rows.map((row) => this.toPolicy(row, actor.tenantId));
  }

  async createPolicy(
    body: CreateApprovalPolicyDto,
    actor: RequestUser,
  ): Promise<ApprovalPolicyResponse> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    const [created] = await this.db
      .insert(approvalPolicies)
      .values({
        tenantId: tenantUuid,
        name: body.name.trim(),
        action: body.action.trim(),
        resourceType: body.resourceType.trim(),
        requiredApprovals: body.requiredApprovals ?? 1,
        enabled: body.enabled ?? true,
        metadata: body.metadata ?? {},
      })
      .returning();
    if (!created) {
      throw new Error("Failed to create approval policy");
    }

    await this.recordAudit({
      tenantUuid,
      actor,
      action: "approval.policy.create",
      targetType: "approval_policy",
      targetId: created.id,
      reason: "Create approval policy",
      metadata: {
        action: created.action,
        resourceType: created.resourceType,
      },
    });

    return this.toPolicy(created, actor.tenantId);
  }

  async listRequests(actor: RequestUser): Promise<ApprovalRequestResponse[]> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    const rows = await this.db
      .select()
      .from(approvalRequests)
      .where(eq(approvalRequests.tenantId, tenantUuid))
      .orderBy(desc(approvalRequests.createdAt))
      .limit(100);

    return rows.map((row) => this.toRequest(row, actor.tenantId));
  }

  async createRequest(
    body: CreateApprovalRequestDto,
    actor: RequestUser,
  ): Promise<ApprovalRequestResponse> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    const policy = await this.findPolicy(
      tenantUuid,
      body.action.trim(),
      body.resourceType.trim(),
    );
    const [created] = await this.db
      .insert(approvalRequests)
      .values({
        tenantId: tenantUuid,
        policyId: policy?.id,
        requestedBy: actor.userId,
        action: body.action.trim(),
        resourceType: body.resourceType.trim(),
        resourceId: body.resourceId,
        requiredApprovals: policy?.requiredApprovals ?? 1,
        reason: body.reason,
        payload: body.payload ?? {},
        metadata: body.metadata ?? {},
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      })
      .returning();
    if (!created) {
      throw new Error("Failed to create approval request");
    }

    await this.recordAudit({
      tenantUuid,
      actor,
      action: "approval.request.create",
      targetType: "approval_request",
      targetId: created.id,
      reason: body.reason,
      metadata: {
        action: created.action,
        resourceType: created.resourceType,
        resourceId: created.resourceId,
      },
    });

    return this.toRequest(created, actor.tenantId);
  }

  async approveRequest(
    requestId: string,
    body: DecideApprovalRequestDto,
    actor: RequestUser,
  ): Promise<ApprovalRequestResponse> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    const request = await this.getTenantRequest(tenantUuid, requestId);
    this.assertPending(request);
    if (request.requestedBy === actor.userId) {
      throw new ConflictException("Requester cannot approve their own request");
    }

    const approvals = [...request.approvals];
    if (approvals.some((approval) => approval["actorUserId"] === actor.userId)) {
      throw new ConflictException("Approval already recorded by this actor");
    }
    approvals.push({
      actorUserId: actor.userId,
      actorAuthType: actor.authType,
      comment: body.comment ?? null,
      approvedAt: new Date().toISOString(),
    });
    const status: ApprovalStatus =
      approvals.length >= request.requiredApprovals ? "approved" : "pending";
    const now = new Date();

    const [updated] = await this.db
      .update(approvalRequests)
      .set({
        approvals,
        status,
        decidedAt: status === "approved" ? now : null,
        updatedAt: now,
      })
      .where(
        and(
          eq(approvalRequests.tenantId, tenantUuid),
          eq(approvalRequests.id, requestId),
        ),
      )
      .returning();
    if (!updated) {
      throw new Error("Failed to approve request");
    }

    await this.recordAudit({
      tenantUuid,
      actor,
      action: "approval.request.approve",
      targetType: "approval_request",
      targetId: requestId,
      reason: "Approve request",
      comment: body.comment,
      metadata: {
        status,
        approvalCount: approvals.length,
      },
    });

    return this.toRequest(updated, actor.tenantId);
  }

  async rejectRequest(
    requestId: string,
    body: DecideApprovalRequestDto,
    actor: RequestUser,
  ): Promise<ApprovalRequestResponse> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    const request = await this.getTenantRequest(tenantUuid, requestId);
    this.assertPending(request);
    const now = new Date();

    const [updated] = await this.db
      .update(approvalRequests)
      .set({
        status: "rejected",
        rejectionReason: body.comment ?? "Rejected",
        decidedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(approvalRequests.tenantId, tenantUuid),
          eq(approvalRequests.id, requestId),
        ),
      )
      .returning();
    if (!updated) {
      throw new Error("Failed to reject request");
    }

    await this.recordAudit({
      tenantUuid,
      actor,
      action: "approval.request.reject",
      targetType: "approval_request",
      targetId: requestId,
      reason: "Reject request",
      comment: body.comment,
      metadata: {
        action: request.action,
        resourceType: request.resourceType,
      },
    });

    return this.toRequest(updated, actor.tenantId);
  }

  async cancelRequest(
    requestId: string,
    body: DecideApprovalRequestDto,
    actor: RequestUser,
  ): Promise<ApprovalRequestResponse> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    const request = await this.getTenantRequest(tenantUuid, requestId);
    this.assertPending(request);
    if (request.requestedBy !== actor.userId) {
      throw new ConflictException("Only requester can cancel approval request");
    }
    const now = new Date();

    const [updated] = await this.db
      .update(approvalRequests)
      .set({
        status: "cancelled",
        rejectionReason: body.comment ?? "Cancelled",
        decidedAt: now,
        updatedAt: now,
      })
      .where(
        and(
          eq(approvalRequests.tenantId, tenantUuid),
          eq(approvalRequests.id, requestId),
        ),
      )
      .returning();
    if (!updated) {
      throw new Error("Failed to cancel request");
    }

    await this.recordAudit({
      tenantUuid,
      actor,
      action: "approval.request.cancel",
      targetType: "approval_request",
      targetId: requestId,
      reason: "Cancel request",
      comment: body.comment,
      metadata: {
        action: request.action,
        resourceType: request.resourceType,
      },
    });

    return this.toRequest(updated, actor.tenantId);
  }

  async requireApproval(input: ApprovalRequirementInput): Promise<void> {
    const tenantUuid = await this.identity.ensureTenant(input.tenantId);
    const policy = await this.findPolicy(tenantUuid, input.action, input.resourceType);
    if (!policy) {
      return;
    }
    if (!input.approvalId) {
      throw new ConflictException("Approval is required for this operation");
    }

    const request = await this.getTenantRequest(tenantUuid, input.approvalId);
    if (
      request.action !== input.action ||
      request.resourceType !== input.resourceType ||
      (input.resourceId && request.resourceId && request.resourceId !== input.resourceId)
    ) {
      throw new ConflictException("Approval request does not match operation");
    }
    if (request.requestedBy !== input.userId) {
      throw new ConflictException("Approval requester does not match actor");
    }
    if (request.status !== "approved") {
      throw new ConflictException("Approval request is not approved");
    }
    if (request.expiresAt && request.expiresAt.getTime() <= Date.now()) {
      throw new ConflictException("Approval request expired");
    }
  }

  private async findPolicy(
    tenantUuid: string,
    action: string,
    resourceType: string,
  ): Promise<typeof approvalPolicies.$inferSelect | undefined> {
    const [policy] = await this.db
      .select()
      .from(approvalPolicies)
      .where(
        and(
          eq(approvalPolicies.tenantId, tenantUuid),
          eq(approvalPolicies.action, action),
          eq(approvalPolicies.resourceType, resourceType),
          eq(approvalPolicies.enabled, true),
        ),
      )
      .limit(1);
    return policy;
  }

  private async getTenantRequest(
    tenantUuid: string,
    requestId: string,
  ): Promise<typeof approvalRequests.$inferSelect> {
    const [request] = await this.db
      .select()
      .from(approvalRequests)
      .where(
        and(
          eq(approvalRequests.tenantId, tenantUuid),
          eq(approvalRequests.id, requestId),
        ),
      )
      .limit(1);
    if (!request) {
      throw new NotFoundException("Approval request not found");
    }
    return request;
  }

  private assertPending(request: typeof approvalRequests.$inferSelect): void {
    if (request.status !== "pending") {
      throw new ConflictException("Approval request is not pending");
    }
    if (request.expiresAt && request.expiresAt.getTime() <= Date.now()) {
      throw new ConflictException("Approval request expired");
    }
  }

  private async recordAudit(input: {
    tenantUuid: string;
    actor: RequestUser;
    action: string;
    targetType: string;
    targetId: string;
    reason: string;
    comment?: string | undefined;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    const values: typeof authAdminAuditEvents.$inferInsert = {
      tenantId: input.tenantUuid,
      actorUserId: input.actor.userId,
      actorAuthType: input.actor.authType,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      metadata: input.metadata,
    };
    if (input.actor.tokenId) {
      values.actorTokenId = input.actor.tokenId;
    }
    if (input.comment) {
      values.comment = input.comment;
    }
    await this.db.insert(authAdminAuditEvents).values(values);
  }

  private toPolicy(
    row: typeof approvalPolicies.$inferSelect,
    externalTenantId: string,
  ): ApprovalPolicyResponse {
    return {
      id: row.id,
      tenantId: externalTenantId,
      name: row.name,
      action: row.action,
      resourceType: row.resourceType,
      requiredApprovals: row.requiredApprovals,
      enabled: row.enabled,
      metadata: row.metadata,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  }

  private toRequest(
    row: typeof approvalRequests.$inferSelect,
    externalTenantId: string,
  ): ApprovalRequestResponse {
    const response: ApprovalRequestResponse = {
      id: row.id,
      tenantId: externalTenantId,
      requestedBy: row.requestedBy,
      action: row.action,
      resourceType: row.resourceType,
      status: row.status as ApprovalStatus,
      requiredApprovals: row.requiredApprovals,
      approvals: row.approvals,
      reason: row.reason,
      payload: row.payload,
      metadata: row.metadata,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
    if (row.policyId) {
      response.policyId = row.policyId;
    }
    if (row.resourceId) {
      response.resourceId = row.resourceId;
    }
    if (row.rejectionReason) {
      response.rejectionReason = row.rejectionReason;
    }
    if (row.expiresAt) {
      response.expiresAt = row.expiresAt.toISOString();
    }
    if (row.decidedAt) {
      response.decidedAt = row.decidedAt.toISOString();
    }
    return response;
  }
}
