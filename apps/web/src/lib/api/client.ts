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
  accessToken?: string;
  apiKey?: string;
  serviceToken?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  idleTimeoutMs?: number;
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
  accessToken?: string;
  apiKey?: string;
  serviceToken?: string;
};

export type ConsoleAuthUser = {
  userId: string;
  tenantId: string;
  roles: Role[];
  permissions: Permission[];
  authType: "api_key" | "dev" | "jwt" | "service_token";
  tokenId?: string;
};

export type ConsoleAuthResponse = {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  refreshTokenExpiresAt: string;
  sessionId: string;
  user: ConsoleAuthUser;
};

export type ConsoleLoginInput = {
  credentialType: "api_key" | "service_token";
  credential: string;
  tenantId?: string;
  userId?: string;
  deviceLabel?: string;
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

export type EvaluationCaseType =
  | "agent_response"
  | "rag_retrieval"
  | "tool_execution";

export type EvaluationCase = {
  id: string;
  tenantId: string;
  createdBy: string;
  name: string;
  type: EvaluationCaseType;
  input: string;
  expectedOutput: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};

export type EvaluationRun = {
  id: string;
  tenantId: string;
  caseId: string;
  status: "passed" | "failed";
  score: number;
  actualOutput: string;
  expectedOutput: string;
  evaluator: "string_contains";
  notes: string[];
  createdAt: string;
};

export type CreateEvaluationCaseInput = AuthCredentials & {
  name: string;
  type: EvaluationCaseType;
  input: string;
  expectedOutput: string;
  tags?: string[];
};

export type RunEvaluationCaseInput = AuthCredentials & {
  caseId: string;
  actualOutput: string;
};

export type TraceEventType =
  | "agent.run.started"
  | "agent.context.built"
  | "rag.retrieved"
  | "rag.vector.failed"
  | "rag.indexing.completed"
  | "rag.indexing.failed"
  | "rag.indexing.admin"
  | "rag.indexing.recovery"
  | "model.completed"
  | "model.failed"
  | "tool.completed"
  | "agent.run.completed"
  | "orchestration.run.started"
  | "orchestration.handoff.started"
  | "orchestration.handoff.completed"
  | "orchestration.handoff.failed"
  | "orchestration.run.completed"
  | "workflow.schedule.created"
  | "workflow.schedule.run.created"
  | "workflow.schedule.run.failed";

export const TRACE_EVENT_TYPES: TraceEventType[] = [
  "agent.run.started",
  "agent.context.built",
  "rag.retrieved",
  "rag.vector.failed",
  "rag.indexing.completed",
  "rag.indexing.failed",
  "rag.indexing.admin",
  "rag.indexing.recovery",
  "model.completed",
  "model.failed",
  "tool.completed",
  "agent.run.completed",
  "orchestration.run.started",
  "orchestration.handoff.started",
  "orchestration.handoff.completed",
  "orchestration.handoff.failed",
  "orchestration.run.completed",
  "workflow.schedule.created",
  "workflow.schedule.run.created",
  "workflow.schedule.run.failed",
];

export type TraceEvent = {
  id: string;
  requestId: string;
  type: TraceEventType;
  timestamp: string;
  durationMs?: number;
  userId?: string;
  tenantId?: string;
  attributes: Record<string, string | number | boolean | null>;
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

const consoleAuthUserSchema: z.ZodType<ConsoleAuthUser> = z.object({
  userId: z.string(),
  tenantId: z.string(),
  roles: z.array(roleSchema),
  permissions: z.array(permissionSchema),
  authType: authTypeSchema,
  tokenId: z.string().optional(),
});

const consoleAuthResponseSchema: z.ZodType<ConsoleAuthResponse> = z.object({
  accessToken: z.string(),
  refreshToken: z.string(),
  expiresAt: z.string(),
  refreshTokenExpiresAt: z.string(),
  sessionId: z.string(),
  user: consoleAuthUserSchema,
});

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

const evaluationCaseTypeSchema = z.enum([
  "agent_response",
  "rag_retrieval",
  "tool_execution",
]);

const evaluationCaseSchema: z.ZodType<EvaluationCase> = z.object({
  id: z.string(),
  tenantId: z.string(),
  createdBy: z.string(),
  name: z.string(),
  type: evaluationCaseTypeSchema,
  input: z.string(),
  expectedOutput: z.string(),
  tags: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const evaluationRunSchema: z.ZodType<EvaluationRun> = z.object({
  id: z.string(),
  tenantId: z.string(),
  caseId: z.string(),
  status: z.enum(["passed", "failed"]),
  score: z.number(),
  actualOutput: z.string(),
  expectedOutput: z.string(),
  evaluator: z.literal("string_contains"),
  notes: z.array(z.string()),
  createdAt: z.string(),
});

const traceEventTypeSchema = z.enum(TRACE_EVENT_TYPES);

const traceEventSchema: z.ZodType<TraceEvent> = z.object({
  id: z.string(),
  requestId: z.string(),
  type: traceEventTypeSchema,
  timestamp: z.string(),
  durationMs: z.number().optional(),
  userId: z.string().optional(),
  tenantId: z.string().optional(),
  attributes: z.record(
    z.string(),
    z.union([z.string(), z.number(), z.boolean(), z.null()]),
  ),
});

const DEFAULT_REQUEST_TIMEOUT_MS = 15_000;
const DEFAULT_GET_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 300;
const DEFAULT_STREAM_TIMEOUT_MS = 120_000;
const DEFAULT_STREAM_IDLE_TIMEOUT_MS = 45_000;

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
  const controller = new AbortController();
  const cleanupSignals = linkAbortSignals(input.signal, controller);
  const timeout = setTimeout(() => {
    controller.abort(new Error("Agent stream timed out."));
  }, input.timeoutMs ?? DEFAULT_STREAM_TIMEOUT_MS);
  let idleTimeout = setTimeout(() => {
    controller.abort(new Error("Agent stream idle timeout."));
  }, input.idleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS);
  const resetIdleTimeout = () => {
    clearTimeout(idleTimeout);
    idleTimeout = setTimeout(() => {
      controller.abort(new Error("Agent stream idle timeout."));
    }, input.idleTimeoutMs ?? DEFAULT_STREAM_IDLE_TIMEOUT_MS);
  };

  const headers: Record<string, string> = {
    accept: "text/event-stream",
    "content-type": "application/json",
  };
  if (input.accessToken) {
    headers.authorization = `Bearer ${input.accessToken}`;
  }
  if (input.apiKey) {
    headers["x-api-key"] = input.apiKey;
  }
  if (input.serviceToken) {
    headers["x-service-token"] = input.serviceToken;
  }

  try {
    const response = await fetch(`${apiBaseUrl}/agent/run/stream`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        requestId: input.requestId,
        message: input.message,
        messages: input.messages,
      }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      const message = await response.text();
      throw new Error(normalizeHttpErrorMessage(message, response.status, "Agent stream failed"));
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      resetIdleTimeout();

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
  } finally {
    clearTimeout(timeout);
    clearTimeout(idleTimeout);
    cleanupSignals();
  }
}

function normalizeHttpErrorMessage(
  responseText: string,
  status: number,
  fallback: string,
): string {
  if (!responseText.trim()) {
    return `${fallback} with HTTP ${status}.`;
  }

  try {
    const payload = JSON.parse(responseText) as {
      message?: unknown;
      error?: unknown;
    };
    const message =
      typeof payload.message === "string" ? payload.message : undefined;
    const error = typeof payload.error === "string" ? payload.error : undefined;
    return [error, message].filter(Boolean).join(": ") || `${fallback} with HTTP ${status}.`;
  } catch {
    return responseText;
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
} & AuthCredentials): Promise<ToolCallResponse> {
  const headers: Record<string, string> = buildAuthHeaders(input, true);

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

export async function consoleLogin(input: ConsoleLoginInput): Promise<ConsoleAuthResponse> {
  const payload = await fetchJson(`${apiBaseUrl}/auth/console/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      credentialType: input.credentialType,
      credential: input.credential,
      tenantId: input.tenantId || undefined,
      userId: input.userId || undefined,
      deviceLabel: input.deviceLabel || undefined,
    }),
  });
  return consoleAuthResponseSchema.parse(payload);
}

export async function consoleRefresh(refreshToken: string): Promise<ConsoleAuthResponse> {
  const payload = await fetchJson(`${apiBaseUrl}/auth/console/refresh`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
  return consoleAuthResponseSchema.parse(payload);
}

export async function consoleLogout(refreshToken: string): Promise<void> {
  await fetchJson(`${apiBaseUrl}/auth/console/logout`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ refreshToken }),
  });
}

export async function getConsoleMe(accessToken: string): Promise<ConsoleAuthUser> {
  const payload = await fetchJson(`${apiBaseUrl}/auth/console/me`, {
    headers: buildAuthHeaders({ accessToken }),
  });
  return consoleAuthUserSchema.parse(payload);
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

export async function listEvaluationCases(
  credentials: AuthCredentials,
): Promise<EvaluationCase[]> {
  const payload = await fetchJson(`${apiBaseUrl}/evaluations/cases`, {
    headers: buildAuthHeaders(credentials),
  });
  return z.array(evaluationCaseSchema).parse(payload);
}

export async function createEvaluationCase(
  input: CreateEvaluationCaseInput,
): Promise<EvaluationCase> {
  const payload = await fetchJson(`${apiBaseUrl}/evaluations/cases`, {
    method: "POST",
    headers: buildAuthHeaders(input, true),
    body: JSON.stringify({
      name: input.name,
      type: input.type,
      input: input.input,
      expectedOutput: input.expectedOutput,
      tags: input.tags,
    }),
  });
  return evaluationCaseSchema.parse(payload);
}

export async function runEvaluationCase(
  input: RunEvaluationCaseInput,
): Promise<EvaluationRun> {
  const payload = await fetchJson(`${apiBaseUrl}/evaluations/cases/${input.caseId}/runs`, {
    method: "POST",
    headers: buildAuthHeaders(input, true),
    body: JSON.stringify({
      actualOutput: input.actualOutput,
    }),
  });
  return evaluationRunSchema.parse(payload);
}

export async function listEvaluationRuns(
  credentials: AuthCredentials,
  query: { caseId?: string } = {},
): Promise<EvaluationRun[]> {
  const params = new URLSearchParams();
  if (query.caseId) {
    params.set("caseId", query.caseId);
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  const payload = await fetchJson(`${apiBaseUrl}/evaluations/runs${suffix}`, {
    headers: buildAuthHeaders(credentials),
  });
  return z.array(evaluationRunSchema).parse(payload);
}

export async function listTraceEvents(
  credentials: AuthCredentials,
  query: { requestId?: string; type?: TraceEventType; limit?: number } = {},
): Promise<TraceEvent[]> {
  const params = new URLSearchParams();
  if (query.requestId) {
    params.set("requestId", query.requestId);
  }
  if (query.type) {
    params.set("type", query.type);
  }
  if (query.limit !== undefined) {
    params.set("limit", String(query.limit));
  }
  const suffix = params.size > 0 ? `?${params.toString()}` : "";
  const payload = await fetchJson(`${apiBaseUrl}/observability/traces${suffix}`, {
    headers: buildAuthHeaders(credentials),
  });
  return z.array(traceEventSchema).parse(payload);
}

type FetchJsonInit = RequestInit & {
  retries?: number;
  timeoutMs?: number;
};

async function fetchJson(url: string, init: FetchJsonInit): Promise<unknown> {
  const method = (init.method ?? "GET").toUpperCase();
  const retries = init.retries ?? (method === "GET" ? DEFAULT_GET_RETRIES : 0);
  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const cleanupSignals = linkAbortSignals(init.signal ?? undefined, controller);
    const timeout = setTimeout(() => {
      controller.abort(new Error(`Request timed out after ${init.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS} ms.`));
    }, init.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        cache: "no-store",
        ...init,
        signal: controller.signal,
        headers: {
          accept: "application/json",
          ...init.headers,
        },
      });

      const text = await response.text();
      const payload = text ? (JSON.parse(text) as unknown) : undefined;
      if (!response.ok) {
        if (response.status >= 500 && attempt < retries) {
          await delay(DEFAULT_RETRY_DELAY_MS * (attempt + 1));
          continue;
        }
        throw new Error(normalizeHttpErrorMessage(text, response.status, "Request failed"));
      }
      return payload;
    } catch (error) {
      lastError = error;
      if (attempt >= retries || (error instanceof DOMException && error.name === "AbortError")) {
        throw error;
      }
      await delay(DEFAULT_RETRY_DELAY_MS * (attempt + 1));
    } finally {
      clearTimeout(timeout);
      cleanupSignals();
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Request failed.");
}

function buildAuthHeaders(
  credentials: AuthCredentials,
  includeJson = false,
): Record<string, string> {
  const headers: Record<string, string> = includeJson
    ? { "content-type": "application/json" }
    : {};
  if (credentials.accessToken) {
    headers.authorization = `Bearer ${credentials.accessToken}`;
  }
  if (credentials.apiKey) {
    headers["x-api-key"] = credentials.apiKey;
  }
  if (credentials.serviceToken) {
    headers["x-service-token"] = credentials.serviceToken;
  }
  return headers;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function linkAbortSignals(
  externalSignal: AbortSignal | undefined,
  controller: AbortController,
): () => void {
  if (!externalSignal) {
    return () => undefined;
  }

  if (externalSignal.aborted) {
    controller.abort(externalSignal.reason);
    return () => undefined;
  }

  const onAbort = () => controller.abort(externalSignal.reason);
  externalSignal.addEventListener("abort", onAbort, { once: true });
  return () => externalSignal.removeEventListener("abort", onAbort);
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
