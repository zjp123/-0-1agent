import { Injectable } from "@nestjs/common";

import type { ModelMessage } from "../model-gateway/model-gateway.types.js";
import type {
  BuildContextRequest,
  BuildContextResult,
  ContextBudget,
  ContextLayer,
  ContextSource,
} from "./memory-context.types.js";

export type MemoryContextStatus = {
  layers: string[];
  strategies: string[];
  defaults: {
    maxTokens: number;
    reservedResponseTokens: number;
  };
};

const DEFAULT_MAX_TOKENS = 8_000;
const DEFAULT_RESERVED_RESPONSE_TOKENS = 1_000;

@Injectable()
export class MemoryContextService {
  buildContext(request: BuildContextRequest): BuildContextResult {
    const budget = this.buildBudget(request);
    const sources: ContextSource[] = [];
    const messages: ModelMessage[] = [];
    let usedTokens = 0;
    let droppedMessages = 0;

    const systemMessage: ModelMessage = {
      role: "system",
      content: request.systemPrompt ?? this.defaultSystemPrompt(),
    };
    const systemTokens = this.estimateTokens(systemMessage.content);
    messages.push(systemMessage);
    usedTokens += systemTokens;
    sources.push(this.source("system", "system-prompt", systemTokens, true, "always included"));

    const userMessage: ModelMessage = {
      role: "user",
      content: request.userMessage,
    };
    const userTokens = this.estimateTokens(userMessage.content);

    const knowledge = request.retrievedKnowledge ?? [];
    for (const [index, message] of knowledge.entries()) {
      const tokens = this.estimateMessageTokens(message);
      const included = usedTokens + tokens + userTokens <= budget.availableInputTokens;
      const sourceMetadata = request.retrievedKnowledgeSources?.[index];
      sources.push(
        this.source(
          "retrieved_knowledge",
          sourceMetadata?.id ?? `knowledge-${index}`,
          tokens,
          included,
          included ? "fits budget" : "dropped by token budget",
          sourceMetadata?.metadata,
        ),
      );
      if (included) {
        messages.push(message);
        usedTokens += tokens;
      } else {
        droppedMessages += 1;
      }
    }

    const history = request.history ?? [];
    const selectedHistory = this.selectRecentMessages(
      history,
      budget.availableInputTokens - usedTokens - userTokens,
      sources,
    );
    droppedMessages += history.length - selectedHistory.length;
    messages.push(...selectedHistory);
    usedTokens += selectedHistory.reduce(
      (total, message) => total + this.estimateMessageTokens(message),
      0,
    );

    messages.push(userMessage);
    usedTokens += userTokens;
    sources.push(this.source("user_input", "current-user-message", userTokens, true, "always included"));

    return {
      messages,
      budget,
      estimatedInputTokens: usedTokens,
      sources,
      droppedMessages,
    };
  }

  getStatus(): MemoryContextStatus {
    return {
      layers: ["session", "user", "task", "retrieved knowledge"],
      strategies: [
        "token budget",
        "summarization",
        "context ranking",
        "retrieval injection",
      ],
      defaults: {
        maxTokens: DEFAULT_MAX_TOKENS,
        reservedResponseTokens: DEFAULT_RESERVED_RESPONSE_TOKENS,
      },
    };
  }

  estimateTokens(text: string): number {
    if (!text) {
      return 0;
    }

    const asciiWords = text.match(/[A-Za-z0-9_]+/g)?.length ?? 0;
    const nonAsciiChars = [...text.replace(/[A-Za-z0-9_\s]/g, "")].length;
    const punctuation = text.match(/[^\sA-Za-z0-9_\u4e00-\u9fff]/g)?.length ?? 0;
    const cjkChars = text.match(/[\u4e00-\u9fff]/g)?.length ?? 0;

    return Math.max(1, Math.ceil(asciiWords * 1.3 + cjkChars + nonAsciiChars + punctuation * 0.5));
  }

  private buildBudget(request: BuildContextRequest): ContextBudget {
    const maxTokens = request.maxTokens ?? DEFAULT_MAX_TOKENS;
    const reservedResponseTokens =
      request.reservedResponseTokens ?? DEFAULT_RESERVED_RESPONSE_TOKENS;

    return {
      maxTokens,
      reservedResponseTokens,
      availableInputTokens: Math.max(1, maxTokens - reservedResponseTokens),
    };
  }

  private selectRecentMessages(
    history: ModelMessage[],
    availableTokens: number,
    sources: ContextSource[],
  ): ModelMessage[] {
    const selected: ModelMessage[] = [];
    let usedTokens = 0;

    for (let index = history.length - 1; index >= 0; index -= 1) {
      const message = history[index];
      if (!message) {
        continue;
      }

      const tokens = this.estimateMessageTokens(message);
      const included = usedTokens + tokens <= availableTokens;
      sources.push(
        this.source(
          "history",
          `history-${index}`,
          tokens,
          included,
          included ? "recent message fits budget" : "older message dropped by token budget",
        ),
      );

      if (included) {
        selected.unshift(message);
        usedTokens += tokens;
      }
    }

    return selected;
  }

  private estimateMessageTokens(message: ModelMessage): number {
    const toolTokens =
      message.toolCalls?.reduce(
        (total, toolCall) =>
          total +
          this.estimateTokens(toolCall.name) +
          this.estimateTokens(toolCall.arguments),
        0,
      ) ?? 0;

    return this.estimateTokens(message.content) + toolTokens + 4;
  }

  private source(
    layer: ContextLayer,
    id: string,
    tokens: number,
    included: boolean,
    reason: string,
    metadata?: Record<string, string | number | boolean | null>,
  ): ContextSource {
    const source: ContextSource = {
      layer,
      id,
      tokens,
      included,
      reason,
    };
    if (metadata) {
      source.metadata = metadata;
    }
    return source;
  }

  private defaultSystemPrompt(): string {
    return "You are an enterprise-grade agent. Use tools when needed, keep answers concise, and explain uncertainty clearly.";
  }
}
