import { Module } from "@nestjs/common";

import { ApiKeyGuard } from "./api-key.guard.js";
import { AuthAdminController } from "./auth-admin.controller.js";
import { AuthAdminService } from "./auth-admin.service.js";
import { AuthRbacService } from "./auth-rbac.service.js";
import { AuthService } from "./auth.service.js";
import { PermissionsGuard } from "./permissions.guard.js";

@Module({
  controllers: [AuthAdminController],
  providers: [
    AuthService,
    AuthAdminService,
    AuthRbacService,
    ApiKeyGuard,
    PermissionsGuard,
  ],
  exports: [
    AuthService,
    AuthAdminService,
    AuthRbacService,
    ApiKeyGuard,
    PermissionsGuard,
  ],
})
export class AuthModule {}
