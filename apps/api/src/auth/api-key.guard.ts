import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import type { Request } from "express";

import type { AuthenticatedRequest, RequestUser } from "./auth.types.js";

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & Partial<AuthenticatedRequest>>();
    const configuredApiKey = this.config.get<string>("app.auth.apiKey");
    const nodeEnv = this.config.get<string>("app.nodeEnv", "development");

    if (!configuredApiKey && nodeEnv !== "production") {
      request.user = this.devUser();
      return true;
    }

    const requestApiKey = this.header(request, "x-api-key");
    if (!configuredApiKey || requestApiKey !== configuredApiKey) {
      throw new UnauthorizedException("Invalid API key");
    }

    request.user = {
      userId: this.header(request, "x-user-id") ?? "api-key-user",
      tenantId: this.header(request, "x-tenant-id") ?? "default",
      roles: ["developer"],
      permissions: [
        "agent:run",
        "tools:execute",
        "knowledge:read",
        "knowledge:write",
        "observability:read",
      ],
      authType: "api_key",
    };
    return true;
  }

  private header(request: Request, name: string): string | undefined {
    const value = request.headers[name];
    if (Array.isArray(value)) {
      return value[0];
    }
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }

  private devUser(): RequestUser {
    return {
      userId: "dev-user",
      tenantId: "default",
      roles: ["admin"],
      permissions: [
        "agent:run",
        "tools:execute",
        "knowledge:read",
        "knowledge:write",
        "observability:read",
      ],
      authType: "dev",
    };
  }
}
