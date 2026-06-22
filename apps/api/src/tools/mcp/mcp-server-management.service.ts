import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";

import type { RequestUser } from "../../auth/auth.types.js";
import { DRIZZLE_DB } from "../../db/database.constants.js";
import type { Database } from "../../db/database.types.js";
import { IdentityService } from "../../db/identity.service.js";
import { authAdminAuditEvents, mcpServers } from "../../db/schema.js";
import type { CreateMcpServerDto } from "../dto/create-mcp-server.dto.js";
import type { McpServerActionDto } from "../dto/mcp-server-action.dto.js";
import type { UpdateMcpServerDto } from "../dto/update-mcp-server.dto.js";
import type { ToolRiskLevel } from "../tool.types.js";
import type { McpServerConfig } from "./mcp.types.js";

export type McpServerStatus =
  | "pending_approval"
  | "active"
  | "disabled"
  | "error";

export type McpServerResponse = {
  id: string;
  tenantId: string;
  name: string;
  transport: "stdio";
  command: string;
  args: string[];
  env: Record<string, string>;
  enabled: boolean;
  status: McpServerStatus;
  riskLevel: ToolRiskLevel;
  requiredPermissions: string[];
  toolNamePrefix?: string;
  timeoutMs?: number;
  commandPolicy: string;
  approvalRequired: boolean;
  lastLoadedAt?: string;
  lastError?: string;
  metadata: Record<string, unknown>;
  createdBy: string;
  approvedBy?: string;
  approvedAt?: string;
  createdAt: string;
  updatedAt: string;
};

const ALLOWED_COMMANDS = new Set(["node", "npx"]);
const DEFAULT_REQUIRED_PERMISSIONS = ["tools:execute"];

