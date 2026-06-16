import { Module } from "@nestjs/common";

import { ApiKeyGuard } from "./api-key.guard.js";
import { AuthAdminController } from "./auth-admin.controller.js";
import { AuthAdminService } from "./auth-admin.service.js";
import { AuthRbacService } from "./auth-rbac.service.js";
import { AuthSessionService } from "./auth-session.service.js";
import { AuthService } from "./auth.service.js";
import { ConsoleAuthController } from "./console-auth.controller.js";
import { ConsoleAuthService } from "./console-auth.service.js";
import { PermissionsGuard } from "./permissions.guard.js";

@Module({
  controllers: [AuthAdminController, ConsoleAuthController],
  providers: [
    AuthService,
    AuthAdminService,
    AuthRbacService,
    AuthSessionService,
    ConsoleAuthService,
    ApiKeyGuard,
    PermissionsGuard,
  ],
  exports: [
    AuthService,
    AuthAdminService,
    AuthRbacService,
    AuthSessionService,
    ConsoleAuthService,
    ApiKeyGuard,
    PermissionsGuard,
  ],
})
export class AuthModule {}
