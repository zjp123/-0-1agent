import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";
import type {
  ChatCompletionAssistantMessageParam,
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
  ChatCompletionSystemMessageParam,
  ChatCompletionTool,
  ChatCompletionUserMessageParam,
} from "openai/resources/chat/completions";

import { ModelGatewayError } from "../model-gateway.errors.js";
import type {
  ModelMessage,
  ModelProvider,
  ModelRequest,
  ModelResponse,
  ModelToolDefinition,
  ModelUsage,
} from "../model-gateway.types.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;

@Injectable()
export class OpenAiCompatibleProvider implements ModelProvider {
  readonly name: string;

  private readonly client: OpenAI;
  private readonly defaultModel: string;
  private readonly defaultTimeoutMs: number;
  private readonly defaultMaxRetries: number;

  constructor(private readonly config: ConfigService) {
    this.name = this.config.get<string>("app.model.provider", "deepseek");
    this.defaultModel = this.config.get<string>(
      "app.model.defaultModel",
      "deepseek-chat",
    );
    this.defaultTimeoutMs = this.config.get<number>(
      "app.model.timeoutMs",
      DEFAULT_TIMEOUT_MS,
    );
    this.defaultMaxRetries = this.config.get<number>(
      "app.model.maxRetries",
      DEFAULT_MAX_RETRIES,
    );

    this.client = new OpenAI({
      apiKey: this.config.get<string>("app.model.apiKey") ?? "missing-api-key",
      baseURL: this.config.get<string>("app.model.baseUrl"),
      timeout: this.defaultTimeoutMs,
      maxRetries: 0,
    });
  }

  async generateText(request: ModelRequest): Promise<ModelResponse> {
    const startedAt = Date.now();
    const model = request.model ?? this.defaultModel;
    const maxAttempts = 1 + (request.maxRetries ?? this.defaultMaxRetries);
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        const response = await this.client.chat.completions.create(
          this.toOpenAiRequest(request, model),
          {
            timeout: request.timeoutMs ?? this.defaultTimeoutMs,
            maxRetries: 0,
          },
        );

        const choice = response.choices[0];
        const message = choice?.message;
        const modelResponse: ModelResponse = {
          id: response.id,
          provider: this.name,
          model: response.model,
          content: message?.content ?? "",
          finishReason: choice?.finish_reason ?? null,
          toolCalls: this.toToolCalls(message?.tool_calls),
          latencyMs: Date.now() - startedAt,
          attempts: attempt,
        };

        const usage = this.toUsage(response.usage);
        if (usage) {
          modelResponse.usage = usage;
        }

        return modelResponse;
      } catch (error) {
        lastError = error;
        if (attempt >= maxAttempts || !this.isRetryable(error)) {
          break;
        }
        await this.wait(this.retryDelayMs(attempt));
      }
    }

    const errorOptions: ConstructorParameters<typeof ModelGatewayError>[1] = {
      provider: this.name,
      attempts: maxAttempts,
      cause: lastError,
      retryable: this.isRetryable(lastError),
    };
    const statusCode = this.getStatusCode(lastError);
    if (statusCode !== undefined) {
      errorOptions.statusCode = statusCode;
    }

    throw new ModelGatewayError("Model provider request failed", errorOptions);
  }

  private toOpenAiRequest(
    request: ModelRequest,
    model: string,
  ): ChatCompletionCreateParamsNonStreaming {
    const payload: ChatCompletionCreateParamsNonStreaming = {
      model,
      messages: request.messages.map((message) => this.toOpenAiMessage(message)),
    };

    if (request.temperature !== undefined) {
      payload.temperature = request.temperature;
    }
    if (request.maxTokens !== undefined) {
      payload.max_tokens = request.maxTokens;
    }
    if (request.tools && request.tools.length > 0) {
      payload.tools = request.tools.map((tool) => this.toOpenAiTool(tool));
    }

    return payload;
  }

  private toOpenAiMessage(message: ModelMessage): ChatCompletionMessageParam {
    if (message.role === "tool") {
      return {
        role: "tool",
        content: message.content,
        tool_call_id: message.toolCallId ?? "unknown-tool-call",
      };
    }

    if (message.role === "assistant") {
      return {
        role: "assistant",
        content: message.content,
      } satisfies ChatCompletionAssistantMessageParam;
    }

    if (message.role === "system") {
      const systemMessage: ChatCompletionSystemMessageParam = {
        role: "system",
        content: message.content,
      };
      if (message.name) {
        systemMessage.name = message.name;
      }
      return systemMessage;
    }

    const userMessage: ChatCompletionUserMessageParam = {
      role: "user",
      content: message.content,
    };
    if (message.name) {
      userMessage.name = message.name;
    }
    return userMessage;
  }

  private toToolCalls(
    toolCalls:
      | Array<{
          id: string;
          type: string;
          function?: { name: string; arguments: string };
        }>
      | undefined,
  ): ModelResponse["toolCalls"] {
    if (!toolCalls) {
      return [];
    }

    return toolCalls
      .filter((call) => call.type === "function" && call.function)
      .map((call) => ({
        id: call.id,
        name: call.function?.name ?? "",
        arguments: call.function?.arguments ?? "{}",
      }));
  }

  private toOpenAiTool(tool: ModelToolDefinition): ChatCompletionTool {
    return {
      type: "function",
      function: {
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
      },
    };
  }

  private toUsage(
    usage:
      | {
          prompt_tokens?: number;
          completion_tokens?: number;
          total_tokens?: number;
        }
      | null
      | undefined,
  ): ModelUsage | undefined {
    if (!usage) {
      return undefined;
    }

    return {
      promptTokens: usage.prompt_tokens ?? 0,
      completionTokens: usage.completion_tokens ?? 0,
      totalTokens: usage.total_tokens ?? 0,
    };
  }

  private isRetryable(error: unknown): boolean {
    const statusCode = this.getStatusCode(error);
    if (statusCode !== undefined) {
      return (
        statusCode === 408 ||
        statusCode === 409 ||
        statusCode === 429 ||
        statusCode >= 500
      );
    }

    const name = this.getErrorName(error).toLowerCase();
    return name.includes("timeout") || name.includes("connection");
  }

  private getStatusCode(error: unknown): number | undefined {
    if (typeof error !== "object" || error === null || !("status" in error)) {
      return undefined;
    }

    const status = (error as { status?: unknown }).status;
    return typeof status === "number" ? status : undefined;
  }

  private getErrorName(error: unknown): string {
    if (error instanceof Error) {
      return error.name;
    }
    return "";
  }

  private retryDelayMs(attempt: number): number {
    return Math.min(250 * 2 ** (attempt - 1), 2_000);
  }

  private async wait(ms: number): Promise<void> {
    await new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
