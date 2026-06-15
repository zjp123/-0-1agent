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
        steps: unknown[];
        context: unknown;
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
  apiKey?: string;
  serviceToken?: string;
  signal?: AbortSignal;
  onEvent: (event: AgentStreamEvent) => void;
};

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
