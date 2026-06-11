import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";
import crypto from "node:crypto";

import { AuthRbacService } from "./auth-rbac.service.js";
import { AuthService } from "./auth.service.js";
import type {
  AuthenticatedRequest,
  Permission,
  RequestUser,
  Role,
} from "./auth.types.js";

type JwtPayload = {
  sub?: unknown;
  tid?: unknown;
  tenantId?: unknown;
  roles?: unknown;
  permissions?: unknown;
  exp?: unknown;
  iss?: unknown;
  aud?: unknown;
  jti?: unknown;
};

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly config: ConfigService,
    private readonly auth: AuthService,
    private readonly rbac: AuthRbacService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<Request & Partial<AuthenticatedRequest>>();

    const jwtUser = await this.authenticateJwt(request);
    if (jwtUser) {
      request.user = jwtUser;
      return true;
    }

    const serviceUser = await this.authenticateServiceToken(request);
    if (serviceUser) {
      request.user = serviceUser;
      return true;
    }

    const apiKeyUser = this.authenticateApiKey(request);
    if (apiKeyUser) {
      request.user = apiKeyUser;
      return true;
    }

    throw new UnauthorizedException("Invalid credentials");
  }

  private async authenticateJwt(request: Request): Promise<RequestUser | undefined> {
    const token = this.bearerToken(request);
    if (!token) {
      return undefined;
    }

    const secret = this.config.get<string>("app.auth.jwtSecret");
    if (!secret) {
      throw new UnauthorizedException("JWT authentication is not configured");
    }

    const payload = this.verifyJwt(token, secret);
    const userId = this.claimString(payload.sub, "sub");
    const tenantId = this.claimString(payload.tenantId ?? payload.tid, "tenantId");
    this.assertTenantHeaderMatches(request, tenantId);

    const configuredIssuer = this.config.get<string>("app.auth.jwtIssuer");
    if (configuredIssuer && payload.iss !== configuredIssuer) {
      throw new UnauthorizedException("Invalid JWT issuer");
    }

    const configuredAudience = this.config.get<string>("app.auth.jwtAudience");
    if (configuredAudience && !this.matchesAudience(payload.aud, configuredAudience)) {
      throw new UnauthorizedException("Invalid JWT audience");
    }

    const tokenRoles = this.auth.normalizeRoles(payload.roles, []);
    const tokenPermissions = this.auth.normalizePermissions(payload.permissions);
    const persistent = await this.rbac.resolveUserAuthorization({
      tenantId,
      userId,
    });
    const roles = this.auth.normalizeRoles(
      [...persistent.roles, ...tokenRoles],
      ["developer"],
    );
    const explicitPermissions = this.auth.normalizePermissions([
      ...persistent.permissions,
      ...tokenPermissions,
    ]);
    const user: RequestUser = {
      userId,
      tenantId,
      roles,
      permissions: this.auth.mergePermissions(roles, explicitPermissions),
      authType: "jwt",
    };
    if (typeof payload.jti === "string" && payload.jti.trim()) {
      user.tokenId = payload.jti.trim();
    }
    return user;
  }

  private async authenticateServiceToken(
    request: Request,
  ): Promise<RequestUser | undefined> {
    const requestToken = this.header(request, "x-service-token");
    if (!requestToken) {
      return undefined;
    }

    const tenantId = this.header(request, "x-tenant-id");
    const persistent = await this.rbac.resolveServiceToken({
      tokenHash: this.tokenHash(requestToken),
      ...(tenantId ? { tenantId } : {}),
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
    if (!configuredToken) {
      return undefined;
    }
    if (!this.constantTimeEquals(configuredToken, requestToken)) {
      throw new UnauthorizedException("Invalid service token");
    }

    const configuredRoles = this.config.get<string[]>(
      "app.auth.serviceTokenRoles",
      [],
    );
    const configuredPermissions = this.config.get<string[]>(
      "app.auth.serviceTokenPermissions",
      [],
    );
    const roles = this.auth.normalizeRoles(configuredRoles, ["service"]);
    const explicitPermissions =
      this.auth.normalizePermissions(configuredPermissions);

    return {
      userId: this.config.get<string>(
        "app.auth.serviceTokenUserId",
        "service-token-user",
      ),
      tenantId:
        this.header(request, "x-tenant-id") ??
        this.config.get<string>("app.auth.serviceTokenTenantId", "default"),
      roles,
      permissions: this.auth.mergePermissions(roles, explicitPermissions),
      authType: "service_token",
    };
  }

  private tokenHash(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
  }

  private authenticateApiKey(request: Request): RequestUser | undefined {
    const configuredApiKey = this.config.get<string>("app.auth.apiKey");
    const configuredJwtSecret = this.config.get<string>("app.auth.jwtSecret");
    const configuredServiceToken = this.config.get<string>(
      "app.auth.serviceToken",
    );
    const nodeEnv = this.config.get<string>("app.nodeEnv", "development");

    if (
      !configuredApiKey &&
      !configuredJwtSecret &&
      !configuredServiceToken &&
      nodeEnv !== "production"
    ) {
      return this.devUser();
    }

    const requestApiKey = this.header(request, "x-api-key");
    if (!configuredApiKey || requestApiKey !== configuredApiKey) {
      return undefined;
    }

    const roles: Role[] = ["developer"];
    return {
      userId: this.header(request, "x-user-id") ?? "api-key-user",
      tenantId: this.header(request, "x-tenant-id") ?? "default",
      roles,
      permissions: this.auth.permissionsForRoles(roles),
      authType: "api_key",
    };
  }

  private header(request: Request, name: string): string | undefined {
    const value = request.headers[name];
    if (Array.isArray(value)) {
      return value[0];
    }
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }

  private devUser(): RequestUser {
    const roles: Role[] = ["admin"];
    return {
      userId: "dev-user",
      tenantId: "default",
      roles,
      permissions: this.auth.permissionsForRoles(roles),
      authType: "dev",
    };
  }

  private bearerToken(request: Request): string | undefined {
    const authorization = this.header(request, "authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return undefined;
    }
    return authorization.slice("Bearer ".length).trim() || undefined;
  }

  private verifyJwt(token: string, secret: string): JwtPayload {
    const parts = token.split(".");
    if (parts.length !== 3) {
      throw new UnauthorizedException("Invalid JWT");
    }

    const [encodedHeader, encodedPayload, encodedSignature] = parts;
    if (!encodedHeader || !encodedPayload || !encodedSignature) {
      throw new UnauthorizedException("Invalid JWT");
    }

    const header = this.parseJson(this.base64UrlDecode(encodedHeader)) as {
      alg?: unknown;
    };
    if (header.alg !== "HS256") {
      throw new UnauthorizedException("Unsupported JWT algorithm");
    }

    const expected = crypto
      .createHmac("sha256", secret)
      .update(`${encodedHeader}.${encodedPayload}`)
      .digest("base64url");
    if (!this.constantTimeEquals(expected, encodedSignature)) {
      throw new UnauthorizedException("Invalid JWT signature");
    }

    const payload = this.parseJson(
      this.base64UrlDecode(encodedPayload),
    ) as JwtPayload;
    if (
      typeof payload.exp === "number" &&
      Math.floor(Date.now() / 1_000) >= payload.exp
    ) {
      throw new UnauthorizedException("JWT expired");
    }
    return payload;
  }

  private claimString(value: unknown, name: string): string {
    if (typeof value !== "string" || !value.trim()) {
      throw new UnauthorizedException(`Missing JWT claim: ${name}`);
    }
    return value.trim();
  }

  private assertTenantHeaderMatches(request: Request, tenantId: string): void {
    const headerTenantId = this.header(request, "x-tenant-id");
    if (headerTenantId && headerTenantId !== tenantId) {
      throw new UnauthorizedException("Tenant header does not match token");
    }
  }

  private matchesAudience(value: unknown, expected: string): boolean {
    if (typeof value === "string") {
      return value === expected;
    }
    return Array.isArray(value) && value.includes(expected);
  }

  private base64UrlDecode(value: string): string {
    try {
      return Buffer.from(value, "base64url").toString("utf8");
    } catch {
      throw new UnauthorizedException("Invalid JWT encoding");
    }
  }

  private parseJson(value: string): unknown {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      throw new UnauthorizedException("Invalid JWT JSON");
    }
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
