import {
  boolean,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const messageRoleEnum = pgEnum("message_role", [
  "system",
  "user",
  "assistant",
  "tool",
]);

export const workflowStatusEnum = pgEnum("workflow_status", [
  "draft",
  "running",
  "completed",
  "failed",
  "paused",
  "cancelled",
]);

export const workflowStepStatusEnum = pgEnum("workflow_step_status", [
  "pending",
  "running",
  "completed",
  "failed",
  "skipped",
  "waiting_for_approval",
]);

export const evaluationCaseTypeEnum = pgEnum("evaluation_case_type", [
  "agent_response",
  "rag_retrieval",
  "tool_execution",
]);

export const indexingJobStatusEnum = pgEnum("indexing_job_status", [
  "pending",
  "running",
  "completed",
  "failed",
  "cancelled",
]);

export const tenants = pgTable("tenants", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: varchar("name", { length: 160 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    externalId: varchar("external_id", { length: 160 }).notNull(),
    displayName: varchar("display_name", { length: 160 }).notNull(),
    roles: jsonb("roles").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantExternalIdx: index("users_tenant_external_idx").on(
      table.tenantId,
      table.externalId,
    ),
  }),
);

export const authRoles = pgTable(
  "auth_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    name: varchar("name", { length: 80 }).notNull(),
    permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantNameIdx: uniqueIndex("auth_roles_tenant_name_idx").on(
      table.tenantId,
      table.name,
    ),
  }),
);

export const authUserRoles = pgTable(
  "auth_user_roles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    roleId: uuid("role_id").notNull().references(() => authRoles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    userRoleIdx: uniqueIndex("auth_user_roles_user_role_idx").on(
      table.userId,
      table.roleId,
    ),
    tenantUserIdx: index("auth_user_roles_tenant_user_idx").on(
      table.tenantId,
      table.userId,
    ),
  }),
);

export const authServiceTokens = pgTable(
  "auth_service_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    name: varchar("name", { length: 160 }).notNull(),
    tokenHash: varchar("token_hash", { length: 160 }).notNull(),
    roles: jsonb("roles").$type<string[]>().notNull().default([]),
    permissions: jsonb("permissions").$type<string[]>().notNull().default([]),
    enabled: boolean("enabled").notNull().default(true),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tokenHashIdx: uniqueIndex("auth_service_tokens_hash_idx").on(table.tokenHash),
    tenantIdx: index("auth_service_tokens_tenant_idx").on(table.tenantId),
  }),
);

export const authAdminAuditEvents = pgTable(
  "auth_admin_audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    actorUserId: varchar("actor_user_id", { length: 160 }).notNull(),
    actorAuthType: varchar("actor_auth_type", { length: 40 }).notNull(),
    actorTokenId: varchar("actor_token_id", { length: 160 }),
    action: varchar("action", { length: 120 }).notNull(),
    targetType: varchar("target_type", { length: 80 }).notNull(),
    targetId: varchar("target_id", { length: 160 }).notNull(),
    reason: text("reason").notNull(),
    comment: text("comment"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantCreatedIdx: index("auth_admin_audit_events_tenant_created_idx").on(
      table.tenantId,
      table.createdAt,
    ),
    targetIdx: index("auth_admin_audit_events_target_idx").on(
      table.targetType,
      table.targetId,
    ),
  }),
);

export const authSessions = pgTable(
  "auth_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    tokenId: varchar("token_id", { length: 160 }).notNull(),
    status: varchar("status", { length: 40 }).notNull().default("active"),
    deviceLabel: varchar("device_label", { length: 160 }),
    ipAddress: varchar("ip_address", { length: 80 }),
    userAgent: text("user_agent"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokeReason: text("revoke_reason"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tokenIdx: uniqueIndex("auth_sessions_token_idx").on(table.tokenId),
    tenantUserStatusIdx: index("auth_sessions_tenant_user_status_idx").on(
      table.tenantId,
      table.userId,
      table.status,
    ),
  }),
);

export const authRefreshTokens = pgTable(
  "auth_refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    userId: uuid("user_id").notNull().references(() => users.id),
    sessionId: uuid("session_id").notNull().references(() => authSessions.id),
    tokenHash: varchar("token_hash", { length: 160 }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    rotatedAt: timestamp("rotated_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    revokeReason: text("revoke_reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tokenHashIdx: uniqueIndex("auth_refresh_tokens_hash_idx").on(table.tokenHash),
    tenantSessionIdx: index("auth_refresh_tokens_tenant_session_idx").on(
      table.tenantId,
      table.sessionId,
    ),
  }),
);

