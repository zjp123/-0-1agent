type HttpMethod = "get" | "post" | "patch" | "delete";

type ApiRoute = {
  method: HttpMethod;
  path: string;
  tag: string;
  summary: string;
  operationId: string;
  permission?: string;
  requestSchema?: string;
  responseSchema?: string;
};

const routes: ApiRoute[] = [
  { method: "get", path: "/", tag: "System", summary: "Get API root metadata", operationId: "getRoot", responseSchema: "RootResponse" },
  { method: "get", path: "/health", tag: "System", summary: "Get service and dependency health", operationId: "getHealth", responseSchema: "HealthResponse" },
  { method: "get", path: "/health/live", tag: "System", summary: "Get process liveness", operationId: "getLive", responseSchema: "LiveResponse" },
  { method: "get", path: "/health/ready", tag: "System", summary: "Get dependency readiness", operationId: "getReady", responseSchema: "HealthResponse" },
  { method: "get", path: "/docs", tag: "Documentation", summary: "List API documentation groups", operationId: "getApiDocumentationSummary", responseSchema: "ApiDocumentationSummary" },
  { method: "get", path: "/docs/openapi.json", tag: "Documentation", summary: "Get OpenAPI document", operationId: "getOpenApiDocument", responseSchema: "OpenApiDocument" },
  { method: "get", path: "/agent/capabilities", tag: "Agent Runtime", summary: "Get agent capability snapshot", operationId: "getAgentCapabilities" },
  { method: "post", path: "/agent/run", tag: "Agent Runtime", summary: "Run an agent task", operationId: "runAgent", permission: "agent:run", requestSchema: "RunAgentRequest" },
  { method: "get", path: "/tools", tag: "Tools", summary: "List registered tools", operationId: "listTools" },
  { method: "post", path: "/tools/execute", tag: "Tools", summary: "Execute a registered tool", operationId: "executeTool", permission: "tools:execute", requestSchema: "ExecuteToolRequest" },
  { method: "post", path: "/knowledge/ingest", tag: "Knowledge", summary: "Ingest a knowledge document", operationId: "ingestKnowledge", permission: "knowledge:write", requestSchema: "IngestKnowledgeRequest" },
  { method: "post", path: "/knowledge/retrieve", tag: "Knowledge", summary: "Retrieve knowledge chunks", operationId: "retrieveKnowledge", permission: "knowledge:read", requestSchema: "RetrieveKnowledgeRequest" },
  { method: "get", path: "/knowledge/documents", tag: "Knowledge", summary: "List knowledge documents", operationId: "listKnowledgeDocuments", permission: "knowledge:read" },
  { method: "post", path: "/knowledge/reindex", tag: "Knowledge Indexing", summary: "Enqueue tenant reindex job", operationId: "reindexKnowledge", permission: "knowledge:write" },
  { method: "get", path: "/knowledge/reindex/jobs", tag: "Knowledge Indexing", summary: "List indexing jobs", operationId: "listIndexingJobs", permission: "knowledge:read" },
  { method: "get", path: "/knowledge/reindex/jobs/{jobId}", tag: "Knowledge Indexing", summary: "Get indexing job", operationId: "getIndexingJob", permission: "knowledge:read" },
  { method: "post", path: "/knowledge/reindex/jobs/{jobId}/cancel", tag: "Knowledge Indexing", summary: "Cancel indexing job", operationId: "cancelIndexingJob", permission: "knowledge:write" },
  { method: "post", path: "/knowledge/reindex/jobs/{jobId}/replay", tag: "Knowledge Indexing", summary: "Replay dead-letter indexing job", operationId: "replayDeadLetterJob", permission: "knowledge:write" },
  { method: "get", path: "/knowledge/reindex/worker/status", tag: "Knowledge Indexing", summary: "Get indexing worker status", operationId: "getIndexingWorkerStatus", permission: "knowledge:read" },
  { method: "get", path: "/knowledge/reindex/worker/metrics", tag: "Knowledge Indexing", summary: "Get indexing worker metrics", operationId: "getIndexingWorkerMetrics", permission: "knowledge:read" },
  { method: "get", path: "/knowledge/reindex/worker/alerts", tag: "Knowledge Indexing", summary: "Get indexing worker alerts", operationId: "getIndexingWorkerAlerts", permission: "knowledge:read" },
  { method: "get", path: "/knowledge/reindex/worker/prometheus", tag: "Knowledge Indexing", summary: "Get Prometheus metrics", operationId: "getIndexingWorkerPrometheus", permission: "knowledge:read", responseSchema: "PlainTextResponse" },
  { method: "get", path: "/knowledge/reindex/jobs/stuck", tag: "Knowledge Indexing", summary: "List stuck indexing jobs", operationId: "listStuckIndexingJobs", permission: "knowledge:read" },
  { method: "get", path: "/knowledge/reindex/dead-letter", tag: "Knowledge Indexing", summary: "List dead-letter indexing messages", operationId: "listDeadLetters", permission: "knowledge:read" },
  { method: "post", path: "/knowledge/reindex/dead-letter/replay-all", tag: "Knowledge Indexing", summary: "Replay all tenant dead letters", operationId: "replayAllDeadLetters", permission: "knowledge:write" },
  { method: "post", path: "/knowledge/reindex/dead-letter/purge", tag: "Knowledge Indexing", summary: "Purge tenant dead letters", operationId: "purgeDeadLetters", permission: "knowledge:write" },
  { method: "post", path: "/workflows", tag: "Workflows", summary: "Create workflow", operationId: "createWorkflow", permission: "workflow:manage", requestSchema: "CreateWorkflowRequest" },
  { method: "get", path: "/workflows", tag: "Workflows", summary: "List workflows", operationId: "listWorkflows", permission: "workflow:manage" },
  { method: "get", path: "/workflows/{workflowId}", tag: "Workflows", summary: "Get workflow", operationId: "getWorkflow", permission: "workflow:manage" },
  { method: "patch", path: "/workflows/{workflowId}/steps/{stepId}", tag: "Workflows", summary: "Update workflow step", operationId: "updateWorkflowStep", permission: "workflow:manage", requestSchema: "UpdateWorkflowStepRequest" },
  { method: "get", path: "/workflows/scheduler/status", tag: "Workflow Scheduling", summary: "Get scheduler status", operationId: "getWorkflowSchedulerStatus", permission: "workflow:manage" },
  { method: "get", path: "/workflows/schedules", tag: "Workflow Scheduling", summary: "List workflow schedules", operationId: "listWorkflowSchedules", permission: "workflow:manage" },
  { method: "post", path: "/workflows/schedules", tag: "Workflow Scheduling", summary: "Create workflow schedule", operationId: "createWorkflowSchedule", permission: "workflow:manage", requestSchema: "CreateWorkflowScheduleRequest" },
  { method: "post", path: "/workflows/schedules/claim-due", tag: "Workflow Scheduling", summary: "Claim due workflow schedules", operationId: "claimDueWorkflowSchedules", permission: "workflow:manage", requestSchema: "ClaimWorkflowSchedulesRequest" },
  { method: "get", path: "/workflows/schedule-runs", tag: "Workflow Scheduling", summary: "List workflow schedule runs", operationId: "listWorkflowScheduleRuns", permission: "workflow:manage" },
  { method: "get", path: "/workflows/schedules/{scheduleId}/runs", tag: "Workflow Scheduling", summary: "List runs for a schedule", operationId: "listWorkflowScheduleRunsForSchedule", permission: "workflow:manage" },
  { method: "post", path: "/workflows/schedules/{scheduleId}/trigger", tag: "Workflow Scheduling", summary: "Trigger workflow schedule manually", operationId: "triggerWorkflowSchedule", permission: "workflow:manage" },
  { method: "post", path: "/workflows/schedule-runs/{runId}/complete", tag: "Workflow Scheduling", summary: "Complete workflow schedule run", operationId: "completeWorkflowScheduleRun", permission: "workflow:manage", requestSchema: "CompleteWorkflowScheduleRunRequest" },
  { method: "get", path: "/orchestration/status", tag: "Orchestration", summary: "Get orchestration status", operationId: "getOrchestrationStatus", permission: "workflow:manage" },
  { method: "get", path: "/orchestration/participants", tag: "Orchestration", summary: "List orchestration participants", operationId: "listOrchestrationParticipants", permission: "workflow:manage" },
  { method: "post", path: "/orchestration/participants", tag: "Orchestration", summary: "Create orchestration participant", operationId: "createOrchestrationParticipant", permission: "workflow:manage", requestSchema: "CreateOrchestrationParticipantRequest" },
  { method: "get", path: "/orchestration/runs", tag: "Orchestration", summary: "List orchestration runs", operationId: "listOrchestrationRuns", permission: "workflow:manage" },
  { method: "get", path: "/orchestration/runs/{runId}", tag: "Orchestration", summary: "Get orchestration run", operationId: "getOrchestrationRun", permission: "workflow:manage" },
  { method: "post", path: "/orchestration/runs", tag: "Orchestration", summary: "Run multi-agent orchestration", operationId: "runOrchestration", permission: "workflow:manage", requestSchema: "RunOrchestrationRequest" },
  { method: "get", path: "/evaluations/cases", tag: "Evaluations", summary: "List evaluation cases", operationId: "listEvaluationCases", permission: "evaluation:manage" },
  { method: "post", path: "/evaluations/cases", tag: "Evaluations", summary: "Create evaluation case", operationId: "createEvaluationCase", permission: "evaluation:manage", requestSchema: "CreateEvaluationCaseRequest" },
  { method: "post", path: "/evaluations/cases/{caseId}/runs", tag: "Evaluations", summary: "Run evaluation case", operationId: "runEvaluationCase", permission: "evaluation:manage", requestSchema: "RunEvaluationRequest" },
  { method: "get", path: "/evaluations/runs", tag: "Evaluations", summary: "List evaluation runs", operationId: "listEvaluationRuns", permission: "evaluation:manage" },
  { method: "get", path: "/observability/traces", tag: "Observability", summary: "List trace events", operationId: "listTraces", permission: "observability:read" },
  { method: "get", path: "/governance/quota/policies", tag: "Governance", summary: "List quota policies", operationId: "listQuotaPolicies", permission: "auth:manage" },
  { method: "post", path: "/governance/quota/policies", tag: "Governance", summary: "Create quota policy", operationId: "createQuotaPolicy", permission: "auth:manage", requestSchema: "CreateQuotaPolicyRequest" },
  { method: "patch", path: "/governance/quota/policies/{policyId}", tag: "Governance", summary: "Update quota policy", operationId: "updateQuotaPolicy", permission: "auth:manage" },
  { method: "get", path: "/governance/quota/events", tag: "Governance", summary: "List quota usage events", operationId: "listQuotaUsageEvents", permission: "auth:manage" },
  { method: "get", path: "/governance/approval/policies", tag: "Approvals", summary: "List approval policies", operationId: "listApprovalPolicies", permission: "auth:manage" },
  { method: "post", path: "/governance/approval/policies", tag: "Approvals", summary: "Create approval policy", operationId: "createApprovalPolicy", permission: "auth:manage", requestSchema: "CreateApprovalPolicyRequest" },
  { method: "get", path: "/governance/approval/requests", tag: "Approvals", summary: "List approval requests", operationId: "listApprovalRequests", permission: "auth:manage" },
  { method: "post", path: "/governance/approval/requests", tag: "Approvals", summary: "Create approval request", operationId: "createApprovalRequest", permission: "auth:manage", requestSchema: "CreateApprovalRequestRequest" },
  { method: "post", path: "/governance/approval/requests/{requestId}/approve", tag: "Approvals", summary: "Approve request", operationId: "approveApprovalRequest", permission: "auth:manage", requestSchema: "DecisionCommentRequest" },
  { method: "post", path: "/governance/approval/requests/{requestId}/reject", tag: "Approvals", summary: "Reject request", operationId: "rejectApprovalRequest", permission: "auth:manage", requestSchema: "DecisionCommentRequest" },
  { method: "post", path: "/governance/approval/requests/{requestId}/cancel", tag: "Approvals", summary: "Cancel request", operationId: "cancelApprovalRequest", permission: "auth:manage", requestSchema: "DecisionCommentRequest" },
  { method: "get", path: "/secrets", tag: "Secrets", summary: "List secrets", operationId: "listSecrets", permission: "auth:manage" },
  { method: "post", path: "/secrets", tag: "Secrets", summary: "Create secret", operationId: "createSecret", permission: "auth:manage", requestSchema: "CreateSecretRequest" },
  { method: "get", path: "/secrets/{secretId}/value", tag: "Secrets", summary: "Read secret value", operationId: "getSecretValue", permission: "auth:manage" },
  { method: "patch", path: "/secrets/{secretId}", tag: "Secrets", summary: "Update secret metadata", operationId: "updateSecret", permission: "auth:manage" },
  { method: "post", path: "/secrets/{secretId}/rotate", tag: "Secrets", summary: "Rotate secret value", operationId: "rotateSecret", permission: "auth:manage", requestSchema: "RotateSecretRequest" },
  { method: "get", path: "/secrets/provider-credentials", tag: "Secrets", summary: "List provider credentials", operationId: "listProviderCredentials", permission: "auth:manage" },
  { method: "post", path: "/secrets/provider-credentials", tag: "Secrets", summary: "Create provider credential", operationId: "createProviderCredential", permission: "auth:manage" },
];

