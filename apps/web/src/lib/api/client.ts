import { z } from "zod";
import { apiBaseUrl } from "@/lib/config";

export const healthResponseSchema = z.object({
  status: z.string(),
  service: z.string(),
  environment: z.string().optional(),
  uptimeSeconds: z.number().optional(),
  timestamp: z.string().optional(),
  dependencies: z
    .object({
      database: z
        .object({
          status: z.string(),
          latencyMs: z.number().optional(),
          message: z.string().optional(),
        })
        .optional(),
      vectorStore: z
        .object({
          status: z.string(),
          collection: z.string().optional(),
          message: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
});

export type HealthResponse = z.infer<typeof healthResponseSchema>;

export type AgentStreamEvent =
  | {
      event: "started";
      data: { requestId: string; timestamp: string };
    }
  | {
      event: "delta";
      data: { requestId: string; content: string };
    }
  | {
      event: "result";
      data: {
        requestId: string;
        stopReason: string;
        steps: AgentRunStep[];
        context: AgentRunContext;
        usage: {
          promptTokens: number;
          completionTokens: number;
          totalTokens: number;
        };
        durationMs: number;
      };
    }
  | {
      event: "done";
      data: { requestId: string; timestamp: string };
    }
  | {
      event: "error";
      data: { requestId: string; message: string };
    };

export type RunAgentStreamInput = {
  requestId: string;
  message: string;
  messages?: AgentMessage[];
  apiKey?: string;
  serviceToken?: string;
  signal?: AbortSignal;
  onEvent: (event: AgentStreamEvent) => void;
};

export type AgentMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
};

export type AgentRunStep =
  | {
      type: "model";
      step: number;
      response: {
        provider: string;
        model: string;
        finishReason: string | null;
        latencyMs: number;
        attempts: number;
        contentPreview: string;
        toolCalls: Array<{ id: string; name: string; arguments: string }>;
      };
    }
  | {
      type: "tool";
      step: number;
      toolName: string;
      status: string;
      contentPreview: string;
      latencyMs: number;
    };

export type AgentRunContext = {
  budget: {
    maxTokens: number;
    reservedResponseTokens: number;
    availableInputTokens: number;
  };
  estimatedInputTokens: number;
  sources: Array<{
    layer: string;
    id: string;
    tokens: number;
    included: boolean;
    reason: string;
  }>;
  droppedMessages: number;
};

export type ToolDefinition = {
  name: string;
  description: string;
  source: "builtin" | "mcp";
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
  };
  timeoutMs: number;
  maxResultLength: number;
  requiredPermissions: string[];
};

export type ToolCallResponse = {
  toolName: string;
  status: string;
  content: string;
  data?: Record<string, unknown>;
  latencyMs: number;
  audit: {
    requestId: string;
    toolName: string;
    source: string;
    status: string;
    startedAt: string;
    endedAt: string;
    latencyMs: number;
    inputPreview: string;
    resultPreview?: string;
    error?: string;
    requiredPermissions: string[];
  };
};

const toolDefinitionSchema: z.ZodType<ToolDefinition> = z.object({
  name: z.string(),
  description: z.string(),
  source: z.enum(["builtin", "mcp"]),
  inputSchema: z.object({
    type: z.literal("object"),
    properties: z.record(z.string(), z.unknown()),
    required: z.array(z.string()).optional(),
    additionalProperties: z.boolean().optional(),
  }),
  timeoutMs: z.number(),
  maxResultLength: z.number(),
  requiredPermissions: z.array(z.string()),
});

const toolCallResponseSchema: z.ZodType<ToolCallResponse> = z.object({
  toolName: z.string(),
  status: z.string(),
  content: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
  latencyMs: z.number(),
  audit: z.object({
    requestId: z.string(),
    toolName: z.string(),
    source: z.string(),
    status: z.string(),
    startedAt: z.string(),
    endedAt: z.string(),
    latencyMs: z.number(),
    inputPreview: z.string(),
    resultPreview: z.string().optional(),
    error: z.string().optional(),
    requiredPermissions: z.array(z.string()),
  }),
});

export async function getReadiness(): Promise<HealthResponse> {
  const response = await fetch(`${apiBaseUrl}/health/ready`, {
    cache: "no-store",
    headers: {
      accept: "application/json",
    },
  });

  const payload: unknown = await response.json();

  if (!response.ok) {
    return healthResponseSchema.parse(payload);
  }

  return healthResponseSchema.parse(payload);
}

export async function runAgentStream(input: RunAgentStreamInput): Promise<void> {
  const headers: Record<string, string> = {
    accept: "text/event-stream",
    "content-type": "application/json",
  };
  if (input.apiKey) {
    headers["x-api-key"] = input.apiKey;
  }
  if (input.serviceToken) {
    headers["x-service-token"] = input.serviceToken;
  }

  const response = await fetch(`${apiBaseUrl}/agent/run/stream`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      requestId: input.requestId,
      message: input.message,
      messages: input.messages,
    }),
    signal: input.signal,
  });

  if (!response.ok || !response.body) {
    const message = await response.text();
    throw new Error(message || `Agent stream failed with HTTP ${response.status}.`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() ?? "";

    for (const part of parts) {
      const event = parseSseEvent(part);
      if (event) {
        input.onEvent(event);
      }
    }
  }

  if (buffer.trim()) {
    const event = parseSseEvent(buffer);
    if (event) {
      input.onEvent(event);
    }
  }
}

export async function listTools(): Promise<ToolDefinition[]> {
  const response = await fetch(`${apiBaseUrl}/tools`, {
    cache: "no-store",
    headers: {
      accept: "application/json",
    },
  });

  const payload: unknown = await response.json();
  if (!response.ok) {
    throw new Error(`Failed to list tools with HTTP ${response.status}.`);
  }

  return z.array(toolDefinitionSchema).parse(payload);
}

export async function executeTool(input: {
  name: string;
  arguments: Record<string, unknown>;
  apiKey?: string;
  serviceToken?: string;
}): Promise<ToolCallResponse> {
  const headers: Record<string, string> = {
    accept: "application/json",
    "content-type": "application/json",
  };
  if (input.apiKey) {
    headers["x-api-key"] = input.apiKey;
  }
  if (input.serviceToken) {
    headers["x-service-token"] = input.serviceToken;
  }

  const response = await fetch(`${apiBaseUrl}/tools/execute`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      requestId: crypto.randomUUID(),
      name: input.name,
      arguments: input.arguments,
    }),
  });

  const payload: unknown = await response.json();
  if (!response.ok) {
    throw new Error(JSON.stringify(payload));
  }

  return toolCallResponseSchema.parse(payload);
}

function parseSseEvent(raw: string): AgentStreamEvent | undefined {
  const lines = raw.split("\n");
  const eventLine = lines.find((line) => line.startsWith("event:"));
  const dataLine = lines.find((line) => line.startsWith("data:"));
  if (!eventLine || !dataLine) {
    return undefined;
  }

  const event = eventLine.slice("event:".length).trim();
  const data = JSON.parse(dataLine.slice("data:".length).trim()) as unknown;

  if (
    event === "started" ||
    event === "delta" ||
    event === "result" ||
    event === "done" ||
    event === "error"
  ) {
    return { event, data } as AgentStreamEvent;
  }

  return undefined;
}
