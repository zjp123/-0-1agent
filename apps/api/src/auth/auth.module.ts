import { Module } from "@nestjs/common";

import { ApiKeyGuard } from "./api-key.guard.js";
import { AuthRbacService } from "./auth-rbac.service.js";
import { AuthService } from "./auth.service.js";
import { PermissionsGuard } from "./permissions.guard.js";

@Module({
  providers: [AuthService, AuthRbacService, ApiKeyGuard, PermissionsGuard],
  exports: [AuthService, AuthRbacService, ApiKeyGuard, PermissionsGuard],
})
export class AuthModule {}