export type ApiDocumentationSummary = {
  title: string;
  version: string;
  openapiUrl: string;
  groups: Array<{
    tag: string;
    operations: Array<Pick<ApiRoute, "method" | "path" | "summary" | "operationId" | "permission">>;
  }>;
};

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Enterprise Agent API",
    version: "0.1.0",
    description: "Production-oriented API contract baseline for the enterprise agent platform.",
  },
  servers: [{ url: "/api" }],
  tags: [...new Set(routes.map((route) => route.tag))].map((name) => ({ name })),
  security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }],
  paths: toOpenApiPaths(routes),
  components: {
    securitySchemes: {
      ApiKeyAuth: { type: "apiKey", in: "header", name: "x-api-key" },
      BearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
    },
    schemas: buildSchemas(),
  },
} as const;

export function getApiDocumentationSummary(): ApiDocumentationSummary {
  const groups = new Map<string, ApiDocumentationSummary["groups"][number]>();
  for (const route of routes) {
    const group = groups.get(route.tag) ?? { tag: route.tag, operations: [] };
    group.operations.push({
      method: route.method,
      path: route.path,
      summary: route.summary,
      operationId: route.operationId,
      ...(route.permission ? { permission: route.permission } : {}),
    });
    groups.set(route.tag, group);
  }
  return {
    title: openApiDocument.info.title,
    version: openApiDocument.info.version,
    openapiUrl: "/api/docs/openapi.json",
    groups: [...groups.values()],
  };
}

