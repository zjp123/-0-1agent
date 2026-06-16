import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";

import { DRIZZLE_DB } from "../db/database.constants.js";
import type { Database } from "../db/database.types.js";
import { IdentityService } from "../db/identity.service.js";
import {
  authAdminAuditEvents,
  providerCredentials,
  secretValues,
} from "../db/schema.js";
import type { RequestUser } from "../auth/auth.types.js";
import { AuthAdminReasonDto } from "../auth/dto/auth-admin-common.dto.js";
import { ApprovalService } from "../governance/approval.service.js";
import { CreateProviderCredentialDto } from "./dto/create-provider-credential.dto.js";
import { CreateSecretDto } from "./dto/create-secret.dto.js";
import { ReadSecretValueDto } from "./dto/read-secret-value.dto.js";
import { RotateSecretDto } from "./dto/rotate-secret.dto.js";
import { UpdateSecretDto } from "./dto/update-secret.dto.js";
import { SecretCryptoService } from "./secret-crypto.service.js";

export type SecretMetadataResponse = {
  id: string;
  tenantId: string;
  name: string;
  provider: string;
  purpose: string;
  enabled: boolean;
  rotationRequired: boolean;
  expiresAt?: string;
  lastRotatedAt?: string;
  lastUsedAt?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type SecretValueResponse = SecretMetadataResponse & {
  value: string;
};

export type ProviderCredentialResponse = {
  id: string;
  tenantId?: string;
  provider: string;
  credentialType: string;
  secretValueId?: string;
  alias: string;
  enabled: boolean;
  expiresAt?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

@Injectable()
export class SecretsService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    @Inject(IdentityService)
    private readonly identity: IdentityService,
    @Inject(SecretCryptoService)
    private readonly crypto: SecretCryptoService,
    @Inject(ApprovalService)
    private readonly approvals: ApprovalService,
  ) {}

  async listSecrets(actor: RequestUser): Promise<SecretMetadataResponse[]> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    const rows = await this.db
      .select()
      .from(secretValues)
      .where(eq(secretValues.tenantId, tenantUuid))
      .orderBy(desc(secretValues.createdAt));

    return rows.map((row) => this.toSecretMetadata(row, actor.tenantId));
  }

  async createSecret(
    body: CreateSecretDto,
    actor: RequestUser,
  ): Promise<SecretMetadataResponse> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    const name = body.name.trim();
    await this.assertSecretNameAvailable(tenantUuid, name);

    const [created] = await this.db
      .insert(secretValues)
      .values({
        tenantId: tenantUuid,
        name,
        provider: body.provider.trim(),
        purpose: body.purpose.trim(),
        encryptedValue: this.crypto.encrypt(body.value),
        valueHash: this.crypto.hash(body.value),
        enabled: body.enabled ?? true,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
        metadata: body.metadata ?? {},
      })
      .returning();
    if (!created) {
      throw new Error("Failed to create secret");
    }

    await this.recordAudit({
      tenantUuid,
      actor,
      action: "secrets.secret.create",
      targetType: "secret_value",
      targetId: created.id,
      reason: body.reason,
      comment: body.comment,
      metadata: {
        name: created.name,
        provider: created.provider,
        purpose: created.purpose,
      },
    });

    return this.toSecretMetadata(created, actor.tenantId);
  }

  async getSecretValue(
    secretId: string,
    body: ReadSecretValueDto,
    actor: RequestUser,
  ): Promise<SecretValueResponse> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    const secret = await this.getTenantSecret(tenantUuid, secretId);
    await this.approvals.requireApproval({
      tenantId: actor.tenantId,
      userId: actor.userId,
      action: "secrets.secret.read_value",
      resourceType: "secret_value",
      resourceId: secretId,
      ...(body.approvalId ? { approvalId: body.approvalId } : {}),
    });
    const value = this.crypto.decrypt(secret.encryptedValue);
    await this.db
      .update(secretValues)
      .set({ lastUsedAt: new Date(), updatedAt: new Date() })
      .where(eq(secretValues.id, secretId));

    await this.recordAudit({
      tenantUuid,
      actor,
      action: "secrets.secret.read_value",
      targetType: "secret_value",
      targetId: secretId,
      reason: "Read secret value",
      metadata: {
        name: secret.name,
        provider: secret.provider,
        purpose: secret.purpose,
      },
    });

    return {
      ...this.toSecretMetadata(secret, actor.tenantId),
      value,
    };
  }

  async updateSecret(
    secretId: string,
    body: UpdateSecretDto,
    actor: RequestUser,
  ): Promise<SecretMetadataResponse> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    await this.getTenantSecret(tenantUuid, secretId);
    const updates: Partial<typeof secretValues.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (body.enabled !== undefined) {
      updates.enabled = body.enabled;
    }
    if (body.rotationRequired !== undefined) {
      updates.rotationRequired = body.rotationRequired;
    }
    if (body.expiresAt !== undefined) {
      updates.expiresAt = new Date(body.expiresAt);
    }
    if (body.metadata !== undefined) {
      updates.metadata = body.metadata;
    }
    if (Object.keys(updates).length === 1) {
      throw new ConflictException("No secret fields to update");
    }

    const [updated] = await this.db
      .update(secretValues)
      .set(updates)
      .where(and(eq(secretValues.tenantId, tenantUuid), eq(secretValues.id, secretId)))
      .returning();
    if (!updated) {
      throw new Error("Failed to update secret");
    }

    await this.recordAudit({
      tenantUuid,
      actor,
      action: "secrets.secret.update",
      targetType: "secret_value",
      targetId: secretId,
      reason: body.reason,
      comment: body.comment,
      metadata: {
        changed: Object.keys(updates).filter((key) => key !== "updatedAt"),
      },
    });

    return this.toSecretMetadata(updated, actor.tenantId);
  }

  async rotateSecret(
    secretId: string,
    body: RotateSecretDto,
    actor: RequestUser,
  ): Promise<SecretMetadataResponse> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    const secret = await this.getTenantSecret(tenantUuid, secretId);
    await this.approvals.requireApproval({
      tenantId: actor.tenantId,
      userId: actor.userId,
      action: "secrets.secret.rotate",
      resourceType: "secret_value",
      resourceId: secretId,
      ...(body.approvalId ? { approvalId: body.approvalId } : {}),
    });
    const now = new Date();
    const [updated] = await this.db
      .update(secretValues)
      .set({
        encryptedValue: this.crypto.encrypt(body.value),
        valueHash: this.crypto.hash(body.value),
        rotationRequired: false,
        lastRotatedAt: now,
        updatedAt: now,
      })
      .where(and(eq(secretValues.tenantId, tenantUuid), eq(secretValues.id, secretId)))
      .returning();
    if (!updated) {
      throw new Error("Failed to rotate secret");
    }

    await this.recordAudit({
      tenantUuid,
      actor,
      action: "secrets.secret.rotate",
      targetType: "secret_value",
      targetId: secretId,
      reason: body.reason,
      comment: body.comment,
      metadata: {
        name: secret.name,
        provider: secret.provider,
        purpose: secret.purpose,
      },
    });

    return this.toSecretMetadata(updated, actor.tenantId);
  }

  async listProviderCredentials(
    actor: RequestUser,
  ): Promise<ProviderCredentialResponse[]> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    const rows = await this.db
      .select()
      .from(providerCredentials)
      .where(eq(providerCredentials.tenantId, tenantUuid))
      .orderBy(desc(providerCredentials.createdAt));

    return rows.map((row) => this.toProviderCredential(row, actor.tenantId));
  }

  async createProviderCredential(
    body: CreateProviderCredentialDto,
    actor: RequestUser,
  ): Promise<ProviderCredentialResponse> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    if (body.secretValueId) {
      await this.getTenantSecret(tenantUuid, body.secretValueId);
    }

    const [created] = await this.db
      .insert(providerCredentials)
      .values({
        tenantId: tenantUuid,
        provider: body.provider.trim(),
        credentialType: body.credentialType.trim(),
        alias: body.alias.trim(),
        secretValueId: body.secretValueId,
        enabled: body.enabled ?? true,
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : undefined,
        metadata: body.metadata ?? {},
      })
      .returning();
    if (!created) {
      throw new Error("Failed to create provider credential");
    }

    await this.recordAudit({
      tenantUuid,
      actor,
      action: "secrets.provider_credential.create",
      targetType: "provider_credential",
      targetId: created.id,
      reason: body.reason,
      comment: body.comment,
      metadata: {
        provider: created.provider,
        credentialType: created.credentialType,
        alias: created.alias,
        secretValueId: created.secretValueId,
      },
    });

    return this.toProviderCredential(created, actor.tenantId);
  }

  private async assertSecretNameAvailable(
    tenantUuid: string,
    name: string,
  ): Promise<void> {
    const [existing] = await this.db
      .select({ id: secretValues.id })
      .from(secretValues)
      .where(and(eq(secretValues.tenantId, tenantUuid), eq(secretValues.name, name)))
      .limit(1);
    if (existing) {
      throw new ConflictException("Secret name already exists");
    }
  }

  private async getTenantSecret(
    tenantUuid: string,
    secretId: string,
  ): Promise<typeof secretValues.$inferSelect> {
    const [secret] = await this.db
      .select()
      .from(secretValues)
      .where(and(eq(secretValues.tenantId, tenantUuid), eq(secretValues.id, secretId)))
      .limit(1);
    if (!secret) {
      throw new NotFoundException("Secret not found");
    }
    return secret;
  }

  private async recordAudit(input: {
    tenantUuid: string;
    actor: RequestUser;
    action: string;
    targetType: string;
    targetId: string;
    reason: string;
    comment?: string | undefined;
    metadata: Record<string, unknown>;
  }): Promise<void> {
    const values: typeof authAdminAuditEvents.$inferInsert = {
      tenantId: input.tenantUuid,
      actorUserId: input.actor.userId,
      actorAuthType: input.actor.authType,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      reason: input.reason,
      metadata: input.metadata,
    };
    if (input.actor.tokenId) {
      values.actorTokenId = input.actor.tokenId;
    }
    if (input.comment) {
      values.comment = input.comment;
    }
    await this.db.insert(authAdminAuditEvents).values(values);
  }

  private toSecretMetadata(
    row: typeof secretValues.$inferSelect,
    externalTenantId: string,
  ): SecretMetadataResponse {
    const response: SecretMetadataResponse = {
      id: row.id,
      tenantId: externalTenantId,
      name: row.name,
      provider: row.provider,
      purpose: row.purpose,
      enabled: row.enabled,
      rotationRequired: row.rotationRequired,
      metadata: row.metadata,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
    if (row.expiresAt) {
      response.expiresAt = row.expiresAt.toISOString();
    }
    if (row.lastRotatedAt) {
      response.lastRotatedAt = row.lastRotatedAt.toISOString();
    }
    if (row.lastUsedAt) {
      response.lastUsedAt = row.lastUsedAt.toISOString();
    }
    return response;
  }

  private toProviderCredential(
    row: typeof providerCredentials.$inferSelect,
    externalTenantId: string,
  ): ProviderCredentialResponse {
    const response: ProviderCredentialResponse = {
      id: row.id,
      provider: row.provider,
      credentialType: row.credentialType,
      alias: row.alias,
      enabled: row.enabled,
      metadata: row.metadata,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
    if (row.tenantId) {
      response.tenantId = externalTenantId;
    }
    if (row.secretValueId) {
      response.secretValueId = row.secretValueId;
    }
    if (row.expiresAt) {
      response.expiresAt = row.expiresAt.toISOString();
    }
    return response;
  }
}
