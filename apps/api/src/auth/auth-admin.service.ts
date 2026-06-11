import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";
import crypto from "node:crypto";

import { DRIZZLE_DB } from "../db/database.constants.js";
import type { Database } from "../db/database.types.js";
import { IdentityService } from "../db/identity.service.js";
import {
  authAdminAuditEvents,
  authRoles,
  authServiceTokens,
  authUserRoles,
} from "../db/schema.js";
import type { AssignUserRoleDto } from "./dto/assign-user-role.dto.js";
import type { AuthAdminReasonDto } from "./dto/auth-admin-common.dto.js";
import type { CreateAuthRoleDto } from "./dto/create-auth-role.dto.js";
import type { CreateServiceTokenDto } from "./dto/create-service-token.dto.js";
import type { UpdateAuthRoleDto } from "./dto/update-auth-role.dto.js";
import type { UpdateServiceTokenDto } from "./dto/update-service-token.dto.js";
import type { Permission, RequestUser, Role } from "./auth.types.js";

export type AuthRoleResponse = {
  id: string;
  tenantId: string;
  name: string;
  permissions: Permission[];
  description?: string;
  createdAt: string;
  updatedAt: string;
};

export type UserRoleAssignmentResponse = {
  id: string;
  tenantId: string;
  userId: string;
  role: AuthRoleResponse;
  createdAt: string;
};

