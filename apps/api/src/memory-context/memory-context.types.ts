import type { ModelMessage } from "../model-gateway/model-gateway.types.js";

export type ContextLayer =
  | "system"
  | "history"
  | "retrieved_knowledge"
  | "user_input";

export type ContextBudget = {
  maxTokens: number;
  reservedResponseTokens: number;
  availableInputTokens: number;
};

export type ContextSource = {
  layer: ContextLayer;
  id: string;
  tokens: number;
  included: boolean;
  reason: string;
};

export type BuildContextRequest = {
  systemPrompt?: string;
  history?: ModelMessage[];
  userMessage: string;
  retrievedKnowledge?: ModelMessage[];
  maxTokens?: number;
  reservedResponseTokens?: number;
};

export type BuildContextResult = {
  messages: ModelMessage[];
  budget: ContextBudget;
  estimatedInputTokens: number;
  sources: ContextSource[];
  droppedMessages: number;
};
