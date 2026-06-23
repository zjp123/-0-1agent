import { Inject, Injectable, Logger, OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type {
  ToolDefinition,
  ToolHandler,
  ToolRiskLevel,
} from "../tool.types.js";
import { McpServerManagementService } from "./mcp-server-management.service.js";
import { McpHttpClient } from "./mcp-http.client.js";
import { McpStdioClient } from "./mcp-stdio.client.js";
import { McpToolHandler, type McpToolClient } from "./mcp-tool.handler.js";
import {
  normalizeMcpToolName,
  toToolInputSchema,
  type McpServerConfig,
  type McpToolDefinition,
} from "./mcp.types.js";

type ManagedMcpClient = McpToolClient & {
  connect(): Promise<void>;
  listTools(timeoutMs?: number): Promise<McpToolDefinition[]>;
  close(): void;
};

export type McpToolProviderStatus = {
  enabled: boolean;
  servers: Array<{
    name: string;
    tenantId?: string;
    disabled: boolean;
    toolCount: number;
    error?: string;
    source: "env" | "db";
  }>;
};

@Injectable()
export class McpToolProviderService implements OnApplicationShutdown {
  private readonly logger = new Logger(McpToolProviderService.name);
  private readonly clients: ManagedMcpClient[] = [];
  private status: McpToolProviderStatus = { enabled: false, servers: [] };

  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService,
    @Inject(McpServerManagementService)
    private readonly serverManagement: McpServerManagementService,
  ) {}

  async loadHandlers(): Promise<ToolHandler[]> {
    this.closeClients();
    const forceDisabled = this.config.get<boolean>("app.tools.mcpForceDisabled", false);
    const envServers = this.config.get<McpServerConfig[]>("app.tools.mcpServers", []);
    const dbServers = forceDisabled ? [] : await this.serverManagement.listEnabledConfigs();
    const enabled = !forceDisabled && (envServers.length > 0 || dbServers.length > 0);
    const serverEntries = [
      ...envServers.map((server) => ({ server, source: "env" as const })),
      ...dbServers.map((server) => ({ server, source: "db" as const })),
    ];
    this.status = {
      enabled,
      servers: serverEntries.map(({ server, source }) => ({
        name: server.name,
        ...(server.tenantId ? { tenantId: server.tenantId } : {}),
        disabled: server.disabled,
        toolCount: 0,
        source,
      })),
    };

    if (!enabled || serverEntries.length === 0) {
      return [];
    }

    const handlers: ToolHandler[] = [];
    for (const { server, source } of serverEntries) {
      if (server.disabled) {
        continue;
      }

      const statusEntry = this.status.servers.find(
        (item) => item.name === server.name && item.tenantId === server.tenantId,
      );
      try {
        const client = this.createClient(server);
        await client.connect();
        this.clients.push(client);

        const tools = await client.listTools();
        for (const tool of tools) {
          const definition = this.toToolDefinition(
            server,
            tool.name,
            tool.description,
            tool.inputSchema,
          );
          handlers.push(new McpToolHandler(client, tool.name, definition));
        }
        if (statusEntry) {
          statusEntry.toolCount = tools.length;
        }
        if (source === "db") {
          await this.serverManagement.markLoadResult(server, {
            ok: true,
            loadedAt: new Date(),
          });
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load MCP server";
        if (statusEntry) {
          statusEntry.error = message;
        }
        if (source === "db") {
          await this.serverManagement.markLoadResult(server, {
            ok: false,
            error: message,
          });
        }
        this.logger.warn(`Failed to load MCP server ${server.name}: ${message}`);
      }
    }

    return handlers;
  }

  getStatus(): McpToolProviderStatus {
    return this.status;
  }

  onApplicationShutdown(): void {
    this.closeClients();
  }

  private closeClients(): void {
    for (const client of this.clients) {
      client.close();
    }
    this.clients.length = 0;
  }

  private createClient(server: McpServerConfig): ManagedMcpClient {
    const timeoutMs = this.config.get<number>("app.tools.mcpConnectTimeoutMs", 10_000);
    if (server.transport === "streamable_http") {
      return new McpHttpClient(server, timeoutMs);
    }

    const client = new McpStdioClient(server, timeoutMs);
    client.on("stderr", (message) => {
      this.logger.debug(`MCP ${server.name} stderr: ${String(message).trim()}`);
    });
    client.on("protocolError", (message) => {
      this.logger.warn(String(message));
    });
    return client;
  }

  private toToolDefinition(
    server: McpServerConfig,
    toolName: string,
    description: string | undefined,
    inputSchema: unknown,
  ): ToolDefinition {
    const timeoutMs =
      server.timeoutMs ??
      this.config.get<number>("app.tools.mcpToolTimeoutMs", 15_000);
    const riskLevel: ToolRiskLevel = this.normalizeRiskLevel(server.riskLevel);

    return {
      name: normalizeMcpToolName(server.name, toolName, server.toolNamePrefix),
      description:
        description ??
        `MCP tool ${toolName} from server ${server.name}.`,
      source: "mcp",
      riskLevel,
      ...(server.tenantId ? { tenantId: server.tenantId } : {}),
      ...(server.id ? { serverId: server.id } : {}),
      serverName: server.name,
      inputSchema: toToolInputSchema(inputSchema),
      timeoutMs,
      maxResultLength: 8_000,
      requiredPermissions: server.requiredPermissions ?? ["tools:execute"],
    };
  }

  private normalizeRiskLevel(value: unknown): ToolRiskLevel {
    return value === "low" ||
      value === "medium" ||
      value === "high" ||
      value === "critical"
      ? value
      : "medium";
  }
}
