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

export type IndexingJobStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export type IndexingJobType = "tenant_reindex";

export type IndexingJob = {
  id: string;
  tenantId: string;
  createdBy?: string;
  type: IndexingJobType;
  status: IndexingJobStatus;
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

export type RunIndexingJobResult = {
  status: "completed" | "failed" | "skipped";
  processedChunks: number;
  totalChunks: number;
  error?: string;
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

export type IndexingWorkerMetrics = IndexingWorkerStatus & {
  uptimeMs: number;
  recoveryRunning: boolean;
  lastRecoveryAt?: string;
  lastRecoveryError?: string;
  counters: {
    jobsStarted: number;
    jobsCompleted: number;
    jobsFailed: number;
    jobsSkipped: number;
    jobsDeadLettered: number;
    jobsRetried: number;
    messagesDequeued: number;
    messagesAcked: number;
    delayedPromoted: number;
    pendingClaimed: number;
    expiredJobsRequeued: number;
    recoveryRuns: number;
    recoveryFailures: number;
    queueErrors: number;
  };
};

export type CreateIndexingJobInput = {
  tenantId: string;
  userId: string;
  type: IndexingJobType;
  maxAttempts: number;
  metadata: Record<string, unknown>;
};

export interface IndexingJobStore {
  create(input: CreateIndexingJobInput): Promise<IndexingJob>;
  get(tenantId: string, jobId: string): Promise<IndexingJob | undefined>;
  list(tenantId: string): Promise<IndexingJob[]>;
  findExpiredRunningJobs(now: Date): Promise<IndexingJob[]>;
  acquireLease(input: {
    tenantId: string;
    jobId: string;
    workerId: string;
    leaseUntil: Date;
  }): Promise<IndexingJob | undefined>;
  releaseLease(tenantId: string, jobId: string): Promise<void>;
  incrementAttempts(tenantId: string, jobId: string): Promise<IndexingJob | undefined>;
  markRunning(tenantId: string, jobId: string, totalChunks: number): Promise<void>;
  heartbeat(input: {
    tenantId: string;
    jobId: string;
    workerId: string;
    leaseUntil: Date;
  }): Promise<void>;
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
  markDeadLettered(
    tenantId: string,
    jobId: string,
    error: string,
    metadata: Record<string, unknown>,
  ): Promise<void>;
  replayDeadLetter(tenantId: string, jobId: string): Promise<IndexingJob | undefined>;
  cancel(tenantId: string, jobId: string): Promise<IndexingJob | undefined>;
}

export interface KnowledgeStore {
  saveDocument(result: KnowledgeIngestResult): Promise<void>;
  listDocuments(tenantId: string): Promise<KnowledgeDocument[]>;
  listChunks(tenantId: string): Promise<KnowledgeChunk[]>;
  search(input: RetrieveKnowledgeInput): Promise<KnowledgeSearchResult[]>;
  findChunksByIds(tenantId: string, chunkIds: string[]): Promise<KnowledgeChunk[]>;
}
