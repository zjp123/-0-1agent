import { Module } from "@nestjs/common";

import { ApiKeyGuard } from "./api-key.guard.js";
import { AuthService } from "./auth.service.js";
import { PermissionsGuard } from "./permissions.guard.js";

@Module({
  providers: [AuthService, ApiKeyGuard, PermissionsGuard],
  exports: [AuthService, ApiKeyGuard, PermissionsGuard],
})
export class AuthModule {}
