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

export type EvaluationRunStatus = "passed" | "failed";

export type EvaluationRun = {
  id: string;
  tenantId: string;
  caseId: string;
  status: EvaluationRunStatus;
  score: number;
  actualOutput: string;
  expectedOutput: string;
  evaluator: "string_contains";
  notes: string[];
  createdAt: string;
};

export type CreateEvaluationCaseInput = {
  tenantId: string;
  userId: string;
  name: string;
  type: EvaluationCaseType;
  input: string;
  expectedOutput: string;
  tags?: string[];
};

export type RunEvaluationInput = {
  tenantId: string;
  caseId: string;
  actualOutput: string;
  notes?: string[];
};

export interface EvaluationStore {
  createCase(input: CreateEvaluationCaseInput): Promise<EvaluationCase>;
  listCases(tenantId: string): Promise<EvaluationCase[]>;
  getCase(tenantId: string, caseId: string): Promise<EvaluationCase | undefined>;
  saveRun(run: EvaluationRun): Promise<void>;
  listRuns(tenantId: string, caseId?: string): Promise<EvaluationRun[]>;
}
