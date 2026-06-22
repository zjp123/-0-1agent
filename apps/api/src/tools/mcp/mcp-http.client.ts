import { randomUUID } from "node:crypto";

import { ToolRegistryError } from "../tool-registry.errors.js";
import type { JsonObject } from "../tool.types.js";
import type {
  McpCallToolResult,
  McpServerConfig,
  McpToolDefinition,
} from "./mcp.types.js";

type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: string | number;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

export class McpHttpClient {
  private nextId = 1;

  constructor(
    private readonly config: McpServerConfig,
    private readonly connectTimeoutMs: number,
  ) {}

  async connect(): Promise<void> {
    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "enterprise-agent-api",
        version: "0.1.0",
      },
    });
  }

  async listTools(timeoutMs = this.connectTimeoutMs): Promise<McpToolDefinition[]> {
    const result = await this.request("tools/list", {}, timeoutMs);
    if (!isObject(result) || !Array.isArray(result["tools"])) {
      return [];
    }
    return result["tools"].filter(isMcpToolDefinition);
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<McpCallToolResult> {
    const result = await this.request(
      "tools/call",
      {
        name,
        arguments: args,
      },
      timeoutMs,
    );

    if (!isObject(result)) {
      return {};
    }

    const response: McpCallToolResult = {};
    if (Array.isArray(result["content"])) {
      response.content = result["content"].filter(isContentItem);
    }
    if (isObject(result["structuredContent"])) {
      response.structuredContent = result["structuredContent"] as JsonObject;
    }
    if (typeof result["isError"] === "boolean") {
      response.isError = result["isError"];
    }
    return response;
  }

  close(): void {
    // Remote HTTP clients do not hold a long-lived child process.
  }

  private async request(
    method: string,
    params: Record<string, unknown>,
    timeoutMs = this.connectTimeoutMs,
  ): Promise<unknown> {
    if (!this.config.url) {
      throw new ToolRegistryError(
        `MCP server ${this.config.name} is missing url`,
        "TOOL_EXECUTION_FAILED",
      );
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const id = this.nextId++;
    try {
      const response = await fetch(this.config.url, {
        method: "POST",
        headers: this.buildHeaders(),
        body: JSON.stringify({
          jsonrpc: "2.0",
          id,
          method,
          params,
        }),
        signal: controller.signal,
      });

      const text = await response.text();
      if (!response.ok) {
        throw new ToolRegistryError(
          `MCP HTTP ${response.status}: ${text.slice(0, 500)}`,
          "TOOL_EXECUTION_FAILED",
          { serverName: this.config.name, method },
        );
      }

      let payload: unknown;
      try {
        payload = JSON.parse(text) as unknown;
      } catch {
        throw new ToolRegistryError(
          `Invalid JSON from MCP server ${this.config.name}`,
          "TOOL_EXECUTION_FAILED",
          { serverName: this.config.name, method },
        );
      }

      if (!isJsonRpcResponse(payload)) {
        throw new ToolRegistryError(
          `Invalid JSON-RPC response from MCP server ${this.config.name}`,
          "TOOL_EXECUTION_FAILED",
          { serverName: this.config.name, method },
        );
      }

      if (payload.error) {
        throw new ToolRegistryError(
          payload.error.message,
          "TOOL_EXECUTION_FAILED",
          {
            serverName: this.config.name,
            jsonRpcCode: payload.error.code,
            errorId: randomUUID(),
          },
        );
      }

      return payload.result;
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") {
        throw new ToolRegistryError(
          `MCP request timed out: ${method}`,
          "TOOL_TIMEOUT",
          { serverName: this.config.name, method },
        );
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      accept: "application/json, text/event-stream",
      "content-type": "application/json",
      ...(this.config.headers ?? {}),
    };
    const authSecret = this.resolveAuthSecret();
    if (this.config.authType === "bearer" && authSecret) {
      headers.authorization = `Bearer ${authSecret}`;
    }
    if (this.config.authType === "api_key" && authSecret) {
      headers["x-api-key"] = authSecret;
    }
    return headers;
  }

  private resolveAuthSecret(): string | undefined {
    const ref = this.config.authSecretRef?.trim();
    if (!ref) {
      return undefined;
    }
    if (ref.startsWith("env:")) {
      return process.env[ref.slice("env:".length)];
    }
    return this.config.env[ref] ?? ref;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isJsonRpcResponse(value: unknown): value is JsonRpcResponse {
  return (
    isObject(value) &&
    value["jsonrpc"] === "2.0" &&
    (typeof value["id"] === "string" || typeof value["id"] === "number")
  );
}

function isMcpToolDefinition(value: unknown): value is McpToolDefinition {
  return isObject(value) && typeof value["name"] === "string";
}

function isContentItem(value: unknown): value is NonNullable<McpCallToolResult["content"]>[number] {
  return isObject(value) && typeof value["type"] === "string";
}
