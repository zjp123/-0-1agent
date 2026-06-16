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

export type KnowledgeSourceType = "manual" | "upload" | "wiki" | "webpage" | "api";

export type KnowledgeDocument = {
  id: string;
  tenantId: string;
  title: string;
  content: string;
  sourceType: KnowledgeSourceType;
  sourceUri?: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type KnowledgeChunk = {
  id: string;
  documentId: string;
  tenantId: string;
  content: string;
  index: number;
  tokenEstimate: number;
  title: string;
  sourceType: KnowledgeSourceType;
  sourceUri?: string;
  tags: string[];
};

export type KnowledgeSearchResult = {
  chunk: KnowledgeChunk;
  score: number;
  matchedTerms: string[];
  retrievalMode?: "keyword" | "vector" | "hybrid";
  scores?: {
    keyword?: number;
    vector?: number;
  };
};

export type KnowledgeIngestResult = {
  document: KnowledgeDocument;
  chunks: KnowledgeChunk[];
};

export type IndexingJob = {
  id: string;
  tenantId: string;
  createdBy?: string;
  type: "tenant_reindex";
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  attempts: number;
  maxAttempts: number;
  totalChunks: number;
  processedChunks: number;
  failedChunks: number;
  error?: string;
  workerId?: string;
  leaseUntil?: string;
  metadata: Record<string, unknown>;
  startedAt?: string;
  heartbeatAt?: string;
  completedAt?: string;
  cancelledAt?: string;
  deadLetteredAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type IndexingWorkerStatus = {
  workerId: string;
  enabled: boolean;
  stopped: boolean;
  concurrency: number;
  queueName: string;
  retryQueueName: string;
  deadLetterQueueName: string;
  consumerGroup: string;
  queueDepth: {
    pending: number;
    consumerPending: number;
    delayed: number;
    deadLetter: number;
  };
  queueAvailable: boolean;
  queueError?: string;
  leaseMs: number;
  heartbeatIntervalMs: number;
  recoveryIntervalMs: number;
  retryDelayBaseMs: number;
  retryDelayMaxMs: number;
  pendingClaimMinIdleMs: number;
};

export type IndexingWorkerAlert = {
  code: string;
  severity: "warning" | "critical";
  message: string;
  value: number | string | boolean;
  threshold?: number;
};

export type IndexingWorkerAlerts = {
  status: "ok" | "warning" | "critical";
  checkedAt: string;
  thresholds: Record<string, number>;
  alerts: IndexingWorkerAlert[];
  metrics: IndexingWorkerStatus & {
    uptimeMs: number;
    recoveryRunning: boolean;
    lastRecoveryAt?: string;
    lastRecoveryError?: string;
    counters: Record<string, number>;
  };
};

export type IngestKnowledgeInput = AuthCredentials & {
  title: string;
  content: string;
  sourceType?: KnowledgeSourceType;
  sourceUri?: string;
  tags?: string[];
};

export type RetrieveKnowledgeInput = AuthCredentials & {
  query: string;
  limit?: number;
  tags?: string[];
};

export type WorkflowStatusValue =
  | "draft"
  | "running"
  | "completed"
  | "failed"
  | "paused"
  | "cancelled";

export type WorkflowStepStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "skipped"
  | "waiting_for_approval";

export type WorkflowStep = {
  id: string;
  title: string;
  description?: string;
  status: WorkflowStepStatus;
  order: number;
  output?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowEvent = {
  id: string;
  type: "created" | "step_updated" | "status_updated";
  timestamp: string;
  message: string;
  actorUserId: string;
};

export type Workflow = {
  id: string;
  tenantId: string;
  createdBy: string;
  title: string;
  goal: string;
  status: WorkflowStatusValue;
  steps: WorkflowStep[];
  events: WorkflowEvent[];
  createdAt: string;
  updatedAt: string;
};

export type WorkflowSchedule = {
  id: string;
  tenantId: string;
  workflowId: string;
  createdBy: string;
  name: string;
  scheduleType: "interval" | "cron";
  cronExpression?: string;
  intervalSeconds?: number;
  timezone: string;
  enabled: boolean;
  maxConcurrentRuns: number;
  nextRunAt: string;
  lastRunAt?: string;
  leaseOwner?: string;
  leaseUntil?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowScheduleRun = {
  id: string;
  tenantId: string;
  scheduleId: string;
  workflowId: string;
  triggeredBy: "scheduler" | "manual" | "recovery";
  workerId?: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  dueAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  output?: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type WorkflowSchedulerStatus = {
  enabled: boolean;
  store: string;
  triggerModes: string[];
  capabilities: string[];
};

export type CreateWorkflowInput = AuthCredentials & {
  title: string;
  goal: string;
  steps: Array<{ title: string; description?: string }>;
};

export type UpdateWorkflowStepInput = AuthCredentials & {
  workflowId: string;
  stepId: string;
  status: WorkflowStepStatus;
  output?: string;
  error?: string;
};

export type CreateWorkflowScheduleInput = AuthCredentials & {
  workflowId: string;
  name: string;
  scheduleType: "interval" | "cron";
  cronExpression?: string;
  intervalSeconds?: number;
  timezone?: string;
  enabled?: boolean;
  maxConcurrentRuns?: number;
  nextRunAt: string;
  metadata?: Record<string, unknown>;
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

const knowledgeSourceTypeSchema = z.enum(["manual", "upload", "wiki", "webpage", "api"]);

const knowledgeDocumentSchema: z.ZodType<KnowledgeDocument> = z.object({
  id: z.string(),
  tenantId: z.string(),
  title: z.string(),
  content: z.string(),
  sourceType: knowledgeSourceTypeSchema,
  sourceUri: z.string().optional(),
  tags: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const knowledgeChunkSchema: z.ZodType<KnowledgeChunk> = z.object({
  id: z.string(),
  documentId: z.string(),
  tenantId: z.string(),
  content: z.string(),
  index: z.number(),
  tokenEstimate: z.number(),
  title: z.string(),
  sourceType: knowledgeSourceTypeSchema,
  sourceUri: z.string().optional(),
  tags: z.array(z.string()),
});

const knowledgeSearchResultSchema: z.ZodType<KnowledgeSearchResult> = z.object({
  chunk: knowledgeChunkSchema,
  score: z.number(),
  matchedTerms: z.array(z.string()),
  retrievalMode: z.enum(["keyword", "vector", "hybrid"]).optional(),
  scores: z
    .object({
      keyword: z.number().optional(),
      vector: z.number().optional(),
    })
    .optional(),
});

const knowledgeIngestResultSchema: z.ZodType<KnowledgeIngestResult> = z.object({
  document: knowledgeDocumentSchema,
  chunks: z.array(knowledgeChunkSchema),
});

const indexingJobSchema: z.ZodType<IndexingJob> = z.object({
  id: z.string(),
  tenantId: z.string(),
  createdBy: z.string().optional(),
  type: z.literal("tenant_reindex"),
  status: z.enum(["pending", "running", "completed", "failed", "cancelled"]),
  attempts: z.number(),
  maxAttempts: z.number(),
  totalChunks: z.number(),
  processedChunks: z.number(),
  failedChunks: z.number(),
  error: z.string().optional(),
  workerId: z.string().optional(),
  leaseUntil: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()),
  startedAt: z.string().optional(),
  heartbeatAt: z.string().optional(),
  completedAt: z.string().optional(),
  cancelledAt: z.string().optional(),
  deadLetteredAt: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const indexingWorkerStatusObjectSchema = z.object({
  workerId: z.string(),
  enabled: z.boolean(),
  stopped: z.boolean(),
  concurrency: z.number(),
  queueName: z.string(),
  retryQueueName: z.string(),
  deadLetterQueueName: z.string(),
  consumerGroup: z.string(),
  queueDepth: z.object({
    pending: z.number(),
    consumerPending: z.number(),
    delayed: z.number(),
    deadLetter: z.number(),
  }),
  queueAvailable: z.boolean(),
  queueError: z.string().optional(),
  leaseMs: z.number(),
  heartbeatIntervalMs: z.number(),
  recoveryIntervalMs: z.number(),
  retryDelayBaseMs: z.number(),
  retryDelayMaxMs: z.number(),
  pendingClaimMinIdleMs: z.number(),
});

const indexingWorkerStatusSchema: z.ZodType<IndexingWorkerStatus> = indexingWorkerStatusObjectSchema;

const indexingWorkerAlertsSchema: z.ZodType<IndexingWorkerAlerts> = z.object({
  status: z.enum(["ok", "warning", "critical"]),
  checkedAt: z.string(),
  thresholds: z.record(z.string(), z.number()),
  alerts: z.array(
    z.object({
      code: z.string(),
      severity: z.enum(["warning", "critical"]),
      message: z.string(),
      value: z.union([z.number(), z.string(), z.boolean()]),
      threshold: z.number().optional(),
    }),
  ),
  metrics: indexingWorkerStatusObjectSchema.extend({
    uptimeMs: z.number(),
    recoveryRunning: z.boolean(),
    lastRecoveryAt: z.string().optional(),
    lastRecoveryError: z.string().optional(),
    counters: z.record(z.string(), z.number()),
  }),
});

const workflowStatusValueSchema = z.enum([
  "draft",
  "running",
  "completed",
  "failed",
  "paused",
  "cancelled",
]);
const workflowStepStatusSchema = z.enum([
  "pending",
  "running",
  "completed",
  "failed",
  "skipped",
  "waiting_for_approval",
]);

const workflowStepSchema: z.ZodType<WorkflowStep> = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  status: workflowStepStatusSchema,
  order: z.number(),
  output: z.string().optional(),
  error: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const workflowEventSchema: z.ZodType<WorkflowEvent> = z.object({
  id: z.string(),
  type: z.enum(["created", "step_updated", "status_updated"]),
  timestamp: z.string(),
  message: z.string(),
  actorUserId: z.string(),
});

const workflowSchema: z.ZodType<Workflow> = z.object({
  id: z.string(),
  tenantId: z.string(),
  createdBy: z.string(),
  title: z.string(),
  goal: z.string(),
  status: workflowStatusValueSchema,
  steps: z.array(workflowStepSchema),
  events: z.array(workflowEventSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const workflowScheduleSchema: z.ZodType<WorkflowSchedule> = z.object({
  id: z.string(),
  tenantId: z.string(),
  workflowId: z.string(),
  createdBy: z.string(),
  name: z.string(),
  scheduleType: z.enum(["interval", "cron"]),
  cronExpression: z.string().optional(),
  intervalSeconds: z.number().optional(),
  timezone: z.string(),
  enabled: z.boolean(),
  maxConcurrentRuns: z.number(),
  nextRunAt: z.string(),
  lastRunAt: z.string().optional(),
  leaseOwner: z.string().optional(),
  leaseUntil: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const workflowScheduleRunSchema: z.ZodType<WorkflowScheduleRun> = z.object({
  id: z.string(),
  tenantId: z.string(),
  scheduleId: z.string(),
  workflowId: z.string(),
  triggeredBy: z.enum(["scheduler", "manual", "recovery"]),
  workerId: z.string().optional(),
  status: z.enum(["pending", "running", "completed", "failed", "cancelled"]),
  dueAt: z.string(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  error: z.string().optional(),
  output: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const workflowSchedulerStatusSchema: z.ZodType<WorkflowSchedulerStatus> = z.object({
  enabled: z.boolean(),
  store: z.string(),
  triggerModes: z.array(z.string()),
  capabilities: z.array(z.string()),
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

export async function listKnowledgeDocuments(
  credentials: AuthCredentials,
): Promise<KnowledgeDocument[]> {
  const payload = await fetchJson(`${apiBaseUrl}/knowledge/documents`, {
    headers: buildAuthHeaders(credentials),
  });
  return z.array(knowledgeDocumentSchema).parse(payload);
}

export async function ingestKnowledge(
  input: IngestKnowledgeInput,
): Promise<KnowledgeIngestResult> {
  const payload = await fetchJson(`${apiBaseUrl}/knowledge/ingest`, {
    method: "POST",
    headers: buildAuthHeaders(input, true),
    body: JSON.stringify({
      title: input.title,
      content: input.content,
      sourceType: input.sourceType,
      sourceUri: input.sourceUri || undefined,
      tags: input.tags,
    }),
  });
  return knowledgeIngestResultSchema.parse(payload);
}

export async function retrieveKnowledge(
  input: RetrieveKnowledgeInput,
): Promise<KnowledgeSearchResult[]> {
  const payload = await fetchJson(`${apiBaseUrl}/knowledge/retrieve`, {
    method: "POST",
    headers: buildAuthHeaders(input, true),
    body: JSON.stringify({
      query: input.query,
      limit: input.limit,
      tags: input.tags,
    }),
  });
  return z.array(knowledgeSearchResultSchema).parse(payload);
}

export async function enqueueKnowledgeReindex(
  credentials: AuthCredentials,
): Promise<IndexingJob> {
  const payload = await fetchJson(`${apiBaseUrl}/knowledge/reindex`, {
    method: "POST",
    headers: buildAuthHeaders(credentials, true),
    body: JSON.stringify({}),
  });
  return indexingJobSchema.parse(payload);
}

export async function listIndexingJobs(
  credentials: AuthCredentials,
): Promise<IndexingJob[]> {
  const payload = await fetchJson(`${apiBaseUrl}/knowledge/reindex/jobs`, {
    headers: buildAuthHeaders(credentials),
  });
  return z.array(indexingJobSchema).parse(payload);
}

export async function getIndexingWorkerStatus(
  credentials: AuthCredentials,
): Promise<IndexingWorkerStatus> {
  const payload = await fetchJson(`${apiBaseUrl}/knowledge/reindex/worker/status`, {
    headers: buildAuthHeaders(credentials),
  });
  return indexingWorkerStatusSchema.parse(payload);
}

export async function getIndexingWorkerAlerts(
  credentials: AuthCredentials,
): Promise<IndexingWorkerAlerts> {
  const payload = await fetchJson(`${apiBaseUrl}/knowledge/reindex/worker/alerts`, {
    headers: buildAuthHeaders(credentials),
  });
  return indexingWorkerAlertsSchema.parse(payload);
}

export async function listWorkflows(credentials: AuthCredentials): Promise<Workflow[]> {
  const payload = await fetchJson(`${apiBaseUrl}/workflows`, {
    headers: buildAuthHeaders(credentials),
  });
  return z.array(workflowSchema).parse(payload);
}

export async function createWorkflow(input: CreateWorkflowInput): Promise<Workflow> {
  const payload = await fetchJson(`${apiBaseUrl}/workflows`, {
    method: "POST",
    headers: buildAuthHeaders(input, true),
    body: JSON.stringify({
      title: input.title,
      goal: input.goal,
      steps: input.steps,
    }),
  });
  return workflowSchema.parse(payload);
}

export async function updateWorkflowStep(
  input: UpdateWorkflowStepInput,
): Promise<Workflow> {
  const payload = await fetchJson(
    `${apiBaseUrl}/workflows/${input.workflowId}/steps/${input.stepId}`,
    {
      method: "PATCH",
      headers: buildAuthHeaders(input, true),
      body: JSON.stringify({
        status: input.status,
        output: input.output || undefined,
        error: input.error || undefined,
      }),
    },
  );
  return workflowSchema.parse(payload);
}

export async function getWorkflowSchedulerStatus(
  credentials: AuthCredentials,
): Promise<WorkflowSchedulerStatus> {
  const payload = await fetchJson(`${apiBaseUrl}/workflows/scheduler/status`, {
    headers: buildAuthHeaders(credentials),
  });
  return workflowSchedulerStatusSchema.parse(payload);
}

export async function listWorkflowSchedules(
  credentials: AuthCredentials,
): Promise<WorkflowSchedule[]> {
  const payload = await fetchJson(`${apiBaseUrl}/workflows/schedules`, {
    headers: buildAuthHeaders(credentials),
  });
  return z.array(workflowScheduleSchema).parse(payload);
}

export async function createWorkflowSchedule(
  input: CreateWorkflowScheduleInput,
): Promise<WorkflowSchedule> {
  const payload = await fetchJson(`${apiBaseUrl}/workflows/schedules`, {
    method: "POST",
    headers: buildAuthHeaders(input, true),
    body: JSON.stringify({
      workflowId: input.workflowId,
      name: input.name,
      scheduleType: input.scheduleType,
      cronExpression: input.cronExpression || undefined,
      intervalSeconds: input.intervalSeconds,
      timezone: input.timezone || undefined,
      enabled: input.enabled,
      maxConcurrentRuns: input.maxConcurrentRuns,
      nextRunAt: input.nextRunAt,
      metadata: input.metadata,
    }),
  });
  return workflowScheduleSchema.parse(payload);
}

export async function listWorkflowScheduleRuns(
  credentials: AuthCredentials,
): Promise<WorkflowScheduleRun[]> {
  const payload = await fetchJson(`${apiBaseUrl}/workflows/schedule-runs`, {
    headers: buildAuthHeaders(credentials),
  });
  return z.array(workflowScheduleRunSchema).parse(payload);
}

export async function triggerWorkflowSchedule(input: AuthCredentials & {
  scheduleId: string;
}): Promise<WorkflowScheduleRun> {
  const payload = await fetchJson(
    `${apiBaseUrl}/workflows/schedules/${input.scheduleId}/trigger`,
    {
      method: "POST",
      headers: buildAuthHeaders(input, true),
      body: JSON.stringify({}),
    },
  );
  return workflowScheduleRunSchema.parse(payload);
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
