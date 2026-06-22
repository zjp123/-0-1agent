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

export const mcpServerStatusEnum = pgEnum("mcp_server_status", [
  "pending_approval",
  "active",
  "disabled",
  "error",
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
    email: varchar("email", { length: 320 }),
    passwordHash: text("password_hash"),
    emailVerified: boolean("email_verified").notNull().default(false),
    defaultTenantId: uuid("default_tenant_id").references(() => tenants.id),
    displayName: varchar("display_name", { length: 160 }).notNull(),
    roles: jsonb("roles").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantExternalIdx: index("users_tenant_external_idx").on(
      table.tenantId,
      table.externalId,
    ),
    emailIdx: uniqueIndex("users_email_idx").on(table.email),
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

export const securityAnomalyEvents = pgTable(
  "security_anomaly_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    severity: varchar("severity", { length: 40 }).notNull(),
    category: varchar("category", { length: 80 }).notNull(),
    action: varchar("action", { length: 120 }).notNull(),
    actorUserId: varchar("actor_user_id", { length: 160 }),
    actorAuthType: varchar("actor_auth_type", { length: 40 }),
    targetType: varchar("target_type", { length: 80 }),
    targetId: varchar("target_id", { length: 160 }),
    message: text("message").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    acknowledged: boolean("acknowledged").notNull().default(false),
    acknowledgedBy: varchar("acknowledged_by", { length: 160 }),
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantCreatedIdx: index("security_anomaly_events_tenant_created_idx").on(
      table.tenantId,
      table.createdAt,
    ),
    tenantSeverityIdx: index("security_anomaly_events_tenant_severity_idx").on(
      table.tenantId,
      table.severity,
    ),
    tenantCategoryIdx: index("security_anomaly_events_tenant_category_idx").on(
      table.tenantId,
      table.category,
    ),
    tenantAcknowledgedIdx: index("security_anomaly_events_tenant_acknowledged_idx").on(
      table.tenantId,
      table.acknowledged,
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

export const quotaPolicies = pgTable(
  "quota_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    name: varchar("name", { length: 160 }).notNull(),
    action: varchar("action", { length: 120 }).notNull(),
    subjectType: varchar("subject_type", { length: 40 }).notNull(),
    subjectId: varchar("subject_id", { length: 160 }),
    windowSeconds: integer("window_seconds").notNull(),
    requestLimit: integer("request_limit"),
    tokenLimit: integer("token_limit"),
    enabled: boolean("enabled").notNull().default(true),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantActionIdx: index("quota_policies_tenant_action_idx").on(
      table.tenantId,
      table.action,
    ),
    subjectIdx: index("quota_policies_subject_idx").on(
      table.subjectType,
      table.subjectId,
    ),
  }),
);

export const quotaUsageEvents = pgTable(
  "quota_usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").references(() => tenants.id),
    userId: varchar("user_id", { length: 160 }),
    action: varchar("action", { length: 120 }).notNull(),
    subjectType: varchar("subject_type", { length: 40 }).notNull(),
    subjectId: varchar("subject_id", { length: 160 }),
    unit: varchar("unit", { length: 40 }).notNull(),
    amount: integer("amount").notNull(),
    limit: integer("limit"),
    windowKey: varchar("window_key", { length: 240 }),
    allowed: boolean("allowed").notNull(),
    reason: varchar("reason", { length: 160 }).notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantCreatedIdx: index("quota_usage_events_tenant_created_idx").on(
      table.tenantId,
      table.createdAt,
    ),
    actionCreatedIdx: index("quota_usage_events_action_created_idx").on(
      table.action,
      table.createdAt,
    ),
  }),
);

export const secretValues = pgTable(
  "secret_values",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    name: varchar("name", { length: 160 }).notNull(),
    provider: varchar("provider", { length: 80 }).notNull(),
    purpose: varchar("purpose", { length: 120 }).notNull(),
    encryptedValue: text("encrypted_value").notNull(),
    valueHash: varchar("value_hash", { length: 160 }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    rotationRequired: boolean("rotation_required").notNull().default(false),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    lastRotatedAt: timestamp("last_rotated_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantNameIdx: uniqueIndex("secret_values_tenant_name_idx").on(
      table.tenantId,
      table.name,
    ),
    providerPurposeIdx: index("secret_values_provider_purpose_idx").on(
      table.provider,
      table.purpose,
    ),
  }),
);