export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    userId: uuid("user_id").references(() => users.id),
    title: varchar("title", { length: 240 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index("sessions_tenant_idx").on(table.tenantId),
  }),
);

export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    sessionId: uuid("session_id").notNull().references(() => sessions.id),
    role: messageRoleEnum("role").notNull(),
    content: text("content").notNull(),
    toolCallId: varchar("tool_call_id", { length: 160 }),
    toolCalls: jsonb("tool_calls").$type<unknown[]>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantSessionIdx: index("messages_tenant_session_idx").on(
      table.tenantId,
      table.sessionId,
    ),
  }),
);

export const knowledgeDocuments = pgTable(
  "knowledge_documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    title: varchar("title", { length: 240 }).notNull(),
    content: text("content").notNull(),
    sourceType: varchar("source_type", { length: 80 }).notNull(),
    sourceUri: text("source_uri"),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index("knowledge_documents_tenant_idx").on(table.tenantId),
  }),
);

export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    documentId: uuid("document_id").notNull().references(() => knowledgeDocuments.id),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    tokenEstimate: integer("token_estimate").notNull(),
    qdrantPointId: varchar("qdrant_point_id", { length: 160 }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantDocumentIdx: index("knowledge_chunks_tenant_document_idx").on(
      table.tenantId,
      table.documentId,
    ),
  }),
);

export const indexingJobs = pgTable(
  "indexing_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    createdBy: uuid("created_by").references(() => users.id),
    type: varchar("type", { length: 80 }).notNull(),
    status: indexingJobStatusEnum("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    totalChunks: integer("total_chunks").notNull().default(0),
    processedChunks: integer("processed_chunks").notNull().default(0),
    failedChunks: integer("failed_chunks").notNull().default(0),
    error: text("error"),
    workerId: varchar("worker_id", { length: 160 }),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    startedAt: timestamp("started_at", { withTimezone: true }),
    heartbeatAt: timestamp("heartbeat_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
    deadLetteredAt: timestamp("dead_lettered_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantStatusIdx: index("indexing_jobs_tenant_status_idx").on(
      table.tenantId,
      table.status,
    ),
  }),
);

export const workflows = pgTable(
  "workflows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    createdBy: uuid("created_by").references(() => users.id),
    title: varchar("title", { length: 240 }).notNull(),
    goal: text("goal").notNull(),
    status: workflowStatusEnum("status").notNull().default("draft"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index("workflows_tenant_idx").on(table.tenantId),
  }),
);

export const workflowSteps = pgTable(
  "workflow_steps",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    workflowId: uuid("workflow_id").notNull().references(() => workflows.id),
    title: varchar("title", { length: 240 }).notNull(),
    description: text("description"),
    status: workflowStepStatusEnum("status").notNull().default("pending"),
    stepOrder: integer("step_order").notNull(),
    output: text("output"),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantWorkflowIdx: index("workflow_steps_tenant_workflow_idx").on(
      table.tenantId,
      table.workflowId,
    ),
  }),
);

export const evaluationCases = pgTable(
  "evaluation_cases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    createdBy: uuid("created_by").references(() => users.id),
    name: varchar("name", { length: 240 }).notNull(),
    type: evaluationCaseTypeEnum("type").notNull(),
    input: text("input").notNull(),
    expectedOutput: text("expected_output").notNull(),
    tags: jsonb("tags").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantIdx: index("evaluation_cases_tenant_idx").on(table.tenantId),
  }),
);

export const evaluationRuns = pgTable(
  "evaluation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    caseId: uuid("case_id").notNull().references(() => evaluationCases.id),
    status: varchar("status", { length: 40 }).notNull(),
    score: integer("score").notNull(),
    actualOutput: text("actual_output").notNull(),
    expectedOutput: text("expected_output").notNull(),
    evaluator: varchar("evaluator", { length: 80 }).notNull(),
    notes: jsonb("notes").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantCaseIdx: index("evaluation_runs_tenant_case_idx").on(
      table.tenantId,
      table.caseId,
    ),
  }),
);

export const traceEvents = pgTable(
  "trace_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    requestId: varchar("request_id", { length: 160 }).notNull(),
    type: varchar("type", { length: 120 }).notNull(),
    durationMs: integer("duration_ms"),
    attributes: jsonb("attributes").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    requestIdx: index("trace_events_request_idx").on(table.requestId),
    tenantIdx: index("trace_events_tenant_idx").on(table.tenantId),
  }),
);
