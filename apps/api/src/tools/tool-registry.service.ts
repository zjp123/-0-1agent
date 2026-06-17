import { Inject, Injectable, Logger, OnModuleInit } from "@nestjs/common";

import { CalculatorTool } from "./builtin/calculator.tool.js";
import { CurrentTimeTool } from "./builtin/current-time.tool.js";
import { McpToolProviderService, type McpToolProviderStatus } from "./mcp/mcp-tool-provider.service.js";
import { ToolRegistryError } from "./tool-registry.errors.js";
import { validateToolInput } from "./tool-input.validator.js";
import type {
  ToolAuditEvent,
  ToolCallRequest,
  ToolCallResponse,
  ToolDefinition,
  ToolExecutionResult,
  ToolHandler,
  ToolStatus,
} from "./tool.types.js";

export type ToolRegistryStatus = {
  builtinTools: string[];
  mcpEnabled: boolean;
  mcpTools: string[];
  mcpServers: McpToolProviderStatus["servers"];
  controls: string[];
};

@Injectable()
export class ToolRegistryService implements OnModuleInit {
  private readonly logger = new Logger(ToolRegistryService.name);
  private readonly handlers = new Map<string, ToolHandler>();

  constructor(
    @Inject(CurrentTimeTool)
    currentTimeTool: CurrentTimeTool,
    @Inject(CalculatorTool)
    calculatorTool: CalculatorTool,
    @Inject(McpToolProviderService)
    private readonly mcpTools: McpToolProviderService,
  ) {
    this.register(currentTimeTool);
    this.register(calculatorTool);
  }

  async onModuleInit(): Promise<void> {
    const handlers = await this.mcpTools.loadHandlers();
    for (const handler of handlers) {
      try {
        this.register(handler);
      } catch (error) {
        this.logger.warn(
          error instanceof Error
            ? error.message
            : `Failed to register MCP tool ${handler.definition.name}`,
        );
      }
    }
  }

  register(handler: ToolHandler): void {
    if (this.handlers.has(handler.definition.name)) {
      throw new ToolRegistryError(
        `Tool already registered: ${handler.definition.name}`,
        "TOOL_EXECUTION_FAILED",
      );
    }
    this.handlers.set(handler.definition.name, handler);
  }

  listDefinitions(): ToolDefinition[] {
    return [...this.handlers.values()].map((handler) => handler.definition);
  }

  async execute(request: ToolCallRequest): Promise<ToolCallResponse> {
    const startedAt = new Date();
    const handler = this.handlers.get(request.name);

    if (!handler) {
      return this.buildResponse({
        request,
        status: "not_found",
        startedAt,
        source: "builtin",
        riskLevel: "low",
        content: `Tool not found: ${request.name}`,
        requiredPermissions: [],
      });
    }

    const missingPermissions = handler.definition.requiredPermissions.filter(
      (permission) => !request.context.permissions.includes(permission),
    );
    if (missingPermissions.length > 0) {
      return this.buildResponse({
        request,
        status: "denied",
        startedAt,
        source: handler.definition.source,
        riskLevel: handler.definition.riskLevel,
        content: `Missing permissions: ${missingPermissions.join(", ")}`,
        requiredPermissions: handler.definition.requiredPermissions,
      });
    }

    const validation = validateToolInput(
      handler.definition.inputSchema,
      request.arguments,
    );
    if (!validation.ok) {
      return this.buildResponse({
        request,
        status: "validation_error",
        startedAt,
        source: handler.definition.source,
        riskLevel: handler.definition.riskLevel,
        content: validation.errors.join("; "),
        requiredPermissions: handler.definition.requiredPermissions,
      });
    }

    try {
      const result = await this.withTimeout(
        Promise.resolve(handler.execute(validation.value, request.context)),
        request.timeoutMs ?? handler.definition.timeoutMs,
      );

      return this.buildResponse({
        request,
        status: "success",
        startedAt,
        source: handler.definition.source,
        riskLevel: handler.definition.riskLevel,
        content: this.truncate(result.content, handler.definition.maxResultLength),
        data: result.data,
        requiredPermissions: handler.definition.requiredPermissions,
      });
    } catch (error) {
      const status = this.isTimeoutError(error) ? "timeout" : "error";
      return this.buildResponse({
        request,
        status,
        startedAt,
        source: handler.definition.source,
        riskLevel: handler.definition.riskLevel,
        content: this.errorMessage(error),
        requiredPermissions: handler.definition.requiredPermissions,
      });
    }
  }

  getStatus(): ToolRegistryStatus {
    const mcpStatus = this.mcpTools.getStatus();
    return {
      builtinTools: this.listDefinitions()
        .filter((definition) => definition.source === "builtin")
        .map((definition) => definition.name),
      mcpEnabled: mcpStatus.enabled,
      mcpTools: this.listDefinitions()
        .filter((definition) => definition.source === "mcp")
        .map((definition) => definition.name),
      mcpServers: mcpStatus.servers,
      controls: [
        "schema validation",
        "permission checks",
        "execution timeout",
        "result truncation",
        "audit logging",
      ],
    };
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    let timeout: NodeJS.Timeout | undefined;
    try {
      return await Promise.race([
        promise,
        new Promise<T>((_resolve, reject) => {
          timeout = setTimeout(() => {
            reject(new ToolRegistryError("Tool execution timed out", "TOOL_TIMEOUT"));
          }, timeoutMs);
        }),
      ]);
    } finally {
      if (timeout) {
        clearTimeout(timeout);
      }
    }
  }

  private buildResponse(input: {
    request: ToolCallRequest;
    status: ToolStatus;
    startedAt: Date;
    source: ToolDefinition["source"];
    riskLevel: ToolDefinition["riskLevel"];
    content: string;
    requiredPermissions: string[];
    data?: ToolExecutionResult["data"];
  }): ToolCallResponse {
    const endedAt = new Date();
    const latencyMs = endedAt.getTime() - input.startedAt.getTime();
    const audit: ToolAuditEvent = {
      requestId: input.request.context.requestId,
      toolName: input.request.name,
      source: input.source,
      riskLevel: input.riskLevel,
      status: input.status,
      startedAt: input.startedAt.toISOString(),
      endedAt: endedAt.toISOString(),
      latencyMs,
      inputPreview: this.preview(input.request.arguments),
      requiredPermissions: input.requiredPermissions,
    };

    if (input.content) {
      audit.resultPreview = this.truncate(input.content, 500);
    }
    if (input.status !== "success") {
      audit.error = input.content;
    }
    if (input.request.context.userId) {
      audit.userId = input.request.context.userId;
    }
    if (input.request.context.tenantId) {
      audit.tenantId = input.request.context.tenantId;
    }

    const response: ToolCallResponse = {
      toolName: input.request.name,
      source: input.source,
      riskLevel: input.riskLevel,
      requiredPermissions: input.requiredPermissions,
      status: input.status,
      content: input.content,
      latencyMs,
      audit,
    };

    if (input.data) {
      response.data = input.data;
    }

    return response;
  }

  private isTimeoutError(error: unknown): boolean {
    return error instanceof ToolRegistryError && error.code === "TOOL_TIMEOUT";
  }

  private errorMessage(error: unknown): string {
    if (error instanceof Error) {
      return error.message;
    }
    return "Tool execution failed";
  }

  private preview(value: unknown): string {
    return this.truncate(JSON.stringify(value), 500);
  }

  private truncate(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
      return value;
    }
    return `${value.slice(0, maxLength)}...`;
  }
}
