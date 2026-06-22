import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { randomUUID } from "node:crypto";
import { EventEmitter } from "node:events";
import { createInterface, type Interface } from "node:readline";

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

export class McpStdioClient extends EventEmitter {
  private process: ChildProcessWithoutNullStreams | undefined;
  private readline: Interface | undefined;
  private nextId = 1;
  private stderrPreview = "";
  private readonly pending = new Map<
    string | number,
    {
      resolve: (value: unknown) => void;
      reject: (error: Error) => void;
      timeout: NodeJS.Timeout;
    }
  >();

  constructor(
    private readonly config: McpServerConfig,
    private readonly connectTimeoutMs: number,
  ) {
    super();
  }

  async connect(): Promise<void> {
    if (this.process) {
      return;
    }

    const child = spawn(this.config.command, this.config.args, {
      stdio: ["pipe", "pipe", "pipe"],
      env: this.buildProcessEnv(),
      ...(this.config.cwd ? { cwd: this.config.cwd } : {}),
    });
    this.process = child;
    this.readline = createInterface({ input: child.stdout });
    this.readline.on("line", (line) => this.handleLine(line));
    child.stderr.on("data", (chunk) => {
      const message = String(chunk);
      this.stderrPreview = `${this.stderrPreview}${message}`.slice(-2_000);
      this.emit("stderr", message);
    });
    child.on("exit", (code, signal) => {
      this.rejectAll(
        new Error(
          [
            `MCP server ${this.config.name} exited: ${code ?? signal ?? "unknown"}`,
            this.stderrPreview.trim() ? this.stderrPreview.trim() : undefined,
          ].filter(Boolean).join(" - "),
        ),
      );
      this.process = undefined;
      this.readline?.close();
      this.readline = undefined;
    });

    await this.request("initialize", {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: {
        name: "enterprise-agent-api",
        version: "0.1.0",
      },
    });
    this.notify("notifications/initialized", {});
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
    this.rejectAll(new Error(`MCP server ${this.config.name} closed`));
    this.readline?.close();
    this.process?.kill();
    this.process = undefined;
    this.readline = undefined;
  }

  private request(
    method: string,
    params: Record<string, unknown>,
    timeoutMs = this.connectTimeoutMs,
  ): Promise<unknown> {
    const child = this.process;
    if (!child) {
      throw new ToolRegistryError(
        `MCP server ${this.config.name} is not connected`,
        "TOOL_EXECUTION_FAILED",
      );
    }

    const id = this.nextId++;
    const payload = {
      jsonrpc: "2.0",
      id,
      method,
      params,
    };

    const promise = new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(
          new ToolRegistryError(
            `MCP request timed out: ${method}`,
            "TOOL_TIMEOUT",
            { serverName: this.config.name, method },
          ),
        );
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timeout });
    });

    child.stdin.write(`${JSON.stringify(payload)}\n`);
    return promise;
  }

  private notify(method: string, params: Record<string, unknown>): void {
    this.process?.stdin.write(
      `${JSON.stringify({
        jsonrpc: "2.0",
        method,
        params,
      })}\n`,
    );
  }

  private handleLine(line: string): void {
    if (!line.trim()) {
      return;
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(line) as unknown;
    } catch {
      this.emit("protocolError", `Invalid JSON from ${this.config.name}: ${line.slice(0, 200)}`);
      return;
    }

    if (!isJsonRpcResponse(parsed)) {
      return;
    }

    const pending = this.pending.get(parsed.id);
    if (!pending) {
      return;
    }
    this.pending.delete(parsed.id);
    clearTimeout(pending.timeout);

    if (parsed.error) {
      pending.reject(
        new ToolRegistryError(
          parsed.error.message,
          "TOOL_EXECUTION_FAILED",
          {
            serverName: this.config.name,
            jsonRpcCode: parsed.error.code,
            errorId: randomUUID(),
          },
        ),
      );
      return;
    }

    pending.resolve(parsed.result);
  }

  private rejectAll(error: Error): void {
    for (const [id, pending] of this.pending.entries()) {
      this.pending.delete(id);
      clearTimeout(pending.timeout);
      pending.reject(error);
    }
  }

  private buildProcessEnv(): NodeJS.ProcessEnv {
    return {
      ...(process.env.PATH ? { PATH: process.env.PATH } : {}),
      ...(process.env.HOME ? { HOME: process.env.HOME } : {}),
      ...(process.env.NODE_ENV ? { NODE_ENV: process.env.NODE_ENV } : {}),
      ...this.config.env,
    };
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