export type ServiceTokenResponse = {
  id: string;
  tenantId: string;
  name: string;
  roles: Role[];
  permissions: Permission[];
  enabled: boolean;
  expiresAt?: string;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreatedServiceTokenResponse = ServiceTokenResponse & {
  token: string;
};

export type AuthAuditEventResponse = {
  id: string;
  tenantId: string;
  actorUserId: string;
  actorAuthType: RequestUser["authType"];
  actorTokenId?: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string;
  comment?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

const DEFAULT_SERVICE_TOKEN_ROLES: Role[] = ["service"];

@Injectable()
export class AuthAdminService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    private readonly identity: IdentityService,
  ) {}

  async listRoles(actor: RequestUser): Promise<AuthRoleResponse[]> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    const rows = await this.db
      .select()
      .from(authRoles)
      .where(eq(authRoles.tenantId, tenantUuid))
      .orderBy(desc(authRoles.createdAt));

    return rows.map((row) => this.toRoleResponse(row, actor.tenantId));
  }

  async createRole(
    body: CreateAuthRoleDto,
    actor: RequestUser,
  ): Promise<AuthRoleResponse> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    const roleName = body.name.trim();
    await this.assertRoleNameAvailable(tenantUuid, roleName);

    const [created] = await this.db
      .insert(authRoles)
      .values({
        tenantId: tenantUuid,
        name: roleName,
        permissions: body.permissions,
        description: body.description,
      })
      .returning();

    if (!created) {
      throw new Error("Failed to create auth role");
    }

    await this.recordAudit({
      tenantUuid,
      actor,
      action: "auth.role.create",
      targetType: "auth_role",
      targetId: created.id,
      reason: body.reason,
      comment: body.comment,
      metadata: {
        name: created.name,
        permissions: created.permissions,
      },
    });

    return this.toRoleResponse(created, actor.tenantId);
  }

  async updateRole(
    roleId: string,
    body: UpdateAuthRoleDto,
    actor: RequestUser,
  ): Promise<AuthRoleResponse> {
    this.assertHasRoleUpdate(body);
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    await this.getTenantRole(tenantUuid, roleId);

    const updates: {
      updatedAt: Date;
      name?: string;
      permissions?: Permission[];
      description?: string;
    } = { updatedAt: new Date() };
    if (body.name !== undefined) {
      const roleName = body.name.trim();
      await this.assertRoleNameAvailable(tenantUuid, roleName, roleId);
      updates.name = roleName;
    }
    if (body.permissions !== undefined) {
      updates.permissions = body.permissions;
    }
    if (body.description !== undefined) {
      updates.description = body.description;
    }

    const [updated] = await this.db
      .update(authRoles)
      .set(updates)
      .where(and(eq(authRoles.tenantId, tenantUuid), eq(authRoles.id, roleId)))
      .returning();

    if (!updated) {
      throw new Error("Failed to update auth role");
    }

    await this.recordAudit({
      tenantUuid,
      actor,
      action: "auth.role.update",
      targetType: "auth_role",
      targetId: roleId,
      reason: body.reason,
      comment: body.comment,
      metadata: {
        changed: Object.keys(updates).filter((key) => key !== "updatedAt"),
      },
    });

    return this.toRoleResponse(updated, actor.tenantId);
  }

  async deleteRole(
    roleId: string,
    body: AuthAdminReasonDto,
    actor: RequestUser,
  ): Promise<{ deleted: true }> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    const role = await this.getTenantRole(tenantUuid, roleId);

    await this.db
      .delete(authUserRoles)
      .where(
        and(
          eq(authUserRoles.tenantId, tenantUuid),
          eq(authUserRoles.roleId, roleId),
        ),
      );
    await this.db
      .delete(authRoles)
      .where(and(eq(authRoles.tenantId, tenantUuid), eq(authRoles.id, roleId)));

    await this.recordAudit({
      tenantUuid,
      actor,
      action: "auth.role.delete",
      targetType: "auth_role",
      targetId: roleId,
      reason: body.reason,
      comment: body.comment,
      metadata: {
        name: role.name,
        permissions: role.permissions,
      },
    });

    return { deleted: true };
  }

  async listUserRoles(
    externalUserId: string,
    actor: RequestUser,
  ): Promise<UserRoleAssignmentResponse[]> {
    const identity = await this.identity.resolve({
      tenantExternalId: actor.tenantId,
      userExternalId: externalUserId,
    });

    const rows = await this.db
      .select({
        assignmentId: authUserRoles.id,
        createdAt: authUserRoles.createdAt,
        role: authRoles,
      })
      .from(authUserRoles)
      .innerJoin(authRoles, eq(authUserRoles.roleId, authRoles.id))
      .where(
        and(
          eq(authUserRoles.tenantId, identity.tenantId),
          eq(authUserRoles.userId, identity.userId),
        ),
      )
      .orderBy(desc(authUserRoles.createdAt));

    return rows.map((row) => ({
      id: row.assignmentId,
      tenantId: actor.tenantId,
      userId: externalUserId,
      role: this.toRoleResponse(row.role, actor.tenantId),
      createdAt: row.createdAt.toISOString(),
    }));
  }

  async assignUserRole(
    externalUserId: string,
    body: AssignUserRoleDto,
    actor: RequestUser,
  ): Promise<UserRoleAssignmentResponse> {
    const identity = await this.identity.resolve({
      tenantExternalId: actor.tenantId,
      userExternalId: externalUserId,
    });
    const role = await this.getTenantRole(identity.tenantId, body.roleId);

    const [existing] = await this.db
      .select()
      .from(authUserRoles)
      .where(
        and(
          eq(authUserRoles.tenantId, identity.tenantId),
          eq(authUserRoles.userId, identity.userId),
          eq(authUserRoles.roleId, body.roleId),
        ),
      )
      .limit(1);
    if (existing) {
      throw new ConflictException("User already has this role");
    }

    const [created] = await this.db
      .insert(authUserRoles)
      .values({
        tenantId: identity.tenantId,
        userId: identity.userId,
        roleId: body.roleId,
      })
      .returning();

    if (!created) {
      throw new Error("Failed to assign auth role");
    }

    await this.recordAudit({
      tenantUuid: identity.tenantId,
      actor,
      action: "auth.user_role.assign",
      targetType: "auth_user_role",
      targetId: created.id,
      reason: body.reason,
      comment: body.comment,
      metadata: {
        userId: externalUserId,
        roleId: body.roleId,
        roleName: role.name,
      },
    });

    return {
      id: created.id,
      tenantId: actor.tenantId,
      userId: externalUserId,
      role: this.toRoleResponse(role, actor.tenantId),
      createdAt: created.createdAt.toISOString(),
    };
  }

  async revokeUserRole(
    externalUserId: string,
    roleId: string,
    body: AuthAdminReasonDto,
    actor: RequestUser,
  ): Promise<{ revoked: true }> {
    const identity = await this.identity.resolve({
      tenantExternalId: actor.tenantId,
      userExternalId: externalUserId,
    });
    const role = await this.getTenantRole(identity.tenantId, roleId);

    const [deleted] = await this.db
      .delete(authUserRoles)
      .where(
        and(
          eq(authUserRoles.tenantId, identity.tenantId),
          eq(authUserRoles.userId, identity.userId),
          eq(authUserRoles.roleId, roleId),
        ),
      )
      .returning();

    if (!deleted) {
      throw new NotFoundException("User role assignment not found");
    }

    await this.recordAudit({
      tenantUuid: identity.tenantId,
      actor,
      action: "auth.user_role.revoke",
      targetType: "auth_user_role",
      targetId: deleted.id,
      reason: body.reason,
      comment: body.comment,
      metadata: {
        userId: externalUserId,
        roleId,
        roleName: role.name,
      },
    });

    return { revoked: true };
  }

  async listServiceTokens(actor: RequestUser): Promise<ServiceTokenResponse[]> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    const rows = await this.db
      .select()
      .from(authServiceTokens)
      .where(eq(authServiceTokens.tenantId, tenantUuid))
      .orderBy(desc(authServiceTokens.createdAt));

    return rows.map((row) => this.toServiceTokenResponse(row, actor.tenantId));
  }

  async createServiceToken(
    body: CreateServiceTokenDto,
    actor: RequestUser,
  ): Promise<CreatedServiceTokenResponse> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    const token = this.generateServiceToken();
    const [created] = await this.db
      .insert(authServiceTokens)
      .values({
        tenantId: tenantUuid,
        name: body.name.trim(),
        tokenHash: this.tokenHash(token),
        roles: body.roles ?? DEFAULT_SERVICE_TOKEN_ROLES,
        permissions: body.permissions ?? [],
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
      })
      .returning();

    if (!created) {
      throw new Error("Failed to create service token");
    }

    await this.recordAudit({
      tenantUuid,
      actor,
      action: "auth.service_token.create",
      targetType: "auth_service_token",
      targetId: created.id,
      reason: body.reason,
      comment: body.comment,
      metadata: {
        name: created.name,
        roles: created.roles,
        permissions: created.permissions,
        expiresAt: created.expiresAt?.toISOString() ?? null,
      },
    });

    return {
      ...this.toServiceTokenResponse(created, actor.tenantId),
      token,
    };
  }

  async updateServiceToken(
    tokenId: string,
    body: UpdateServiceTokenDto,
    actor: RequestUser,
  ): Promise<ServiceTokenResponse> {
    this.assertHasServiceTokenUpdate(body);
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    await this.getTenantServiceToken(tenantUuid, tokenId);

    const updates: {
      updatedAt: Date;
      roles?: Role[];
      permissions?: Permission[];
      enabled?: boolean;
      expiresAt?: Date;
    } = { updatedAt: new Date() };
    if (body.roles !== undefined) {
      updates.roles = body.roles;
    }
    if (body.permissions !== undefined) {
      updates.permissions = body.permissions;
    }
    if (body.enabled !== undefined) {
      updates.enabled = body.enabled;
    }
    if (body.expiresAt !== undefined) {
      updates.expiresAt = new Date(body.expiresAt);
    }

    const [updated] = await this.db
      .update(authServiceTokens)
      .set(updates)
      .where(
        and(
          eq(authServiceTokens.tenantId, tenantUuid),
          eq(authServiceTokens.id, tokenId),
        ),
      )
      .returning();

    if (!updated) {
      throw new Error("Failed to update service token");
    }

    await this.recordAudit({
      tenantUuid,
      actor,
      action: "auth.service_token.update",
      targetType: "auth_service_token",
      targetId: tokenId,
      reason: body.reason,
      comment: body.comment,
      metadata: {
        changed: Object.keys(updates).filter((key) => key !== "updatedAt"),
      },
    });

    return this.toServiceTokenResponse(updated, actor.tenantId);
  }

  async disableServiceToken(
    tokenId: string,
    body: AuthAdminReasonDto,
    actor: RequestUser,
  ): Promise<ServiceTokenResponse> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    await this.getTenantServiceToken(tenantUuid, tokenId);

    const [updated] = await this.db
      .update(authServiceTokens)
      .set({ enabled: false, updatedAt: new Date() })
      .where(
        and(
          eq(authServiceTokens.tenantId, tenantUuid),
          eq(authServiceTokens.id, tokenId),
        ),
      )
      .returning();

    if (!updated) {
      throw new Error("Failed to disable service token");
    }

    await this.recordAudit({
      tenantUuid,
      actor,
      action: "auth.service_token.disable",
      targetType: "auth_service_token",
      targetId: tokenId,
      reason: body.reason,
      comment: body.comment,
      metadata: { name: updated.name },
    });

    return this.toServiceTokenResponse(updated, actor.tenantId);
  }

  async rotateServiceToken(
    tokenId: string,
    body: AuthAdminReasonDto,
    actor: RequestUser,
  ): Promise<CreatedServiceTokenResponse> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    await this.getTenantServiceToken(tenantUuid, tokenId);
    const token = this.generateServiceToken();

    const [updated] = await this.db
      .update(authServiceTokens)
      .set({
        tokenHash: this.tokenHash(token),
        lastUsedAt: null,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(authServiceTokens.tenantId, tenantUuid),
          eq(authServiceTokens.id, tokenId),
        ),
      )
      .returning();

    if (!updated) {
      throw new Error("Failed to rotate service token");
    }

    await this.recordAudit({
      tenantUuid,
      actor,
      action: "auth.service_token.rotate",
      targetType: "auth_service_token",
      targetId: tokenId,
      reason: body.reason,
      comment: body.comment,
      metadata: { name: updated.name },
    });

    return {
      ...this.toServiceTokenResponse(updated, actor.tenantId),
      token,
    };
  }

  async listAuditEvents(actor: RequestUser): Promise<AuthAuditEventResponse[]> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    const rows = await this.db
      .select()
      .from(authAdminAuditEvents)
      .where(eq(authAdminAuditEvents.tenantId, tenantUuid))
      .orderBy(desc(authAdminAuditEvents.createdAt))
      .limit(100);

    return rows.map((row) => {
      const event: AuthAuditEventResponse = {
        id: row.id,
        tenantId: actor.tenantId,
        actorUserId: row.actorUserId,
        actorAuthType: row.actorAuthType as RequestUser["authType"],
        action: row.action,
        targetType: row.targetType,
        targetId: row.targetId,
        reason: row.reason,
        metadata: row.metadata,
        createdAt: row.createdAt.toISOString(),
      };
      if (row.actorTokenId) {
        event.actorTokenId = row.actorTokenId;
      }
      if (row.comment) {
        event.comment = row.comment;
      }
      return event;
    });
  }

  private async assertRoleNameAvailable(
    tenantUuid: string,
    roleName: string,
    ignoredRoleId?: string,
  ): Promise<void> {
    const [existing] = await this.db
      .select({ id: authRoles.id })
      .from(authRoles)
      .where(and(eq(authRoles.tenantId, tenantUuid), eq(authRoles.name, roleName)))
      .limit(1);

    if (existing && existing.id !== ignoredRoleId) {
      throw new ConflictException("Role name already exists");
    }
  }

  private async getTenantRole(
    tenantUuid: string,
    roleId: string,
  ): Promise<typeof authRoles.$inferSelect> {
    const [role] = await this.db
      .select()
      .from(authRoles)
      .where(and(eq(authRoles.tenantId, tenantUuid), eq(authRoles.id, roleId)))
      .limit(1);

    if (!role) {
      throw new NotFoundException("Auth role not found");
    }
    return role;
  }

  private async getTenantServiceToken(
    tenantUuid: string,
    tokenId: string,
  ): Promise<typeof authServiceTokens.$inferSelect> {
    const [token] = await this.db
      .select()
      .from(authServiceTokens)
      .where(
        and(
          eq(authServiceTokens.tenantId, tenantUuid),
          eq(authServiceTokens.id, tokenId),
        ),
      )
      .limit(1);

    if (!token) {
      throw new NotFoundException("Service token not found");
    }
    return token;
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

  private assertHasRoleUpdate(body: UpdateAuthRoleDto): void {
    if (
      body.name === undefined &&
      body.permissions === undefined &&
      body.description === undefined
    ) {
      throw new BadRequestException("No role fields to update");
    }
  }

  private assertHasServiceTokenUpdate(body: UpdateServiceTokenDto): void {
    if (
      body.roles === undefined &&
      body.permissions === undefined &&
      body.enabled === undefined &&
      body.expiresAt === undefined
    ) {
      throw new BadRequestException("No service token fields to update");
    }
  }

  private toRoleResponse(
    row: typeof authRoles.$inferSelect,
    externalTenantId: string,
  ): AuthRoleResponse {
    const role: AuthRoleResponse = {
      id: row.id,
      tenantId: externalTenantId,
      name: row.name,
      permissions: row.permissions as Permission[],
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
    if (row.description) {
      role.description = row.description;
    }
    return role;
  }

  private toServiceTokenResponse(
    row: typeof authServiceTokens.$inferSelect,
    externalTenantId: string,
  ): ServiceTokenResponse {
    const token: ServiceTokenResponse = {
      id: row.id,
      tenantId: externalTenantId,
      name: row.name,
      roles: row.roles as Role[],
      permissions: row.permissions as Permission[],
      enabled: row.enabled,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
    if (row.expiresAt) {
      token.expiresAt = row.expiresAt.toISOString();
    }
    if (row.lastUsedAt) {
      token.lastUsedAt = row.lastUsedAt.toISOString();
    }
    return token;
  }

  private generateServiceToken(): string {
    return crypto.randomBytes(32).toString("base64url");
  }

  private tokenHash(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }
}
