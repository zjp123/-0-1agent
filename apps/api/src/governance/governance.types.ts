export type QuotaAction =
  | "agent.run"
  | "tool.execute"
  | "knowledge.ingest"
  | "knowledge.retrieve"
  | "knowledge.reindex";

export type QuotaSubjectType = "global" | "tenant" | "user";

export type QuotaPolicy = {
  id: string;
  tenantId?: string;
  name: string;
  action: QuotaAction;
  subjectType: QuotaSubjectType;
  subjectId?: string;
  windowSeconds: number;
  requestLimit?: number;
  tokenLimit?: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
};

export type QuotaCheckInput = {
  tenantId: string;
  userId: string;
  action: QuotaAction;
  requestCost?: number;
  tokenCost?: number;
  metadata?: Record<string, unknown>;
};

export type QuotaCheckResult = {
  allowed: boolean;
  action: QuotaAction;
  decisions: QuotaDecision[];
};

export type QuotaDecision = {
  policyId: string;
  subjectType: QuotaSubjectType;
  subjectId?: string;
  unit: "requests" | "tokens";
  amount: number;
  limit: number;
  remaining: number;
  resetAt: string;
  windowKey: string;
  allowed: boolean;
};

export type QuotaUsageEvent = {
  id: string;
  tenantId?: string;
  userId?: string;
  action: QuotaAction;
  subjectType: QuotaSubjectType;
  subjectId?: string;
  unit: string;
  amount: number;
  limit?: number;
  windowKey?: string;
  allowed: boolean;
  reason: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};
