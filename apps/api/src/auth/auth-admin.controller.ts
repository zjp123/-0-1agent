import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";

import { ApiKeyGuard } from "./api-key.guard.js";
import {
  AuthAdminService,
  type AuthAuditEventResponse,
  type AuthRoleResponse,
  type CreatedServiceTokenResponse,
  type ServiceTokenResponse,
  type UserRoleAssignmentResponse,
} from "./auth-admin.service.js";
import type { RequestUser } from "./auth.types.js";
import { CurrentUser } from "./current-user.decorator.js";
import { AssignUserRoleDto } from "./dto/assign-user-role.dto.js";
import { AuthAdminReasonDto } from "./dto/auth-admin-common.dto.js";
import { CreateAuthRoleDto } from "./dto/create-auth-role.dto.js";
import { CreateServiceTokenDto } from "./dto/create-service-token.dto.js";
import { UpdateAuthRoleDto } from "./dto/update-auth-role.dto.js";
import { UpdateServiceTokenDto } from "./dto/update-service-token.dto.js";
import { RequirePermissions } from "./permissions.decorator.js";
import { PermissionsGuard } from "./permissions.guard.js";

@Controller("auth")
@UseGuards(ApiKeyGuard, PermissionsGuard)
@RequirePermissions("auth:manage")
export class AuthAdminController {
  constructor(private readonly authAdmin: AuthAdminService) {}

  @Get("roles")
  listRoles(@CurrentUser() user: RequestUser): Promise<AuthRoleResponse[]> {
    return this.authAdmin.listRoles(user);
  }

  @Post("roles")
  createRole(
    @Body() body: CreateAuthRoleDto,
    @CurrentUser() user: RequestUser,
  ): Promise<AuthRoleResponse> {
    return this.authAdmin.createRole(body, user);
  }

  @Patch("roles/:roleId")
  updateRole(
    @Param("roleId") roleId: string,
    @Body() body: UpdateAuthRoleDto,
    @CurrentUser() user: RequestUser,
  ): Promise<AuthRoleResponse> {
    return this.authAdmin.updateRole(roleId, body, user);
  }

  @Delete("roles/:roleId")
  deleteRole(
    @Param("roleId") roleId: string,
    @Body() body: AuthAdminReasonDto,
    @CurrentUser() user: RequestUser,
  ): Promise<{ deleted: true }> {
    return this.authAdmin.deleteRole(roleId, body, user);
  }

  @Get("users/:userId/roles")
  listUserRoles(
    @Param("userId") userId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<UserRoleAssignmentResponse[]> {
    return this.authAdmin.listUserRoles(userId, user);
  }

  @Post("users/:userId/roles")
  assignUserRole(
    @Param("userId") userId: string,
    @Body() body: AssignUserRoleDto,
    @CurrentUser() user: RequestUser,
  ): Promise<UserRoleAssignmentResponse> {
    return this.authAdmin.assignUserRole(userId, body, user);
  }

  @Delete("users/:userId/roles/:roleId")
  revokeUserRole(
    @Param("userId") userId: string,
    @Param("roleId") roleId: string,
    @Body() body: AuthAdminReasonDto,
    @CurrentUser() user: RequestUser,
  ): Promise<{ revoked: true }> {
    return this.authAdmin.revokeUserRole(userId, roleId, body, user);
  }

  @Get("service-tokens")
  listServiceTokens(
    @CurrentUser() user: RequestUser,
  ): Promise<ServiceTokenResponse[]> {
    return this.authAdmin.listServiceTokens(user);
  }

  @Post("service-tokens")
  createServiceToken(
    @Body() body: CreateServiceTokenDto,
    @CurrentUser() user: RequestUser,
  ): Promise<CreatedServiceTokenResponse> {
    return this.authAdmin.createServiceToken(body, user);
  }

  @Patch("service-tokens/:tokenId")
  updateServiceToken(
    @Param("tokenId") tokenId: string,
    @Body() body: UpdateServiceTokenDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ServiceTokenResponse> {
    return this.authAdmin.updateServiceToken(tokenId, body, user);
  }

  @Post("service-tokens/:tokenId/disable")
  disableServiceToken(
    @Param("tokenId") tokenId: string,
    @Body() body: AuthAdminReasonDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ServiceTokenResponse> {
    return this.authAdmin.disableServiceToken(tokenId, body, user);
  }

  @Post("service-tokens/:tokenId/rotate")
  rotateServiceToken(
    @Param("tokenId") tokenId: string,
    @Body() body: AuthAdminReasonDto,
    @CurrentUser() user: RequestUser,
  ): Promise<CreatedServiceTokenResponse> {
    return this.authAdmin.rotateServiceToken(tokenId, body, user);
  }

  @Get("audit-events")
  listAuditEvents(
    @CurrentUser() user: RequestUser,
  ): Promise<AuthAuditEventResponse[]> {
    return this.authAdmin.listAuditEvents(user);
  }
}
