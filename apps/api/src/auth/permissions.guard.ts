import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";

import type { AuthenticatedRequest, Permission } from "./auth.types.js";
import { PERMISSIONS_KEY } from "./permissions.decorator.js";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<Permission[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    ) ?? [];

    if (required.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const user = request.user;
    const missing = required.filter(
      (permission) => !user.permissions.includes(permission),
    );

    if (missing.length > 0) {
      throw new ForbiddenException(`Missing permissions: ${missing.join(", ")}`);
    }

    return true;
  }
}
