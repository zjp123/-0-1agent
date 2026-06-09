export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type ToolSource = "builtin" | "mcp";

export type ToolStatus =
  | "success"
  | "error"
  | "denied"
  | "not_found"
  | "validation_error"
  | "timeout";

export type ToolPropertySchema = {
  type: "string" | "number" | "integer" | "boolean" | "object" | "array";
  description?: string;
  enum?: JsonPrimitive[];
  properties?: Record<string, ToolPropertySchema>;
  required?: string[];
  items?: ToolPropertySchema;
  additionalProperties?: boolean;
};

export type ToolInputSchema = {
  type: "object";
  properties: Record<string, ToolPropertySchema>;
  required?: string[];
  additionalProperties?: boolean;
};

export type ToolDefinition = {
  name: string;
  description: string;
  source: ToolSource;
  inputSchema: ToolInputSchema;
  timeoutMs: number;
  maxResultLength: number;
  requiredPermissions: string[];
};

export type ToolExecutionContext = {
  requestId: string;
  userId?: string;
  tenantId?: string;
  permissions: string[];
  metadata?: Record<string, string>;
};

export type ToolExecutionResult = {
  content: string;
  data?: JsonObject;
  metadata?: Record<string, string>;
};

export type ToolCallRequest = {
  name: string;
  arguments: Record<string, unknown>;
  context: ToolExecutionContext;
  timeoutMs?: number;
};

export type ToolAuditEvent = {
  requestId: string;
  toolName: string;
  source: ToolSource;
  status: ToolStatus;
  startedAt: string;
  endedAt: string;
  latencyMs: number;
  inputPreview: string;
  resultPreview?: string;
  error?: string;
  userId?: string;
  tenantId?: string;
  requiredPermissions: string[];
};

export type ToolCallResponse = {
  toolName: string;
  status: ToolStatus;
  content: string;
  data?: JsonObject;
  latencyMs: number;
  audit: ToolAuditEvent;
};

export interface ToolHandler {
  readonly definition: ToolDefinition;
  execute(
    input: Record<string, unknown>,
    context: ToolExecutionContext,
  ): Promise<ToolExecutionResult> | ToolExecutionResult;
}