export const providerCredentials = pgTable(
  "provider_credentials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    provider: varchar("provider", { length: 80 }).notNull(),
    credentialType: varchar("credential_type", { length: 80 }).notNull(),
    secretValueId: uuid("secret_value_id").references(() => secretValues.id),
    alias: varchar("alias", { length: 160 }).notNull(),
    enabled: boolean("enabled").notNull().default(true),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantProviderAliasIdx: uniqueIndex("provider_credentials_tenant_provider_alias_idx").on(
      table.tenantId,
      table.provider,
      table.alias,
    ),
    providerTypeIdx: index("provider_credentials_provider_type_idx").on(
      table.provider,
      table.credentialType,
    ),
  }),
);

export const approvalPolicies = pgTable(
  "approval_policies",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    name: varchar("name", { length: 160 }).notNull(),
    action: varchar("action", { length: 120 }).notNull(),
    resourceType: varchar("resource_type", { length: 80 }).notNull(),
    requiredApprovals: integer("required_approvals").notNull().default(1),
    enabled: boolean("enabled").notNull().default(true),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantActionIdx: index("approval_policies_tenant_action_idx").on(
      table.tenantId,
      table.action,
      table.resourceType,
    ),
  }),
);

export const approvalRequests = pgTable(
  "approval_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    policyId: uuid("policy_id").references(() => approvalPolicies.id),
    requestedBy: varchar("requested_by", { length: 160 }).notNull(),
    action: varchar("action", { length: 120 }).notNull(),
    resourceType: varchar("resource_type", { length: 80 }).notNull(),
    resourceId: varchar("resource_id", { length: 160 }),
    status: varchar("status", { length: 40 }).notNull().default("pending"),
    requiredApprovals: integer("required_approvals").notNull().default(1),
    approvals: jsonb("approvals").$type<Array<Record<string, unknown>>>().notNull().default([]),
    reason: text("reason").notNull(),
    rejectionReason: text("rejection_reason"),
    payload: jsonb("payload").$type<Record<string, unknown>>().notNull().default({}),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantStatusIdx: index("approval_requests_tenant_status_idx").on(
      table.tenantId,
      table.status,
    ),
    resourceIdx: index("approval_requests_resource_idx").on(
      table.resourceType,
      table.resourceId,
    ),
  }),
);

export const orchestrationParticipants = pgTable(
  "orchestration_participants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    name: varchar("name", { length: 160 }).notNull(),
    role: varchar("role", { length: 80 }).notNull(),
    systemPrompt: text("system_prompt"),
    model: varchar("model", { length: 160 }),
    enabled: boolean("enabled").notNull().default(true),
    maxSteps: integer("max_steps").notNull().default(4),
    maxDurationMs: integer("max_duration_ms").notNull().default(60_000),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantRoleIdx: index("orchestration_participants_tenant_role_idx").on(
      table.tenantId,
      table.role,
    ),
    tenantEnabledIdx: index("orchestration_participants_tenant_enabled_idx").on(
      table.tenantId,
      table.enabled,
    ),
  }),
);

export const orchestrationRuns = pgTable(
  "orchestration_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    createdBy: varchar("created_by", { length: 160 }).notNull(),
    requestId: varchar("request_id", { length: 160 }).notNull(),
    objective: text("objective").notNull(),
    strategy: varchar("strategy", { length: 80 }).notNull().default("sequential_handoff"),
    status: varchar("status", { length: 40 }).notNull().default("pending"),
    participantIds: jsonb("participant_ids").$type<string[]>().notNull().default([]),
    finalAnswer: text("final_answer"),
    error: text("error"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantStatusIdx: index("orchestration_runs_tenant_status_idx").on(
      table.tenantId,
      table.status,
    ),
    requestIdx: index("orchestration_runs_request_idx").on(table.requestId),
  }),
);

