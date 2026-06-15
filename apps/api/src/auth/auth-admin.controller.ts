import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { ApiKeyGuard } from "./api-key.guard.js";
import {
  AuthAdminService,
  type AuthAuditEventListResponse,
  type AuthRoleResponse,
  type CreatedServiceTokenResponse,
  type SecurityAnomalyEventListResponse,
  type SecurityAnomalyEventResponse,
  type ServiceTokenResponse,
  type UserRoleAssignmentResponse,
} from "./auth-admin.service.js";
import {
  AuthSessionService,
  type AuthSessionResponse,
  type CreatedRefreshTokenResponse,
  type RefreshTokenResponse,
  type RefreshTokenVerificationResponse,
} from "./auth-session.service.js";
import type { RequestUser } from "./auth.types.js";
import { CurrentUser } from "./current-user.decorator.js";
import { AcknowledgeSecurityAnomalyDto } from "./dto/acknowledge-security-anomaly.dto.js";
import { AssignUserRoleDto } from "./dto/assign-user-role.dto.js";
import { AuthAdminReasonDto } from "./dto/auth-admin-common.dto.js";
import { CreateRefreshTokenDto } from "./dto/create-refresh-token.dto.js";
import { CreateAuthRoleDto } from "./dto/create-auth-role.dto.js";
import { CreateServiceTokenDto } from "./dto/create-service-token.dto.js";
import { ListAuditEventsDto } from "./dto/list-audit-events.dto.js";
import { ListSecurityAnomaliesDto } from "./dto/list-security-anomalies.dto.js";
import { RegisterAuthSessionDto } from "./dto/register-auth-session.dto.js";
import { UpdateAuthRoleDto } from "./dto/update-auth-role.dto.js";
import { UpdateServiceTokenDto } from "./dto/update-service-token.dto.js";
import { VerifyRefreshTokenDto } from "./dto/verify-refresh-token.dto.js";
import { RequirePermissions } from "./permissions.decorator.js";
import { PermissionsGuard } from "./permissions.guard.js";

@Controller("auth")
@UseGuards(ApiKeyGuard, PermissionsGuard)
@RequirePermissions("auth:manage")
export class AuthAdminController {
  constructor(
    private readonly authAdmin: AuthAdminService,
    private readonly authSessions: AuthSessionService,
  ) {}

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
    @Query() query: ListAuditEventsDto,
    @CurrentUser() user: RequestUser,
  ): Promise<AuthAuditEventListResponse> {
    return this.authAdmin.listAuditEvents(user, query);
  }

  @Get("security/anomalies")
  listSecurityAnomalies(
    @Query() query: ListSecurityAnomaliesDto,
    @CurrentUser() user: RequestUser,
  ): Promise<SecurityAnomalyEventListResponse> {
    return this.authAdmin.listSecurityAnomalies(user, query);
  }

  @Post("security/anomalies/:eventId/acknowledge")
  acknowledgeSecurityAnomaly(
    @Param("eventId") eventId: string,
    @Body() body: AcknowledgeSecurityAnomalyDto,
    @CurrentUser() user: RequestUser,
  ): Promise<SecurityAnomalyEventResponse> {
    return this.authAdmin.acknowledgeSecurityAnomaly(eventId, body, user);
  }

  @Get("sessions")
  listSessions(@CurrentUser() user: RequestUser): Promise<AuthSessionResponse[]> {
    return this.authSessions.listSessions(user);
  }

  @Post("sessions")
  registerSession(
    @Body() body: RegisterAuthSessionDto,
    @CurrentUser() user: RequestUser,
  ): Promise<AuthSessionResponse> {
    return this.authSessions.registerSession(body, user);
  }

  @Post("sessions/:sessionId/revoke")
  revokeSession(
    @Param("sessionId") sessionId: string,
    @Body() body: AuthAdminReasonDto,
    @CurrentUser() user: RequestUser,
  ): Promise<AuthSessionResponse> {
    return this.authSessions.revokeSession(sessionId, body, user);
  }

  @Get("refresh-tokens")
  listRefreshTokens(
    @CurrentUser() user: RequestUser,
  ): Promise<RefreshTokenResponse[]> {
    return this.authSessions.listRefreshTokens(user);
  }

  @Post("sessions/:sessionId/refresh-tokens")
  createRefreshToken(
    @Param("sessionId") sessionId: string,
    @Body() body: CreateRefreshTokenDto,
    @CurrentUser() user: RequestUser,
  ): Promise<CreatedRefreshTokenResponse> {
    return this.authSessions.createRefreshToken(sessionId, body, user);
  }

  @Post("refresh-tokens/verify")
  verifyRefreshToken(
    @Body() body: VerifyRefreshTokenDto,
    @CurrentUser() user: RequestUser,
  ): Promise<RefreshTokenVerificationResponse> {
    return this.authSessions.verifyRefreshToken(body.token, user);
  }

  @Post("refresh-tokens/:refreshTokenId/rotate")
  rotateRefreshToken(
    @Param("refreshTokenId") refreshTokenId: string,
    @Body() body: CreateRefreshTokenDto,
    @CurrentUser() user: RequestUser,
  ): Promise<CreatedRefreshTokenResponse> {
    return this.authSessions.rotateRefreshToken(refreshTokenId, body, user);
  }

  @Post("refresh-tokens/:refreshTokenId/revoke")
  revokeRefreshToken(
    @Param("refreshTokenId") refreshTokenId: string,
    @Body() body: AuthAdminReasonDto,
    @CurrentUser() user: RequestUser,
  ): Promise<RefreshTokenResponse> {
    return this.authSessions.revokeRefreshToken(refreshTokenId, body, user);
  }
}
