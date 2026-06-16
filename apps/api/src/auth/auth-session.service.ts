import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { and, desc, eq, inArray } from "drizzle-orm";
import crypto from "node:crypto";

import { DRIZZLE_DB } from "../db/database.constants.js";
import type { Database } from "../db/database.types.js";
import { IdentityService } from "../db/identity.service.js";
import {
  authAdminAuditEvents,
  authRefreshTokens,
  authSessions,
  users,
} from "../db/schema.js";
import type { AuthAdminReasonDto } from "./dto/auth-admin-common.dto.js";
import type { CreateRefreshTokenDto } from "./dto/create-refresh-token.dto.js";
import type { RegisterAuthSessionDto } from "./dto/register-auth-session.dto.js";
import type { RequestUser } from "./auth.types.js";

export type AuthSessionResponse = {
  id: string;
  tenantId: string;
  userId: string;
  tokenId: string;
  status: string;
  deviceLabel?: string;
  ipAddress?: string;
  userAgent?: string;
  expiresAt?: string;
  revokedAt?: string;
  revokeReason?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type RefreshTokenResponse = {
  id: string;
  tenantId: string;
  userId: string;
  sessionId: string;
  enabled: boolean;
  expiresAt?: string;
  lastUsedAt?: string;
  rotatedAt?: string;
  revokedAt?: string;
  revokeReason?: string;
  createdAt: string;
  updatedAt: string;
};

export type CreatedRefreshTokenResponse = RefreshTokenResponse & {
  token: string;
};

export type RefreshTokenVerificationResponse = {
  valid: boolean;
  refreshToken?: RefreshTokenResponse;
};

@Injectable()
export class AuthSessionService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    @Inject(IdentityService)
    private readonly identity: IdentityService,
  ) {}

  async assertJwtSessionAllowed(input: {
    tenantId: string;
    userId: string;
    tokenId?: string;
    sessionId?: string;
  }): Promise<void> {
    const tokenIds: string[] = [];
    if (input.sessionId) {
      tokenIds.push(input.sessionId);
    }
    if (input.tokenId && input.tokenId !== input.sessionId) {
      tokenIds.push(input.tokenId);
    }
    if (tokenIds.length === 0) {
      return;
    }

    const identity = await this.identity.resolve({
      tenantExternalId: input.tenantId,
      userExternalId: input.userId,
    });
    const sessions = await this.db
      .select()
      .from(authSessions)
      .where(inArray(authSessions.tokenId, tokenIds));

    if (sessions.length === 0) {
      return;
    }
    for (const session of sessions) {
      if (session.tenantId !== identity.tenantId || session.userId !== identity.userId) {
        throw new UnauthorizedException("JWT session owner mismatch");
      }
      this.assertSessionActive(session);
    }
  }

  async listSessions(actor: RequestUser): Promise<AuthSessionResponse[]> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    const rows = await this.db
      .select({
        session: authSessions,
        externalUserId: users.externalId,
      })
      .from(authSessions)
      .innerJoin(users, eq(authSessions.userId, users.id))
      .where(eq(authSessions.tenantId, tenantUuid))
      .orderBy(desc(authSessions.createdAt));

    return rows.map((row) =>
      this.toSessionResponse(row.session, actor.tenantId, row.externalUserId),
    );
  }

  async registerSession(
    body: RegisterAuthSessionDto,
    actor: RequestUser,
  ): Promise<AuthSessionResponse> {
    const identity = await this.identity.resolve({
      tenantExternalId: actor.tenantId,
      userExternalId: body.userId,
    });

    const [existing] = await this.db
      .select({ id: authSessions.id })
      .from(authSessions)
      .where(eq(authSessions.tokenId, body.tokenId))
      .limit(1);
    if (existing) {
      throw new ConflictException("Auth session tokenId already exists");
    }

    const insert: typeof authSessions.$inferInsert = {
      tenantId: identity.tenantId,
      userId: identity.userId,
      tokenId: body.tokenId,
      metadata: body.metadata ?? {},
    };
    if (body.deviceLabel) {
      insert.deviceLabel = body.deviceLabel;
    }
    if (body.ipAddress) {
      insert.ipAddress = body.ipAddress;
    }
    if (body.userAgent) {
      insert.userAgent = body.userAgent;
    }
    if (body.expiresAt) {
      insert.expiresAt = new Date(body.expiresAt);
    }

    const [created] = await this.db.insert(authSessions).values(insert).returning();
    if (!created) {
      throw new Error("Failed to register auth session");
    }

    await this.recordAudit({
      tenantUuid: identity.tenantId,
      actor,
      action: "auth.session.register",
      targetType: "auth_session",
      targetId: created.id,
      reason: body.reason,
      comment: body.comment,
      metadata: {
        userId: body.userId,
        tokenId: body.tokenId,
        expiresAt: created.expiresAt?.toISOString() ?? null,
      },
    });

    return this.toSessionResponse(created, actor.tenantId, body.userId);
  }

  async revokeSession(
    sessionId: string,
    body: AuthAdminReasonDto,
    actor: RequestUser,
  ): Promise<AuthSessionResponse> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    const session = await this.getTenantSession(tenantUuid, sessionId);
    const now = new Date();

    const [updated] = await this.db
      .update(authSessions)
      .set({
        status: "revoked",
        revokedAt: now,
        revokeReason: body.reason,
        updatedAt: now,
      })
      .where(
        and(eq(authSessions.tenantId, tenantUuid), eq(authSessions.id, sessionId)),
      )
      .returning();

    if (!updated) {
      throw new Error("Failed to revoke auth session");
    }

    await this.db
      .update(authRefreshTokens)
      .set({
        enabled: false,
        revokedAt: now,
        revokeReason: body.reason,
        updatedAt: now,
      })
      .where(
        and(
          eq(authRefreshTokens.tenantId, tenantUuid),
          eq(authRefreshTokens.sessionId, sessionId),
        ),
      );

    await this.recordAudit({
      tenantUuid,
      actor,
      action: "auth.session.revoke",
      targetType: "auth_session",
      targetId: sessionId,
      reason: body.reason,
      comment: body.comment,
      metadata: {
        tokenId: session.tokenId,
      },
    });

    const externalUserId = await this.externalUserId(session.userId);
    return this.toSessionResponse(updated, actor.tenantId, externalUserId);
  }

  async listRefreshTokens(actor: RequestUser): Promise<RefreshTokenResponse[]> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    const rows = await this.db
      .select({
        refreshToken: authRefreshTokens,
        externalUserId: users.externalId,
      })
      .from(authRefreshTokens)
      .innerJoin(users, eq(authRefreshTokens.userId, users.id))
      .where(eq(authRefreshTokens.tenantId, tenantUuid))
      .orderBy(desc(authRefreshTokens.createdAt));

    return rows.map((row) =>
      this.toRefreshTokenResponse(
        row.refreshToken,
        actor.tenantId,
        row.externalUserId,
      ),
    );
  }

  async createRefreshToken(
    sessionId: string,
    body: CreateRefreshTokenDto,
    actor: RequestUser,
  ): Promise<CreatedRefreshTokenResponse> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    const session = await this.getTenantSession(tenantUuid, sessionId);
    this.assertSessionActive(session);
    const token = this.generateToken();

    const insert: typeof authRefreshTokens.$inferInsert = {
      tenantId: tenantUuid,
      userId: session.userId,
      sessionId,
      tokenHash: this.tokenHash(token),
    };
    if (body.expiresAt) {
      insert.expiresAt = new Date(body.expiresAt);
    }

    const [created] = await this.db
      .insert(authRefreshTokens)
      .values(insert)
      .returning();
    if (!created) {
      throw new Error("Failed to create refresh token");
    }

    await this.recordAudit({
      tenantUuid,
      actor,
      action: "auth.refresh_token.create",
      targetType: "auth_refresh_token",
      targetId: created.id,
      reason: body.reason,
      comment: body.comment,
      metadata: {
        sessionId,
        expiresAt: created.expiresAt?.toISOString() ?? null,
      },
    });

    const externalUserId = await this.externalUserId(session.userId);
    return {
      ...this.toRefreshTokenResponse(created, actor.tenantId, externalUserId),
      token,
    };
  }

  async verifyRefreshToken(
    token: string,
    actor: RequestUser,
  ): Promise<RefreshTokenVerificationResponse> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    const [row] = await this.db
      .select({
        refreshToken: authRefreshTokens,
        externalUserId: users.externalId,
      })
      .from(authRefreshTokens)
      .innerJoin(users, eq(authRefreshTokens.userId, users.id))
      .where(eq(authRefreshTokens.tokenHash, this.tokenHash(token)))
      .limit(1);

    if (!row || row.refreshToken.tenantId !== tenantUuid) {
      return { valid: false };
    }
    if (!this.isRefreshTokenActive(row.refreshToken)) {
      return { valid: false };
    }

    await this.db
      .update(authRefreshTokens)
      .set({ lastUsedAt: new Date(), updatedAt: new Date() })
      .where(eq(authRefreshTokens.id, row.refreshToken.id));

    return {
      valid: true,
      refreshToken: this.toRefreshTokenResponse(
        row.refreshToken,
        actor.tenantId,
        row.externalUserId,
      ),
    };
  }

  async rotateRefreshToken(
    refreshTokenId: string,
    body: CreateRefreshTokenDto,
    actor: RequestUser,
  ): Promise<CreatedRefreshTokenResponse> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    const refreshToken = await this.getTenantRefreshToken(tenantUuid, refreshTokenId);
    const token = this.generateToken();
    const now = new Date();
    const update: Partial<typeof authRefreshTokens.$inferInsert> = {
      tokenHash: this.tokenHash(token),
      rotatedAt: now,
      lastUsedAt: null,
      updatedAt: now,
    };
    if (body.expiresAt) {
      update.expiresAt = new Date(body.expiresAt);
    }

    const [updated] = await this.db
      .update(authRefreshTokens)
      .set(update)
      .where(
        and(
          eq(authRefreshTokens.tenantId, tenantUuid),
          eq(authRefreshTokens.id, refreshTokenId),
        ),
      )
      .returning();
    if (!updated) {
      throw new Error("Failed to rotate refresh token");
    }

    await this.recordAudit({
      tenantUuid,
      actor,
      action: "auth.refresh_token.rotate",
      targetType: "auth_refresh_token",
      targetId: refreshTokenId,
      reason: body.reason,
      comment: body.comment,
      metadata: {
        sessionId: refreshToken.sessionId,
      },
    });

    const externalUserId = await this.externalUserId(updated.userId);
    return {
      ...this.toRefreshTokenResponse(updated, actor.tenantId, externalUserId),
      token,
    };
  }

  async revokeRefreshToken(
    refreshTokenId: string,
    body: AuthAdminReasonDto,
    actor: RequestUser,
  ): Promise<RefreshTokenResponse> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    await this.getTenantRefreshToken(tenantUuid, refreshTokenId);
    const now = new Date();

    const [updated] = await this.db
      .update(authRefreshTokens)
      .set({
        enabled: false,
        revokedAt: now,
        revokeReason: body.reason,
        updatedAt: now,
      })
      .where(
        and(
          eq(authRefreshTokens.tenantId, tenantUuid),
          eq(authRefreshTokens.id, refreshTokenId),
        ),
      )
      .returning();
    if (!updated) {
      throw new Error("Failed to revoke refresh token");
    }

    await this.recordAudit({
      tenantUuid,
      actor,
      action: "auth.refresh_token.revoke",
      targetType: "auth_refresh_token",
      targetId: refreshTokenId,
      reason: body.reason,
      comment: body.comment,
      metadata: {
        sessionId: updated.sessionId,
      },
    });

    const externalUserId = await this.externalUserId(updated.userId);
    return this.toRefreshTokenResponse(updated, actor.tenantId, externalUserId);
  }

  private assertSessionActive(session: typeof authSessions.$inferSelect): void {
    if (session.status !== "active" || session.revokedAt) {
      throw new UnauthorizedException("Auth session revoked");
    }
    if (session.expiresAt && session.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException("Auth session expired");
    }
  }

  private isRefreshTokenActive(
    refreshToken: typeof authRefreshTokens.$inferSelect,
  ): boolean {
    if (!refreshToken.enabled || refreshToken.revokedAt) {
      return false;
    }
    return !refreshToken.expiresAt || refreshToken.expiresAt.getTime() > Date.now();
  }

  private async getTenantSession(
    tenantUuid: string,
    sessionId: string,
  ): Promise<typeof authSessions.$inferSelect> {
    const [session] = await this.db
      .select()
      .from(authSessions)
      .where(and(eq(authSessions.tenantId, tenantUuid), eq(authSessions.id, sessionId)))
      .limit(1);
    if (!session) {
      throw new NotFoundException("Auth session not found");
    }
    return session;
  }

  private async getTenantRefreshToken(
    tenantUuid: string,
    refreshTokenId: string,
  ): Promise<typeof authRefreshTokens.$inferSelect> {
    const [refreshToken] = await this.db
      .select()
      .from(authRefreshTokens)
      .where(
        and(
          eq(authRefreshTokens.tenantId, tenantUuid),
          eq(authRefreshTokens.id, refreshTokenId),
        ),
      )
      .limit(1);
    if (!refreshToken) {
      throw new NotFoundException("Refresh token not found");
    }
    return refreshToken;
  }

  private async externalUserId(userUuid: string): Promise<string> {
    const [user] = await this.db
      .select({ externalId: users.externalId })
      .from(users)
      .where(eq(users.id, userUuid))
      .limit(1);
    return user?.externalId ?? userUuid;
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

  private toSessionResponse(
    row: typeof authSessions.$inferSelect,
    externalTenantId: string,
    externalUserId: string,
  ): AuthSessionResponse {
    const session: AuthSessionResponse = {
      id: row.id,
      tenantId: externalTenantId,
      userId: externalUserId,
      tokenId: row.tokenId,
      status: row.status,
      metadata: row.metadata,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
    if (row.deviceLabel) {
      session.deviceLabel = row.deviceLabel;
    }
    if (row.ipAddress) {
      session.ipAddress = row.ipAddress;
    }
    if (row.userAgent) {
      session.userAgent = row.userAgent;
    }
    if (row.expiresAt) {
      session.expiresAt = row.expiresAt.toISOString();
    }
    if (row.revokedAt) {
      session.revokedAt = row.revokedAt.toISOString();
    }
    if (row.revokeReason) {
      session.revokeReason = row.revokeReason;
    }
    return session;
  }

  private toRefreshTokenResponse(
    row: typeof authRefreshTokens.$inferSelect,
    externalTenantId: string,
    externalUserId: string,
  ): RefreshTokenResponse {
    const refreshToken: RefreshTokenResponse = {
      id: row.id,
      tenantId: externalTenantId,
      userId: externalUserId,
      sessionId: row.sessionId,
      enabled: row.enabled,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
    if (row.expiresAt) {
      refreshToken.expiresAt = row.expiresAt.toISOString();
    }
    if (row.lastUsedAt) {
      refreshToken.lastUsedAt = row.lastUsedAt.toISOString();
    }
    if (row.rotatedAt) {
      refreshToken.rotatedAt = row.rotatedAt.toISOString();
    }
    if (row.revokedAt) {
      refreshToken.revokedAt = row.revokedAt.toISOString();
    }
    if (row.revokeReason) {
      refreshToken.revokeReason = row.revokeReason;
    }
    return refreshToken;
  }

  private generateToken(): string {
    return crypto.randomBytes(32).toString("base64url");
  }

  private tokenHash(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }
}
