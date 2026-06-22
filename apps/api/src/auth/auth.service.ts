import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { Permission, Role } from "./auth.types.js";

export type AuthStatus = {
  enabled: boolean;
  modes: Array<"email_password" | "api_key" | "dev" | "jwt" | "service_token">;
  controls: string[];
  roles: Record<Role, Permission[]>;
};

@Injectable()
export class AuthService {
  constructor(@Inject(ConfigService) private readonly config: ConfigService) {}

  getStatus(): AuthStatus {
    const hasApiKey = Boolean(this.config.get<string>("app.auth.apiKey"));
    const hasJwtSecret = Boolean(this.config.get<string>("app.auth.jwtSecret"));
    const hasServiceToken = Boolean(
      this.config.get<string>("app.auth.serviceToken"),
    );
    const modes: AuthStatus["modes"] = [];
    modes.push("email_password");
    if (hasJwtSecret) {
      modes.push("jwt");
    }
    if (hasServiceToken) {
      modes.push("service_token");
    }
    if (hasApiKey) {
      modes.push("api_key");
    }
    if (modes.length === 0) {
      modes.push("dev");
    }

    return {
      enabled: true,
      modes,
      controls: [
        "authentication",
        "RBAC",
        "tenant isolation",
        "tool authorization",
        "audit logs",
        "break-glass controls",
      ],
      roles: ROLE_PERMISSIONS,
    };
  }

  normalizeRoles(values: unknown, fallback: Role[]): Role[] {
    const rawRoles = Array.isArray(values) ? values : [];
    const roles = rawRoles
      .filter((value): value is string => typeof value === "string")
      .map((value) => value.trim())
      .filter((value): value is Role => this.isRole(value));
    return roles.length > 0 ? [...new Set(roles)] : fallback;
  }

  normalizePermissions(values: unknown): Permission[] {
    const rawPermissions = Array.isArray(values) ? values : [];
    return [
      ...new Set(
        rawPermissions
          .filter((value): value is string => typeof value === "string")
          .map((value) => value.trim())
          .filter((value): value is Permission => this.isPermission(value)),
      ),
    ];
  }

  permissionsForRoles(roles: Role[]): Permission[] {
    return [
      ...new Set(
        roles.flatMap((role) => ROLE_PERMISSIONS[role] ?? []),
      ),
    ];
  }

  mergePermissions(roles: Role[], explicit: Permission[] = []): Permission[] {
    return [...new Set([...this.permissionsForRoles(roles), ...explicit])];
  }

  private isRole(value: string): value is Role {
    return value in ROLE_PERMISSIONS;
  }

  private isPermission(value: string): value is Permission {
    return ALL_PERMISSIONS.includes(value as Permission);
  }
}

export const ALL_PERMISSIONS: Permission[] = [
  "agent:run",
  "tools:execute",
  "knowledge:read",
  "knowledge:write",
  "observability:read",
  "workflow:manage",
  "evaluation:manage",
  "auth:manage",
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  viewer: ["knowledge:read", "observability:read"],
  operator: [
    "knowledge:read",
    "observability:read",
    "workflow:manage",
    "evaluation:manage",
  ],
  developer: [
    "agent:run",
    "tools:execute",
    "knowledge:read",
    "knowledge:write",
    "observability:read",
    "workflow:manage",
    "evaluation:manage",
  ],
  service: [
    "agent:run",
    "tools:execute",
    "knowledge:read",
    "knowledge:write",
    "observability:read",
    "workflow:manage",
    "evaluation:manage",
  ],
  admin: ALL_PERMISSIONS,
  break_glass: ALL_PERMISSIONS,
};
