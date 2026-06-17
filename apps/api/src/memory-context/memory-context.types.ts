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
  metadata?: Record<string, string | number | boolean | null>;
};

export type RetrievedKnowledgeContextSource = {
  id: string;
  metadata: Record<string, string | number | boolean | null>;
};

export type BuildContextRequest = {
  systemPrompt?: string;
  history?: ModelMessage[];
  userMessage: string;
  retrievedKnowledge?: ModelMessage[];
  retrievedKnowledgeSources?: RetrievedKnowledgeContextSource[];
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
