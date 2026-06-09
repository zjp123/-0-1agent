import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
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
