import {
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, eq } from "drizzle-orm";
import crypto from "node:crypto";

import { DRIZZLE_DB } from "../db/database.constants.js";
import type { Database } from "../db/database.types.js";
import { IdentityService } from "../db/identity.service.js";
import {
  authRefreshTokens,
  authSessions,
  users,
} from "../db/schema.js";
import { AuthRbacService } from "./auth-rbac.service.js";
import { AuthService } from "./auth.service.js";
import type { Permission, RequestUser, Role } from "./auth.types.js";
import type { ConsoleLoginDto } from "./dto/console-login.dto.js";

export type ConsoleAuthUser = {
  userId: string;
  tenantId: string;
  roles: Role[];
  permissions: Permission[];
  authType: RequestUser["authType"];
  tokenId?: string;
};

export type ConsoleAuthResponse = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  refreshTokenExpiresAt: string;
  sessionId: string;
  user: ConsoleAuthUser;
};

@Injectable()
export class ConsoleAuthService {
  private readonly accessTokenTtlSeconds = 15 * 60;
  private readonly refreshTokenTtlSeconds = 7 * 24 * 60 * 60;

  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService,
    @Inject(AuthService)
    private readonly auth: AuthService,
    @Inject(AuthRbacService)
    private readonly rbac: AuthRbacService,
    @Inject(IdentityService)
    private readonly identity: IdentityService,
    @Inject(DRIZZLE_DB) private readonly db: Database,
  ) {}

  async login(body: ConsoleLoginDto): Promise<ConsoleAuthResponse> {
    const user =
      body.credentialType === "service_token"
        ? await this.authenticateServiceToken(body)
        : this.authenticateApiKey(body);

    return this.issueSession(user, body.deviceLabel ?? "Web Console");
  }

  async refresh(refreshToken: string): Promise<ConsoleAuthResponse> {
    const tokenHash = this.tokenHash(refreshToken);
    const [row] = await this.db
      .select({
        refreshToken: authRefreshTokens,
        session: authSessions,
        externalUserId: users.externalId,
      })
      .from(authRefreshTokens)
      .innerJoin(authSessions, eq(authRefreshTokens.sessionId, authSessions.id))
      .innerJoin(users, eq(authRefreshTokens.userId, users.id))
      .where(eq(authRefreshTokens.tokenHash, tokenHash))
      .limit(1);

    if (!row || !this.isRefreshTokenActive(row.refreshToken)) {
      throw new UnauthorizedException("Invalid refresh token");
    }
    if (!this.isSessionActive(row.session)) {
      throw new UnauthorizedException("Auth session is not active");
    }

    const now = new Date();
    const rotatedRefreshToken = this.generateOpaqueToken();
    const refreshTokenExpiresAt = this.expiresAt(this.refreshTokenTtlSeconds);
    await this.db
      .update(authRefreshTokens)
      .set({
        tokenHash: this.tokenHash(rotatedRefreshToken),
        rotatedAt: now,
        lastUsedAt: now,
        expiresAt: refreshTokenExpiresAt,
        updatedAt: now,
      })
      .where(eq(authRefreshTokens.id, row.refreshToken.id));

    const user = await this.userFromSession(row.session, row.externalUserId);
    const access = this.signAccessToken({
      user,
      sessionTokenId: row.session.tokenId,
    });

    return {
      accessToken: access.token,
      refreshToken: rotatedRefreshToken,
      expiresAt: access.expiresAt.toISOString(),
      refreshTokenExpiresAt: refreshTokenExpiresAt.toISOString(),
      sessionId: row.session.id,
      user,
    };
  }

  async logout(refreshToken: string): Promise<{ revoked: true }> {
    const tokenHash = this.tokenHash(refreshToken);
    const now = new Date();
    await this.db
      .update(authRefreshTokens)
      .set({
        enabled: false,
        revokedAt: now,
        revokeReason: "Console logout",
        updatedAt: now,
      })
      .where(eq(authRefreshTokens.tokenHash, tokenHash));
    return { revoked: true };
  }

  me(user: RequestUser): ConsoleAuthUser {
    return {
      userId: user.userId,
      tenantId: user.tenantId,
      roles: user.roles,
      permissions: user.permissions,
      authType: user.authType,
      ...(user.tokenId ? { tokenId: user.tokenId } : {}),
    };
  }

  private async authenticateServiceToken(
    body: ConsoleLoginDto,
  ): Promise<ConsoleAuthUser> {
    const persistent = await this.rbac.resolveServiceToken({
      tokenHash: this.tokenHash(body.credential),
      ...(body.tenantId ? { tenantId: body.tenantId } : {}),
    });
    if (persistent) {
      const roles = this.auth.normalizeRoles(persistent.roles, ["service"]);
      const permissions = this.auth.mergePermissions(
        roles,
        this.auth.normalizePermissions(persistent.permissions),
      );
      return {
        userId: persistent.userId,
        tenantId: persistent.tenantId,
        roles,
        permissions,
        authType: "service_token",
        tokenId: persistent.tokenId,
      };
    }

    const configuredToken = this.config.get<string>("app.auth.serviceToken");
    if (!configuredToken || !this.constantTimeEquals(configuredToken, body.credential)) {
      throw new UnauthorizedException("Invalid service token");
    }

    const roles = this.auth.normalizeRoles(
      this.config.get<string[]>("app.auth.serviceTokenRoles", []),
      ["service"],
    );
    const permissions = this.auth.mergePermissions(
      roles,
      this.auth.normalizePermissions(
        this.config.get<string[]>("app.auth.serviceTokenPermissions", []),
      ),
    );
    return {
      userId: this.config.get<string>(
        "app.auth.serviceTokenUserId",
        "service-token-user",
      ),
      tenantId:
        body.tenantId ??
        this.config.get<string>("app.auth.serviceTokenTenantId", "default"),
      roles,
      permissions,
      authType: "service_token",
    };
  }

  private authenticateApiKey(body: ConsoleLoginDto): ConsoleAuthUser {
    const configuredApiKey = this.config.get<string>("app.auth.apiKey");
    if (!configuredApiKey || !this.constantTimeEquals(configuredApiKey, body.credential)) {
      throw new UnauthorizedException("Invalid API key");
    }

    const roles: Role[] = ["developer"];
    return {
      userId: body.userId ?? "api-key-user",
      tenantId: body.tenantId ?? "default",
      roles,
      permissions: this.auth.permissionsForRoles(roles),
      authType: "api_key",
    };
  }

  private async issueSession(
    user: ConsoleAuthUser,
    deviceLabel: string,
  ): Promise<ConsoleAuthResponse> {
    const identity = await this.identity.resolve({
      tenantExternalId: user.tenantId,
      userExternalId: user.userId,
    });
    const sessionTokenId = crypto.randomUUID();
    const sessionExpiresAt = this.expiresAt(this.refreshTokenTtlSeconds);
    const [session] = await this.db
      .insert(authSessions)
      .values({
        tenantId: identity.tenantId,
        userId: identity.userId,
        tokenId: sessionTokenId,
        deviceLabel,
        expiresAt: sessionExpiresAt,
        metadata: {
          authType: user.authType,
          roles: user.roles,
          permissions: user.permissions,
          source: "web_console",
        },
      })
      .returning();
    if (!session) {
      throw new Error("Failed to create console auth session");
    }

    const refreshToken = this.generateOpaqueToken();
    const refreshTokenExpiresAt = this.expiresAt(this.refreshTokenTtlSeconds);
    await this.db.insert(authRefreshTokens).values({
      tenantId: identity.tenantId,
      userId: identity.userId,
      sessionId: session.id,
      tokenHash: this.tokenHash(refreshToken),
      expiresAt: refreshTokenExpiresAt,
    });

    const access = this.signAccessToken({ user, sessionTokenId });
    return {
      accessToken: access.token,
      refreshToken,
      expiresAt: access.expiresAt.toISOString(),
      refreshTokenExpiresAt: refreshTokenExpiresAt.toISOString(),
      sessionId: session.id,
      user,
    };
  }

  private async userFromSession(
    session: typeof authSessions.$inferSelect,
    externalUserId: string,
  ): Promise<ConsoleAuthUser> {
    const [tenantUser] = await this.db
      .select({
        user: users,
      })
      .from(users)
      .where(and(eq(users.id, session.userId), eq(users.tenantId, session.tenantId)))
      .limit(1);
    const userId = tenantUser?.user.externalId ?? externalUserId;
    const tenantName = await this.tenantName(session.tenantId);
    const sessionRoles = this.metadataRoles(session.metadata);
    const sessionPermissions = this.metadataPermissions(session.metadata);
    const sessionAuthType = this.metadataAuthType(session.metadata);
    if (sessionRoles.length > 0 || sessionPermissions.length > 0) {
      const roles = this.auth.normalizeRoles(sessionRoles, ["developer"]);
      return {
        userId,
        tenantId: tenantName,
        roles,
        permissions: this.auth.mergePermissions(
          roles,
          this.auth.normalizePermissions(sessionPermissions),
        ),
        authType: sessionAuthType ?? "jwt",
        tokenId: session.tokenId,
      };
    }

    const persistent = await this.rbac.resolveUserAuthorization({
      tenantId: tenantName,
      userId,
    });
    const roles = this.auth.normalizeRoles(persistent.roles, ["developer"]);
    return {
      userId,
      tenantId: tenantName,
      roles,
      permissions: this.auth.mergePermissions(
        roles,
        this.auth.normalizePermissions(persistent.permissions),
      ),
      authType: "jwt",
      tokenId: session.tokenId,
    };
  }

  private async tenantName(tenantUuid: string): Promise<string> {
    const [row] = await this.db.query.tenants.findMany({
      where: (tenant, { eq: whereEq }) => whereEq(tenant.id, tenantUuid),
      limit: 1,
    });
    return row?.name ?? tenantUuid;
  }

  private metadataRoles(metadata: Record<string, unknown>): string[] {
    const roles = metadata["roles"];
    return Array.isArray(roles)
      ? roles.filter((role): role is string => typeof role === "string")
      : [];
  }

  private metadataPermissions(metadata: Record<string, unknown>): string[] {
    const permissions = metadata["permissions"];
    return Array.isArray(permissions)
      ? permissions.filter((permission): permission is string => typeof permission === "string")
      : [];
  }

  private metadataAuthType(
    metadata: Record<string, unknown>,
  ): RequestUser["authType"] | undefined {
    const authType = metadata["authType"];
    return authType === "api_key" ||
      authType === "dev" ||
      authType === "jwt" ||
      authType === "service_token"
      ? authType
      : undefined;
  }

  private signAccessToken(input: {
    user: ConsoleAuthUser;
    sessionTokenId: string;
  }): { token: string; expiresAt: Date } {
    const secret = this.jwtSecret();
    const expiresAt = this.expiresAt(this.accessTokenTtlSeconds);
    const header = this.base64UrlJson({ alg: "HS256", typ: "JWT" });
    const payload = this.base64UrlJson({
      sub: input.user.userId,
      tenantId: input.user.tenantId,
      roles: input.user.roles,
      permissions: input.user.permissions,
      sid: input.sessionTokenId,
      jti: crypto.randomUUID(),
      iss: this.config.get<string>("app.auth.jwtIssuer") ?? "enterprise-agent-api",
      aud: this.config.get<string>("app.auth.jwtAudience") ?? "enterprise-agent-web",
      iat: Math.floor(Date.now() / 1_000),
      exp: Math.floor(expiresAt.getTime() / 1_000),
    });
    const signature = crypto
      .createHmac("sha256", secret)
      .update(`${header}.${payload}`)
      .digest("base64url");
    return { token: `${header}.${payload}.${signature}`, expiresAt };
  }

  private jwtSecret(): string {
    return (
      this.config.get<string>("app.auth.jwtSecret") ??
      "development-only-jwt-secret-change-me"
    );
  }

  private isSessionActive(session: typeof authSessions.$inferSelect): boolean {
    if (session.status !== "active" || session.revokedAt) {
      return false;
    }
    return !session.expiresAt || session.expiresAt.getTime() > Date.now();
  }

  private isRefreshTokenActive(
    refreshToken: typeof authRefreshTokens.$inferSelect,
  ): boolean {
    if (!refreshToken.enabled || refreshToken.revokedAt) {
      return false;
    }
    return !refreshToken.expiresAt || refreshToken.expiresAt.getTime() > Date.now();
  }

  private expiresAt(ttlSeconds: number): Date {
    return new Date(Date.now() + ttlSeconds * 1_000);
  }

  private generateOpaqueToken(): string {
    return crypto.randomBytes(32).toString("base64url");
  }

  private tokenHash(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  private base64UrlJson(value: Record<string, unknown>): string {
    return Buffer.from(JSON.stringify(value)).toString("base64url");
  }

  private constantTimeEquals(left: string, right: string): boolean {
    const leftBuffer = Buffer.from(left);
    const rightBuffer = Buffer.from(right);
    return (
      leftBuffer.length === rightBuffer.length &&
      crypto.timingSafeEqual(leftBuffer, rightBuffer)
    );
  }
}