@Injectable()
export class McpServerManagementService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    @Inject(IdentityService)
    private readonly identity: IdentityService,
  ) {}

  async listServers(actor: RequestUser): Promise<McpServerResponse[]> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    const rows = await this.db
      .select()
      .from(mcpServers)
      .where(eq(mcpServers.tenantId, tenantUuid))
      .orderBy(desc(mcpServers.createdAt));

    return rows.map((row) => this.toResponse(row, actor.tenantId));
  }

  async createServer(
    body: CreateMcpServerDto,
    actor: RequestUser,
  ): Promise<McpServerResponse> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    const normalized = this.normalizeInput(body);
    await this.assertNameAvailable(tenantUuid, normalized.name);
    await this.assertRuntimeNameAvailable(normalized.name);
    const policy = this.evaluatePolicy(normalized.command, normalized.riskLevel);
    const enabled = (body.enabled ?? true) && !policy.approvalRequired;
    const now = new Date();

    const [created] = await this.db
      .insert(mcpServers)
      .values({
        tenantId: tenantUuid,
        name: normalized.name,
        transport: normalized.transport,
        command: normalized.command,
        args: normalized.args,
        env: normalized.env,
        enabled,
        status: enabled ? "active" : "pending_approval",
        riskLevel: normalized.riskLevel,
        requiredPermissions: normalized.requiredPermissions,
        toolNamePrefix: normalized.toolNamePrefix,
        timeoutMs: normalized.timeoutMs,
        commandPolicy: policy.commandPolicy,
        approvalRequired: policy.approvalRequired,
        metadata: normalized.metadata,
        createdBy: actor.userId,
        ...(enabled ? { approvedBy: actor.userId, approvedAt: now } : {}),
      })
      .returning();

    if (!created) {
      throw new Error("Failed to create MCP server");
    }

    await this.recordAudit({
      tenantUuid,
      actor,
      action: "tools.mcp_server.create",
      targetId: created.id,
      reason: body.reason,
      comment: body.comment,
      metadata: {
        name: created.name,
        command: created.command,
        status: created.status,
        riskLevel: created.riskLevel,
        approvalRequired: created.approvalRequired,
      },
    });

    return this.toResponse(created, actor.tenantId);
  }

  async updateServer(
    serverId: string,
    body: UpdateMcpServerDto,
    actor: RequestUser,
  ): Promise<McpServerResponse> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    const existing = await this.getTenantServer(tenantUuid, serverId);
    if (body.name !== undefined) {
      await this.assertNameAvailable(tenantUuid, body.name.trim(), serverId);
      await this.assertRuntimeNameAvailable(body.name.trim(), serverId);
    }

    const riskLevel = this.normalizeRiskLevel(body.riskLevel ?? existing.riskLevel);
    const command = body.command?.trim() ?? existing.command;
    const policy = this.evaluatePolicy(command, riskLevel);
    const requestedEnabled = body.enabled ?? existing.enabled;
    const allowedToEnable = requestedEnabled && !policy.approvalRequired;
    const updates: Partial<typeof mcpServers.$inferInsert> = {
      updatedAt: new Date(),
      status: allowedToEnable ? "active" : requestedEnabled ? "pending_approval" : "disabled",
      enabled: allowedToEnable,
      riskLevel,
      command,
      commandPolicy: policy.commandPolicy,
      approvalRequired: policy.approvalRequired,
      lastError: null,
    };

    if (body.name !== undefined) {
      updates.name = body.name.trim();
    }
    if (body.transport !== undefined) {
      updates.transport = body.transport;
    }
    if (body.args !== undefined) {
      updates.args = this.normalizeStringArray(body.args, "args");
    }
    if (body.env !== undefined) {
      updates.env = this.normalizeEnv(body.env);
    }
    if (body.requiredPermissions !== undefined) {
      updates.requiredPermissions = this.normalizeRequiredPermissions(
        body.requiredPermissions,
      );
    }
    if (body.toolNamePrefix !== undefined) {
      updates.toolNamePrefix = body.toolNamePrefix.trim() || null;
    }
    if (body.timeoutMs !== undefined) {
      updates.timeoutMs = body.timeoutMs;
    }
    if (body.metadata !== undefined) {
      updates.metadata = body.metadata;
    }
    if (allowedToEnable) {
      updates.approvedBy = actor.userId;
      updates.approvedAt = new Date();
    }

    const [updated] = await this.db
      .update(mcpServers)
      .set(updates)
      .where(and(eq(mcpServers.tenantId, tenantUuid), eq(mcpServers.id, serverId)))
      .returning();

    if (!updated) {
      throw new Error("Failed to update MCP server");
    }

    await this.recordAudit({
      tenantUuid,
      actor,
      action: "tools.mcp_server.update",
      targetId: serverId,
      reason: body.reason,
      comment: body.comment,
      metadata: {
        changed: Object.keys(updates).filter((key) => key !== "updatedAt"),
        status: updated.status,
        approvalRequired: updated.approvalRequired,
      },
    });

    return this.toResponse(updated, actor.tenantId);
  }

  async approveServer(
    serverId: string,
    body: McpServerActionDto,
    actor: RequestUser,
  ): Promise<McpServerResponse> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    const server = await this.getTenantServer(tenantUuid, serverId);
    const policy = this.evaluatePolicy(
      server.command,
      this.normalizeRiskLevel(server.riskLevel),
    );
    const now = new Date();

    const [updated] = await this.db
      .update(mcpServers)
      .set({
        enabled: true,
        status: "active",
        approvalRequired: policy.approvalRequired,
        approvedBy: actor.userId,
        approvedAt: now,
        updatedAt: now,
        lastError: null,
      })
      .where(and(eq(mcpServers.tenantId, tenantUuid), eq(mcpServers.id, serverId)))
      .returning();

    if (!updated) {
      throw new Error("Failed to approve MCP server");
    }

    await this.recordAudit({
      tenantUuid,
      actor,
      action: "tools.mcp_server.approve",
      targetId: serverId,
      reason: body.reason,
      comment: body.comment,
      metadata: {
        name: updated.name,
        command: updated.command,
        commandPolicy: updated.commandPolicy,
        highRiskOverride: policy.approvalRequired,
      },
    });

    return this.toResponse(updated, actor.tenantId);
  }

  async disableServer(
    serverId: string,
    body: McpServerActionDto,
    actor: RequestUser,
  ): Promise<McpServerResponse> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    await this.getTenantServer(tenantUuid, serverId);
    const [updated] = await this.db
      .update(mcpServers)
      .set({
        enabled: false,
        status: "disabled",
        updatedAt: new Date(),
      })
      .where(and(eq(mcpServers.tenantId, tenantUuid), eq(mcpServers.id, serverId)))
      .returning();

    if (!updated) {
      throw new Error("Failed to disable MCP server");
    }

    await this.recordAudit({
      tenantUuid,
      actor,
      action: "tools.mcp_server.disable",
      targetId: serverId,
      reason: body.reason,
      comment: body.comment,
      metadata: { name: updated.name },
    });

    return this.toResponse(updated, actor.tenantId);
  }

  async listEnabledConfigs(): Promise<McpServerConfig[]> {
    const rows = await this.db
      .select()
      .from(mcpServers)
      .where(and(eq(mcpServers.enabled, true), eq(mcpServers.status, "active")));

    return rows.map((row) => this.toRuntimeConfig(row));
  }

  async markLoadResult(
    server: { id?: string; name: string },
    result: { ok: true; loadedAt: Date } | { ok: false; error: string },
  ): Promise<void> {
    const updates: Partial<typeof mcpServers.$inferInsert> =
      result.ok
        ? {
            status: "active",
            lastLoadedAt: result.loadedAt,
            lastError: null,
            updatedAt: result.loadedAt,
          }
        : {
            status: "error",
            lastError: result.error,
            updatedAt: new Date(),
          };
    const condition = server.id
      ? eq(mcpServers.id, server.id)
      : eq(mcpServers.name, server.name);
    await this.db.update(mcpServers).set(updates).where(condition);
  }

  private normalizeInput(body: CreateMcpServerDto): {
    name: string;
    transport: "stdio";
    command: string;
    args: string[];
    env: Record<string, string>;
    riskLevel: ToolRiskLevel;
    requiredPermissions: string[];
    toolNamePrefix?: string;
    timeoutMs?: number;
    metadata: Record<string, unknown>;
  } {
    return {
      name: body.name.trim(),
      transport: body.transport ?? "stdio",
      command: body.command.trim(),
      args: this.normalizeStringArray(body.args ?? [], "args"),
      env: this.normalizeEnv(body.env ?? {}),
      riskLevel: this.normalizeRiskLevel(body.riskLevel),
      requiredPermissions: this.normalizeRequiredPermissions(
        body.requiredPermissions ?? DEFAULT_REQUIRED_PERMISSIONS,
      ),
      ...(body.toolNamePrefix?.trim()
        ? { toolNamePrefix: body.toolNamePrefix.trim() }
        : {}),
      ...(body.timeoutMs ? { timeoutMs: body.timeoutMs } : {}),
      metadata: body.metadata ?? {},
    };
  }

  private normalizeStringArray(values: unknown[], field: string): string[] {
    const normalized = values.map((value) => {
      if (typeof value !== "string") {
        throw new BadRequestException(`${field} must contain only strings`);
      }
      return value.trim();
    });
    return normalized.filter(Boolean);
  }

  private normalizeEnv(env: Record<string, unknown>): Record<string, string> {
    return Object.fromEntries(
      Object.entries(env).map(([key, value]) => {
        if (typeof value !== "string") {
          throw new BadRequestException("env values must be strings");
        }
        return [key.trim(), value];
      }).filter(([key]) => Boolean(key)),
    );
  }

  private normalizeRequiredPermissions(values: string[]): string[] {
    const permissions = values.map((value) => value.trim()).filter(Boolean);
    return permissions.length > 0 ? [...new Set(permissions)] : DEFAULT_REQUIRED_PERMISSIONS;
  }

  private normalizeRiskLevel(value: unknown): ToolRiskLevel {
    return value === "low" ||
      value === "medium" ||
      value === "high" ||
      value === "critical"
      ? value
      : "medium";
  }

  private evaluatePolicy(
    command: string,
    riskLevel: ToolRiskLevel,
  ): { commandPolicy: string; approvalRequired: boolean } {
    const commandAllowed = ALLOWED_COMMANDS.has(command);
    const highRisk = riskLevel === "high" || riskLevel === "critical";
    return {
      commandPolicy: commandAllowed ? "allowlist" : "pending_command_approval",
      approvalRequired: !commandAllowed || highRisk,
    };
  }

  private async assertNameAvailable(
    tenantUuid: string,
    name: string,
    ignoredId?: string,
  ): Promise<void> {
    const [existing] = await this.db
      .select({ id: mcpServers.id })
      .from(mcpServers)
      .where(and(eq(mcpServers.tenantId, tenantUuid), eq(mcpServers.name, name)))
      .limit(1);

    if (existing && existing.id !== ignoredId) {
      throw new ConflictException("MCP server name already exists");
    }
  }

  private async assertRuntimeNameAvailable(
    name: string,
    ignoredId?: string,
  ): Promise<void> {
    const [existing] = await this.db
      .select({ id: mcpServers.id })
      .from(mcpServers)
      .where(eq(mcpServers.name, name))
      .limit(1);

    if (existing && existing.id !== ignoredId) {
      throw new ConflictException(
        "MCP server name must be globally unique until tenant-scoped tool registry is enabled",
      );
    }
  }

  private async getTenantServer(
    tenantUuid: string,
    serverId: string,
  ): Promise<typeof mcpServers.$inferSelect> {
    const [server] = await this.db
      .select()
      .from(mcpServers)
      .where(and(eq(mcpServers.tenantId, tenantUuid), eq(mcpServers.id, serverId)))
      .limit(1);

    if (!server) {
      throw new NotFoundException("MCP server not found");
    }
    return server;
  }

  private async recordAudit(input: {
    tenantUuid: string;
    actor: RequestUser;
    action: string;
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
      targetType: "mcp_server",
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

  private toRuntimeConfig(row: typeof mcpServers.$inferSelect): McpServerConfig {
    return {
      id: row.id,
      name: row.name,
      command: row.command,
      args: row.args,
      env: row.env,
      disabled: !row.enabled || row.status !== "active",
      ...(row.toolNamePrefix ? { toolNamePrefix: row.toolNamePrefix } : {}),
      ...(row.timeoutMs ? { timeoutMs: row.timeoutMs } : {}),
      riskLevel: this.normalizeRiskLevel(row.riskLevel),
      requiredPermissions: row.requiredPermissions,
    };
  }

  private toResponse(
    row: typeof mcpServers.$inferSelect,
    externalTenantId: string,
  ): McpServerResponse {
    const response: McpServerResponse = {
      id: row.id,
      tenantId: externalTenantId,
      name: row.name,
      transport: "stdio",
      command: row.command,
      args: row.args,
      env: this.maskEnv(row.env),
      enabled: row.enabled,
      status: row.status,
      riskLevel: this.normalizeRiskLevel(row.riskLevel),
      requiredPermissions: row.requiredPermissions,
      commandPolicy: row.commandPolicy,
      approvalRequired: row.approvalRequired,
      metadata: row.metadata,
      createdBy: row.createdBy,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
    if (row.toolNamePrefix) {
      response.toolNamePrefix = row.toolNamePrefix;
    }
    if (row.timeoutMs) {
      response.timeoutMs = row.timeoutMs;
    }
    if (row.lastLoadedAt) {
      response.lastLoadedAt = row.lastLoadedAt.toISOString();
    }
    if (row.lastError) {
      response.lastError = row.lastError;
    }
    if (row.approvedBy) {
      response.approvedBy = row.approvedBy;
    }
    if (row.approvedAt) {
      response.approvedAt = row.approvedAt.toISOString();
    }
    return response;
  }

  private maskEnv(env: Record<string, string>): Record<string, string> {
    return Object.fromEntries(Object.keys(env).map((key) => [key, "********"]));
  }
}
