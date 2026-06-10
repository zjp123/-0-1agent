export type KnowledgeSourceType =
  | "manual"
  | "upload"
  | "wiki"
  | "webpage"
  | "api";

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

export type IngestKnowledgeInput = {
  tenantId: string;
  title: string;
  content: string;
  sourceType?: KnowledgeSourceType;
  sourceUri?: string;
  tags?: string[];
};

export type RetrieveKnowledgeInput = {
  tenantId: string;
  userId?: string;
  requestId?: string;
  query: string;
  limit?: number;
  tags?: string[];
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

export type KnowledgeReindexResult = {
  tenantId: string;
  status: "completed" | "skipped";
  chunkCount: number;
  vectorStoreEnabled: boolean;
  collection: string;
  embeddingModel: string;
  dimensions: number;
};

export type IndexingJobStatus = "pending" | "running" | "completed" | "failed";

export type IndexingJobType = "tenant_reindex";

export type IndexingJob = {
  id: string;
  tenantId: string;
  createdBy?: string;
  type: IndexingJobType;
  status: IndexingJobStatus;
  totalChunks: number;
  processedChunks: number;
  failedChunks: number;
  error?: string;
  metadata: Record<string, unknown>;
  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
};

export type RunIndexingJobResult = {
  status: "completed" | "failed" | "skipped";
  processedChunks: number;
  totalChunks: number;
  error?: string;
};

export type CreateIndexingJobInput = {
  tenantId: string;
  userId: string;
  type: IndexingJobType;
  metadata: Record<string, unknown>;
};

export interface IndexingJobStore {
  create(input: CreateIndexingJobInput): Promise<IndexingJob>;
  get(tenantId: string, jobId: string): Promise<IndexingJob | undefined>;
  list(tenantId: string): Promise<IndexingJob[]>;
  markRunning(tenantId: string, jobId: string, totalChunks: number): Promise<void>;
  markProgress(
    tenantId: string,
    jobId: string,
    processedChunks: number,
  ): Promise<void>;
  markCompleted(
    tenantId: string,
    jobId: string,
    processedChunks: number,
    metadata: Record<string, unknown>,
  ): Promise<void>;
  markFailed(
    tenantId: string,
    jobId: string,
    processedChunks: number,
    failedChunks: number,
    error: string,
    metadata: Record<string, unknown>,
  ): Promise<void>;
}

export interface KnowledgeStore {
  saveDocument(result: KnowledgeIngestResult): Promise<void>;
  listDocuments(tenantId: string): Promise<KnowledgeDocument[]>;
  listChunks(tenantId: string): Promise<KnowledgeChunk[]>;
  search(input: RetrieveKnowledgeInput): Promise<KnowledgeSearchResult[]>;
  findChunksByIds(tenantId: string, chunkIds: string[]): Promise<KnowledgeChunk[]>;
}