function toOpenApiPaths(apiRoutes: ApiRoute[]): Record<string, Record<string, unknown>> {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of apiRoutes) {
    const path = paths[route.path] ?? {};
    path[route.method] = {
      tags: [route.tag],
      summary: route.summary,
      operationId: route.operationId,
      ...(route.permission ? { description: `Requires permission: ${route.permission}` } : {}),
      ...(route.permission ? { security: [{ ApiKeyAuth: [] }, { BearerAuth: [] }] } : {}),
      parameters: pathParameters(route.path),
      ...(route.requestSchema ? { requestBody: jsonRequestBody(route.requestSchema) } : {}),
      responses: successResponses(route.responseSchema),
    };
    paths[route.path] = path;
  }
  return paths;
}

function pathParameters(path: string): Array<Record<string, unknown>> {
  const matches = path.matchAll(/\{([^}]+)\}/g);
  return [...matches].map((match) => ({
    name: match[1],
    in: "path",
    required: true,
    schema: { type: "string" },
  }));
}

function jsonRequestBody(schemaName: string): Record<string, unknown> {
  return {
    required: true,
    content: {
      "application/json": {
        schema: { $ref: `#/components/schemas/${schemaName}` },
      },
    },
  };
}

function successResponses(schemaName = "AnyJson"): Record<string, unknown> {
  if (schemaName === "PlainTextResponse") {
    return {
      "200": {
        description: "Successful response",
        content: { "text/plain": { schema: { type: "string" } } },
      },
    };
  }
  return {
    "200": {
      description: "Successful response",
      content: {
        "application/json": {
          schema: { $ref: `#/components/schemas/${schemaName}` },
        },
      },
    },
    "400": { $ref: "#/components/responses/BadRequest" },
    "401": { $ref: "#/components/responses/Unauthorized" },
    "403": { $ref: "#/components/responses/Forbidden" },
  };
}

