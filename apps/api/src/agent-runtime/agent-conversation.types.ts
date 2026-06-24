import type { ModelMessage } from "../model-gateway/model-gateway.types.js";

export type AgentConversation = {
  id: string;
  tenantId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

export type AgentConversationMessage = {
  id: string;
  tenantId: string;
  sessionId: string;
  role: ModelMessage["role"];
  content: string;
  toolCallId?: string;
  toolCalls?: unknown[];
  createdAt: string;
};

export type CreateAgentConversationInput = {
  tenantId: string;
  userId: string;
  title?: string;
};

export type AppendAgentConversationMessageInput = {
  tenantId: string;
  userId: string;
  sessionId: string;
  role: ModelMessage["role"];
  content: string;
  toolCallId?: string;
  toolCalls?: unknown[];
};