export const orchestrationHandoffs = pgTable(
  "orchestration_handoffs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    runId: uuid("run_id").notNull().references(() => orchestrationRuns.id),
    fromParticipantId: uuid("from_participant_id").references(
      () => orchestrationParticipants.id,
    ),
    toParticipantId: uuid("to_participant_id").notNull().references(
      () => orchestrationParticipants.id,
    ),
    stepOrder: integer("step_order").notNull(),
    status: varchar("status", { length: 40 }).notNull().default("pending"),
    input: text("input").notNull(),
    output: text("output"),
    error: text("error"),
    agentRequestId: varchar("agent_request_id", { length: 160 }),
    usage: jsonb("usage").$type<Record<string, number>>().notNull().default({}),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantRunIdx: index("orchestration_handoffs_tenant_run_idx").on(
      table.tenantId,
      table.runId,
      table.stepOrder,
    ),
    participantStatusIdx: index("orchestration_handoffs_participant_status_idx").on(
      table.toParticipantId,
      table.status,
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

export const mcpServers = pgTable(
  "mcp_servers",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    name: varchar("name", { length: 160 }).notNull(),
    transport: varchar("transport", { length: 40 }).notNull().default("stdio"),
    command: varchar("command", { length: 240 }).notNull(),
    url: text("url"),
    args: jsonb("args").$type<string[]>().notNull().default([]),
    env: jsonb("env").$type<Record<string, string>>().notNull().default({}),
    headers: jsonb("headers").$type<Record<string, string>>().notNull().default({}),
    authType: varchar("auth_type", { length: 40 }).notNull().default("none"),
    authSecretRef: varchar("auth_secret_ref", { length: 240 }),
    enabled: boolean("enabled").notNull().default(false),
    status: mcpServerStatusEnum("status").notNull().default("pending_approval"),
    riskLevel: varchar("risk_level", { length: 40 }).notNull().default("medium"),
    requiredPermissions: jsonb("required_permissions").$type<string[]>().notNull().default(["tools:execute"]),
    toolNamePrefix: varchar("tool_name_prefix", { length: 120 }),
    timeoutMs: integer("timeout_ms"),
    commandPolicy: varchar("command_policy", { length: 80 }).notNull().default("allowlist"),
    approvalRequired: boolean("approval_required").notNull().default(false),
    lastLoadedAt: timestamp("last_loaded_at", { withTimezone: true }),
    lastError: text("last_error"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdBy: varchar("created_by", { length: 160 }).notNull(),
    approvedBy: varchar("approved_by", { length: 160 }),
    approvedAt: timestamp("approved_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantNameIdx: uniqueIndex("mcp_servers_tenant_name_idx").on(
      table.tenantId,
      table.name,
    ),
    tenantStatusIdx: index("mcp_servers_tenant_status_idx").on(
      table.tenantId,
      table.status,
    ),
    tenantEnabledIdx: index("mcp_servers_tenant_enabled_idx").on(
      table.tenantId,
      table.enabled,
    ),
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

export const workflowSchedules = pgTable(
  "workflow_schedules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    workflowId: uuid("workflow_id").notNull().references(() => workflows.id),
    createdBy: uuid("created_by").references(() => users.id),
    name: varchar("name", { length: 160 }).notNull(),
    scheduleType: varchar("schedule_type", { length: 40 }).notNull(),
    cronExpression: varchar("cron_expression", { length: 120 }),
    intervalSeconds: integer("interval_seconds"),
    timezone: varchar("timezone", { length: 80 }).notNull().default("UTC"),
    enabled: boolean("enabled").notNull().default(true),
    maxConcurrentRuns: integer("max_concurrent_runs").notNull().default(1),
    nextRunAt: timestamp("next_run_at", { withTimezone: true }).notNull(),
    lastRunAt: timestamp("last_run_at", { withTimezone: true }),
    leaseOwner: varchar("lease_owner", { length: 160 }),
    leaseUntil: timestamp("lease_until", { withTimezone: true }),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantNextRunIdx: index("workflow_schedules_tenant_next_run_idx").on(
      table.tenantId,
      table.enabled,
      table.nextRunAt,
    ),
    workflowIdx: index("workflow_schedules_workflow_idx").on(
      table.tenantId,
      table.workflowId,
    ),
    leaseIdx: index("workflow_schedules_lease_idx").on(table.leaseUntil),
  }),
);

export const workflowScheduleRuns = pgTable(
  "workflow_schedule_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id").notNull().references(() => tenants.id),
    scheduleId: uuid("schedule_id").notNull().references(() => workflowSchedules.id),
    workflowId: uuid("workflow_id").notNull().references(() => workflows.id),
    triggeredBy: varchar("triggered_by", { length: 80 }).notNull(),
    workerId: varchar("worker_id", { length: 160 }),
    status: varchar("status", { length: 40 }).notNull().default("pending"),
    dueAt: timestamp("due_at", { withTimezone: true }).notNull(),
    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),
    error: text("error"),
    output: text("output"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tenantScheduleIdx: index("workflow_schedule_runs_tenant_schedule_idx").on(
      table.tenantId,
      table.scheduleId,
      table.createdAt,
    ),
    statusIdx: index("workflow_schedule_runs_status_idx").on(
      table.tenantId,
      table.status,
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
