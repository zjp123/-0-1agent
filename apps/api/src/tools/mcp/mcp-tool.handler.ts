import { ToolRegistryError } from "../tool-registry.errors.js";
import type {
  ToolDefinition,
  ToolExecutionContext,
  ToolExecutionResult,
  ToolHandler,
} from "../tool.types.js";
import { McpStdioClient } from "./mcp-stdio.client.js";

export class McpToolHandler implements ToolHandler {
  readonly definition: ToolDefinition;

  constructor(
    private readonly client: McpStdioClient,
    private readonly mcpToolName: string,
    definition: ToolDefinition,
  ) {
    this.definition = definition;
  }

  async execute(
    input: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> {
    const result = await this.client.callTool(
      this.mcpToolName,
      input,
      this.definition.timeoutMs,
    );

    const content = result.content
      ?.map((item) => {
        if (item.type === "text" && item.text) {
          return item.text;
        }
        if (item.data) {
          return `[${item.type}] ${item.mimeType ?? "application/octet-stream"} ${item.data.slice(0, 160)}`;
        }
        return `[${item.type}]`;
      })
      .join("\n")
      .trim();

    if (result.isError) {
      throw new ToolRegistryError(
        content || `MCP tool failed: ${this.mcpToolName}`,
        "TOOL_EXECUTION_FAILED",
      );
    }

    return {
      content: content || JSON.stringify(result.structuredContent ?? {}),
      ...(result.structuredContent ? { data: result.structuredContent } : {}),
      metadata: {
        mcpToolName: this.mcpToolName,
      },
    };
  }
}
