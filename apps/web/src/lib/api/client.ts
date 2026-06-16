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

export type Permission =
  | "agent:run"
  | "tools:execute"
  | "knowledge:read"
  | "knowledge:write"
  | "observability:read"
  | "workflow:manage"
  | "evaluation:manage"
  | "auth:manage";

export type Role =
  | "viewer"
  | "developer"
  | "operator"
  | "admin"
  | "service"
  | "break_glass";

export const ALL_PERMISSIONS: Permission[] = [
  "agent:run",
  "tools:execute",
  "knowledge:read",
  "knowledge:write",
  "observability:read",
  "workflow:manage",
  "evaluation:manage",
  "auth:manage",
];

export type AuthCredentials = {
  apiKey?: string;
  serviceToken?: string;
};

export type AuthRole = {
  id: string;
  tenantId: string;
  name: string;
  permissions: Permission[];
  description?: string;
  createdAt: string;
  updatedAt: string;
};

export type ServiceToken = {
  id: string;
  tenantId: string;
  name: string;
  roles: Role[];
  permissions: Permission[];
  enabled: boolean;
  expiresAt?: string;
  lastUsedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type AuthAuditEvent = {
  id: string;
  tenantId: string;
  actorUserId: string;
  actorAuthType: "api_key" | "dev" | "jwt" | "service_token";
  actorTokenId?: string;
  action: string;
  targetType: string;
  targetId: string;
  reason: string;
  comment?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AuthAuditEventList = {
  items: AuthAuditEvent[];
  limit: number;
  offset: number;
  nextOffset?: number;
};

export type SecurityAnomalyEvent = {
  id: string;
  tenantId: string;
  severity: "info" | "warning" | "critical";
  category: string;
  action: string;
  actorUserId?: string;
  actorAuthType?: "api_key" | "dev" | "jwt" | "service_token";
  targetType?: string;
  targetId?: string;
  message: string;
  metadata: Record<string, unknown>;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  createdAt: string;
};

export type SecurityAnomalyEventList = {
  items: SecurityAnomalyEvent[];
  limit: number;
  offset: number;
  nextOffset?: number;
};

export type CreateAuthRoleInput = AuthCredentials & {
  name: string;
  permissions: Permission[];
  description?: string;
  reason: string;
  comment?: string;
};

export type ApiDocOperation = {
  method: "get" | "post" | "patch" | "delete";
  path: string;
  summary: string;
  operationId: string;
  permission?: string;
};

export type ApiDocGroup = {
  tag: string;
  operations: ApiDocOperation[];
};

export type ApiDocumentationSummary = {
  title: string;
  version: string;
  openapiUrl: string;
  groups: ApiDocGroup[];
};

export type OpenApiDocument = {
  openapi: string;
  info: {
    title: string;
    version: string;
    description?: string;
  };
  servers?: Array<{ url: string }>;
  tags?: Array<{ name: string }>;
  paths: Record<string, Record<string, unknown>>;
  components?: {
    schemas?: Record<string, unknown>;
    securitySchemes?: Record<string, unknown>;
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

const permissionSchema = z.enum(ALL_PERMISSIONS);
const roleSchema = z.enum([
  "viewer",
  "developer",
  "operator",
  "admin",
  "service",
  "break_glass",
]);
const authTypeSchema = z.enum(["api_key", "dev", "jwt", "service_token"]);

const authRoleSchema: z.ZodType<AuthRole> = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string(),
  permissions: z.array(permissionSchema),
  description: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const serviceTokenSchema: z.ZodType<ServiceToken> = z.object({
  id: z.string(),
  tenantId: z.string(),
  name: z.string(),
  roles: z.array(roleSchema),
  permissions: z.array(permissionSchema),
  enabled: z.boolean(),
  expiresAt: z.string().optional(),
  lastUsedAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const authAuditEventSchema: z.ZodType<AuthAuditEvent> = z.object({
  id: z.string(),
  tenantId: z.string(),
  actorUserId: z.string(),
  actorAuthType: authTypeSchema,
  actorTokenId: z.string().optional(),
  action: z.string(),
  targetType: z.string(),
  targetId: z.string(),
  reason: z.string(),
  comment: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
});

const authAuditEventListSchema: z.ZodType<AuthAuditEventList> = z.object({
  items: z.array(authAuditEventSchema),
  limit: z.number(),
  offset: z.number(),
  nextOffset: z.number().optional(),
});

const securityAnomalyEventSchema: z.ZodType<SecurityAnomalyEvent> = z.object({
  id: z.string(),
  tenantId: z.string(),
  severity: z.enum(["info", "warning", "critical"]),
  category: z.string(),
  action: z.string(),
  actorUserId: z.string().optional(),
  actorAuthType: authTypeSchema.optional(),
  targetType: z.string().optional(),
  targetId: z.string().optional(),
  message: z.string(),
  metadata: z.record(z.string(), z.unknown()),
  acknowledged: z.boolean(),
  acknowledgedBy: z.string().optional(),
  acknowledgedAt: z.string().optional(),
  createdAt: z.string(),
});

const securityAnomalyEventListSchema: z.ZodType<SecurityAnomalyEventList> = z.object({
  items: z.array(securityAnomalyEventSchema),
  limit: z.number(),
  offset: z.number(),
  nextOffset: z.number().optional(),
});

const apiDocOperationSchema: z.ZodType<ApiDocOperation> = z.object({
  method: z.enum(["get", "post", "patch", "delete"]),
  path: z.string(),
  summary: z.string(),
  operationId: z.string(),
  permission: z.string().optional(),
});

const apiDocumentationSummarySchema: z.ZodType<ApiDocumentationSummary> = z.object({
  title: z.string(),
  version: z.string(),
  openapiUrl: z.string(),
  groups: z.array(
    z.object({
      tag: z.string(),
      operations: z.array(apiDocOperationSchema),
    }),
  ),
});

const openApiDocumentSchema: z.ZodType<OpenApiDocument> = z.object({
  openapi: z.string(),
  info: z.object({
    title: z.string(),
    version: z.string(),
    description: z.string().optional(),
  }),
  servers: z.array(z.object({ url: z.string() })).optional(),
  tags: z.array(z.object({ name: z.string() })).optional(),
  paths: z.record(z.string(), z.record(z.string(), z.unknown())),
  components: z
    .object({
      schemas: z.record(z.string(), z.unknown()).optional(),
      securitySchemes: z.record(z.string(), z.unknown()).optional(),
    })
    .optional(),
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

export async function listAuthRoles(
  credentials: AuthCredentials,
): Promise<AuthRole[]> {
  const payload = await fetchJson(`${apiBaseUrl}/auth/roles`, {
    headers: buildAuthHeaders(credentials),
  });
  return z.array(authRoleSchema).parse(payload);
}

export async function createAuthRole(input: CreateAuthRoleInput): Promise<AuthRole> {
  const payload = await fetchJson(`${apiBaseUrl}/auth/roles`, {
    method: "POST",
    headers: buildAuthHeaders(input, true),
    body: JSON.stringify({
      name: input.name,
      permissions: input.permissions,
      description: input.description || undefined,
      reason: input.reason,
      comment: input.comment || undefined,
    }),
  });
  return authRoleSchema.parse(payload);
}

export async function listServiceTokens(
  credentials: AuthCredentials,
): Promise<ServiceToken[]> {
  const payload = await fetchJson(`${apiBaseUrl}/auth/service-tokens`, {
    headers: buildAuthHeaders(credentials),
  });
  return z.array(serviceTokenSchema).parse(payload);
}

export async function listAuthAuditEvents(
  credentials: AuthCredentials,
  query: { limit?: number; offset?: number } = {},
): Promise<AuthAuditEventList> {
  const params = new URLSearchParams();
  if (query.limit !== undefined) {
    params.set("limit", String(query.limit));
  }
  if (query.offset !== undefined) {
    params.set("offset", String(query.offset));
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  const payload = await fetchJson(`${apiBaseUrl}/auth/audit-events${suffix}`, {
    headers: buildAuthHeaders(credentials),
  });
  return authAuditEventListSchema.parse(payload);
}

export async function listSecurityAnomalies(
  credentials: AuthCredentials,
  query: { limit?: number; offset?: number; acknowledged?: boolean } = {},
): Promise<SecurityAnomalyEventList> {
  const params = new URLSearchParams();
  if (query.limit !== undefined) {
    params.set("limit", String(query.limit));
  }
  if (query.offset !== undefined) {
    params.set("offset", String(query.offset));
  }
  if (query.acknowledged !== undefined) {
    params.set("acknowledged", String(query.acknowledged));
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  const payload = await fetchJson(`${apiBaseUrl}/auth/security/anomalies${suffix}`, {
    headers: buildAuthHeaders(credentials),
  });
  return securityAnomalyEventListSchema.parse(payload);
}

export async function acknowledgeSecurityAnomaly(input: AuthCredentials & {
  eventId: string;
  comment?: string;
}): Promise<SecurityAnomalyEvent> {
  const payload = await fetchJson(
    `${apiBaseUrl}/auth/security/anomalies/${input.eventId}/acknowledge`,
    {
      method: "POST",
      headers: buildAuthHeaders(input, true),
      body: JSON.stringify({ comment: input.comment || undefined }),
    },
  );
  return securityAnomalyEventSchema.parse(payload);
}

export async function getApiDocumentationSummary(): Promise<ApiDocumentationSummary> {
  const payload = await fetchJson(`${apiBaseUrl}/docs`, {
    headers: {},
  });
  return apiDocumentationSummarySchema.parse(payload);
}

export async function getOpenApiDocument(): Promise<OpenApiDocument> {
  const payload = await fetchJson(`${apiBaseUrl}/docs/openapi.json`, {
    headers: {},
  });
  return openApiDocumentSchema.parse(payload);
}

async function fetchJson(url: string, init: RequestInit): Promise<unknown> {
  const response = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: {
      accept: "application/json",
      ...init.headers,
    },
  });

  const text = await response.text();
  const payload = text ? (JSON.parse(text) as unknown) : undefined;
  if (!response.ok) {
    throw new Error(text || `Request failed with HTTP ${response.status}.`);
  }
  return payload;
}

function buildAuthHeaders(
  credentials: AuthCredentials,
  includeJson = false,
): Record<string, string> {
  const headers: Record<string, string> = includeJson
    ? { "content-type": "application/json" }
    : {};
  if (credentials.apiKey) {
    headers["x-api-key"] = credentials.apiKey;
  }
  if (credentials.serviceToken) {
    headers["x-service-token"] = credentials.serviceToken;
  }
  return headers;
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
