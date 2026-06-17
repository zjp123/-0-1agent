import { Inject, Injectable, Logger, OnApplicationShutdown } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type {
  ToolDefinition,
  ToolHandler,
  ToolRiskLevel,
} from "../tool.types.js";
import { McpStdioClient } from "./mcp-stdio.client.js";
import { McpToolHandler } from "./mcp-tool.handler.js";
import {
  normalizeMcpToolName,
  toToolInputSchema,
  type McpServerConfig,
} from "./mcp.types.js";

export type McpToolProviderStatus = {
  enabled: boolean;
  servers: Array<{
    name: string;
    disabled: boolean;
    toolCount: number;
    error?: string;
  }>;
};

@Injectable()
export class McpToolProviderService implements OnApplicationShutdown {
  private readonly logger = new Logger(McpToolProviderService.name);
  private readonly clients: McpStdioClient[] = [];
  private status: McpToolProviderStatus = { enabled: false, servers: [] };

  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService,
  ) {}

  async loadHandlers(): Promise<ToolHandler[]> {
    const enabled = this.config.get<boolean>("app.tools.mcpEnabled", false);
    const servers = this.config.get<McpServerConfig[]>("app.tools.mcpServers", []);
    this.status = {
      enabled,
      servers: servers.map((server) => ({
        name: server.name,
        disabled: server.disabled,
        toolCount: 0,
      })),
    };

    if (!enabled || servers.length === 0) {
      return [];
    }

    const handlers: ToolHandler[] = [];
    for (const server of servers) {
      if (server.disabled) {
        continue;
      }

      const statusEntry = this.status.servers.find((item) => item.name === server.name);
      try {
        const client = new McpStdioClient(
          server,
          this.config.get<number>("app.tools.mcpConnectTimeoutMs", 10_000),
        );
        client.on("stderr", (message) => {
          this.logger.debug(`MCP ${server.name} stderr: ${String(message).trim()}`);
        });
        client.on("protocolError", (message) => {
          this.logger.warn(String(message));
        });
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
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load MCP server";
        if (statusEntry) {
          statusEntry.error = message;
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
    for (const client of this.clients) {
      client.close();
    }
    this.clients.length = 0;
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
