import { Injectable } from "@nestjs/common";

import type {
  ToolExecutionContext,
  ToolExecutionResult,
  ToolHandler,
} from "../tool.types.js";

@Injectable()
export class CurrentTimeTool implements ToolHandler {
  readonly definition = {
    name: "current_time",
    description: "Return the current server time in a requested IANA timezone.",
    source: "builtin" as const,
    inputSchema: {
      type: "object" as const,
      additionalProperties: false,
      properties: {
        timeZone: {
          type: "string" as const,
          description: "IANA timezone, for example Asia/Shanghai or UTC.",
        },
      },
      required: ["timeZone"],
    },
    timeoutMs: 1_000,
    maxResultLength: 1_000,
    requiredPermissions: [],
  };

  execute(
    input: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): ToolExecutionResult {
    const timeZone = String(input.timeZone);
    const now = new Date();
    const formatted = now.toLocaleString("zh-CN", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "long",
    });

    return {
      content: formatted,
      data: {
        iso: now.toISOString(),
        timeZone,
        formatted,
      },
    };
  }
}
