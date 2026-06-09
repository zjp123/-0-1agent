export type ModelMessageRole = "system" | "user" | "assistant" | "tool";

export type ModelMessage = {
  role: ModelMessageRole;
  content: string;
  name?: string;
  toolCallId?: string;
  toolCalls?: ModelToolCall[];
};

export type ModelToolDefinition = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type ModelRequest = {
  messages: ModelMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: ModelToolDefinition[];
  timeoutMs?: number;
  maxRetries?: number;
  metadata?: Record<string, string>;
};

export type ModelToolCall = {
  id: string;
  name: string;
  arguments: string;
};

export type ModelUsage = {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
};

export type ModelResponse = {
  id: string;
  provider: string;
  model: string;
  content: string;
  finishReason: string | null;
  toolCalls: ModelToolCall[];
  usage?: ModelUsage;
  latencyMs: number;
  attempts: number;
};

export interface ModelProvider {
  readonly name: string;
  generateText(request: ModelRequest): Promise<ModelResponse>;
}