function buildSchemas(): Record<string, unknown> {
  return {
    AnyJson: true,
    OpenApiDocument: { type: "object", additionalProperties: true },
    RootResponse: objectSchema({ service: stringSchema(), docs: arraySchema(stringSchema()) }, ["service", "docs"]),
    HealthResponse: objectSchema({
      status: { type: "string", enum: ["ok"] },
      service: stringSchema(),
      environment: stringSchema(),
      uptimeSeconds: numberSchema(),
      timestamp: stringSchema("date-time"),
      dependencies: { type: "object", additionalProperties: true },
    }, ["status", "service", "environment", "uptimeSeconds", "timestamp", "dependencies"]),
    LiveResponse: objectSchema({
      status: { type: "string", enum: ["ok"] },
      service: stringSchema(),
      uptimeSeconds: numberSchema(),
      timestamp: stringSchema("date-time"),
    }, ["status", "service", "uptimeSeconds", "timestamp"]),
    ApiDocumentationSummary: objectSchema({
      title: stringSchema(),
      version: stringSchema(),
      openapiUrl: stringSchema(),
      groups: arraySchema({ type: "object", additionalProperties: true }),
    }, ["title", "version", "openapiUrl", "groups"]),
    RunAgentRequest: objectSchema({
      message: stringSchema(),
      requestId: stringSchema("uuid"),
      systemPrompt: stringSchema(),
      messages: arraySchema({ type: "object", additionalProperties: true }),
      maxSteps: integerSchema(1, 10),
      contextMaxTokens: integerSchema(1000, 200000),
      reservedResponseTokens: integerSchema(1, 100000),
      maxDurationMs: integerSchema(1000, 120000),
      model: stringSchema(),
    }, ["message", "requestId"]),
    ExecuteToolRequest: objectSchema({
      requestId: stringSchema("uuid"),
      name: stringSchema(),
      arguments: { type: "object", additionalProperties: true },
    }, ["requestId", "name", "arguments"]),
    IngestKnowledgeRequest: objectSchema({
      title: stringSchema(),
      content: stringSchema(),
      sourceType: stringSchema(),
      sourceUri: stringSchema(),
      tags: arraySchema(stringSchema()),
    }, ["title", "content"]),
    RetrieveKnowledgeRequest: objectSchema({
      query: stringSchema(),
      limit: integerSchema(1, 20),
      tags: arraySchema(stringSchema()),
    }, ["query"]),
    CreateWorkflowRequest: objectSchema({
      title: stringSchema(),
      goal: stringSchema(),
      steps: arraySchema(objectSchema({ title: stringSchema(), description: stringSchema() }, ["title"])),
    }, ["title", "goal", "steps"]),
    UpdateWorkflowStepRequest: objectSchema({
      status: { type: "string", enum: ["pending", "running", "completed", "failed", "skipped", "waiting_for_approval"] },
      output: stringSchema(),
      error: stringSchema(),
    }, ["status"]),
    CreateWorkflowScheduleRequest: objectSchema({
      workflowId: stringSchema("uuid"),
      name: stringSchema(),
      scheduleType: { type: "string", enum: ["interval", "cron"] },
      cronExpression: stringSchema(),
      intervalSeconds: integerSchema(60, 31536000),
      timezone: stringSchema(),
      enabled: booleanSchema(),
      maxConcurrentRuns: integerSchema(1, 20),
      nextRunAt: stringSchema("date-time"),
      metadata: { type: "object", additionalProperties: true },
    }, ["workflowId", "name", "scheduleType", "nextRunAt"]),
    ClaimWorkflowSchedulesRequest: objectSchema({
      workerId: stringSchema(),
      limit: integerSchema(1, 100),
      leaseMs: integerSchema(1000, 3600000),
      now: stringSchema("date-time"),
    }, ["workerId"]),
    CompleteWorkflowScheduleRunRequest: objectSchema({
      status: { type: "string", enum: ["completed", "failed", "cancelled"] },
      output: stringSchema(),
      error: stringSchema(),
      metadata: { type: "object", additionalProperties: true },
    }, ["status"]),
    CreateOrchestrationParticipantRequest: objectSchema({
      name: stringSchema(),
      role: { type: "string", enum: ["coordinator", "worker", "reviewer", "specialist"] },
      systemPrompt: stringSchema(),
      model: stringSchema(),
      enabled: booleanSchema(),
      maxSteps: integerSchema(1, 10),
      maxDurationMs: integerSchema(1000, 120000),
      metadata: { type: "object", additionalProperties: true },
    }, ["name", "role"]),
    RunOrchestrationRequest: objectSchema({
      requestId: stringSchema("uuid"),
      objective: stringSchema(),
      participantIds: arraySchema(stringSchema("uuid")),
      workflowId: stringSchema("uuid"),
      correlationId: stringSchema(),
      metadata: { type: "object", additionalProperties: true },
    }, ["requestId", "objective", "participantIds"]),
    CreateEvaluationCaseRequest: objectSchema({
      name: stringSchema(),
      type: { type: "string", enum: ["agent_response", "rag_retrieval", "tool_execution"] },
      input: stringSchema(),
      expectedOutput: stringSchema(),
      tags: arraySchema(stringSchema()),
    }, ["name", "type", "input", "expectedOutput"]),
    RunEvaluationRequest: objectSchema({ actualOutput: stringSchema() }, ["actualOutput"]),
    CreateQuotaPolicyRequest: objectSchema({ name: stringSchema(), action: stringSchema(), subjectType: stringSchema() }, ["name", "action", "subjectType"]),
    CreateApprovalPolicyRequest: objectSchema({ name: stringSchema(), action: stringSchema(), resourceType: stringSchema(), requiredApprovals: integerSchema(1), enabled: booleanSchema() }, ["name", "action", "resourceType"]),
    CreateApprovalRequestRequest: objectSchema({ action: stringSchema(), resourceType: stringSchema(), resourceId: stringSchema(), reason: stringSchema(), payload: { type: "object", additionalProperties: true }, expiresAt: stringSchema("date-time") }, ["action", "resourceType", "reason"]),
    DecisionCommentRequest: objectSchema({ comment: stringSchema() }),
    CreateSecretRequest: objectSchema({ name: stringSchema(), provider: stringSchema(), purpose: stringSchema(), value: stringSchema(), reason: stringSchema(), metadata: { type: "object", additionalProperties: true } }, ["name", "provider", "purpose", "value", "reason"]),
    RotateSecretRequest: objectSchema({ value: stringSchema(), reason: stringSchema(), approvalId: stringSchema("uuid") }, ["value", "reason"]),
  };
}

function objectSchema(properties: Record<string, unknown>, required: string[] = []): Record<string, unknown> {
  return { type: "object", additionalProperties: false, properties, ...(required.length ? { required } : {}) };
}

function arraySchema(items: Record<string, unknown>): Record<string, unknown> {
  return { type: "array", items };
}

function stringSchema(format?: string): Record<string, unknown> {
  return { type: "string", ...(format ? { format } : {}) };
}

function integerSchema(minimum?: number, maximum?: number): Record<string, unknown> {
  return { type: "integer", ...(minimum !== undefined ? { minimum } : {}), ...(maximum !== undefined ? { maximum } : {}) };
}

function numberSchema(): Record<string, unknown> {
  return { type: "number" };
}

function booleanSchema(): Record<string, unknown> {
  return { type: "boolean" };
}
