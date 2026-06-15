import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from "@nestjs/common";

import { ApiKeyGuard } from "../auth/api-key.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { RequirePermissions } from "../auth/permissions.decorator.js";
import { PermissionsGuard } from "../auth/permissions.guard.js";
import type { RequestUser } from "../auth/auth.types.js";
import { CreateProviderCredentialDto } from "./dto/create-provider-credential.dto.js";
import { CreateSecretDto } from "./dto/create-secret.dto.js";
import { ReadSecretValueDto } from "./dto/read-secret-value.dto.js";
import { RotateSecretDto } from "./dto/rotate-secret.dto.js";
import { UpdateSecretDto } from "./dto/update-secret.dto.js";
import {
  ProviderCredentialResponse,
  SecretMetadataResponse,
  SecretValueResponse,
  SecretsService,
} from "./secrets.service.js";

@Controller("secrets")
@UseGuards(ApiKeyGuard, PermissionsGuard)
@RequirePermissions("auth:manage")
export class SecretsController {
  constructor(private readonly secrets: SecretsService) {}

  @Get()
  listSecrets(@CurrentUser() user: RequestUser): Promise<SecretMetadataResponse[]> {
    return this.secrets.listSecrets(user);
  }

  @Post()
  createSecret(
    @Body() body: CreateSecretDto,
    @CurrentUser() user: RequestUser,
  ): Promise<SecretMetadataResponse> {
    return this.secrets.createSecret(body, user);
  }

  @Get("provider-credentials")
  listProviderCredentials(
    @CurrentUser() user: RequestUser,
  ): Promise<ProviderCredentialResponse[]> {
    return this.secrets.listProviderCredentials(user);
  }

  @Post("provider-credentials")
  createProviderCredential(
    @Body() body: CreateProviderCredentialDto,
    @CurrentUser() user: RequestUser,
  ): Promise<ProviderCredentialResponse> {
    return this.secrets.createProviderCredential(body, user);
  }

  @Get(":secretId/value")
  getSecretValue(
    @Param("secretId") secretId: string,
    @Query() query: ReadSecretValueDto,
    @CurrentUser() user: RequestUser,
  ): Promise<SecretValueResponse> {
    return this.secrets.getSecretValue(secretId, query, user);
  }

  @Patch(":secretId")
  updateSecret(
    @Param("secretId") secretId: string,
    @Body() body: UpdateSecretDto,
    @CurrentUser() user: RequestUser,
  ): Promise<SecretMetadataResponse> {
    return this.secrets.updateSecret(secretId, body, user);
  }

  @Post(":secretId/rotate")
  rotateSecret(
    @Param("secretId") secretId: string,
    @Body() body: RotateSecretDto,
    @CurrentUser() user: RequestUser,
  ): Promise<SecretMetadataResponse> {
    return this.secrets.rotateSecret(secretId, body, user);
  }
}
