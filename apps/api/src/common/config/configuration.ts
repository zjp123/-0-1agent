import { registerAs } from "@nestjs/config";

function parseCsv(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (!value) {
    return fallback;
  }

  return ["1", "true", "yes", "on"].includes(value.toLowerCase());
}

export const configuration = registerAs("app", () => ({
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number.parseInt(process.env.PORT ?? "3000", 10),
  allowedOrigins: parseCsv(process.env.ALLOWED_ORIGINS),
  auth: {
    apiKey: process.env.API_KEY,
    jwtSecret: process.env.JWT_SECRET,
    jwtIssuer: process.env.JWT_ISSUER,
    jwtAudience: process.env.JWT_AUDIENCE,
    serviceToken: process.env.SERVICE_TOKEN,
    serviceTokenUserId:
      process.env.SERVICE_TOKEN_USER_ID ?? "service-token-user",
    serviceTokenTenantId:
      process.env.SERVICE_TOKEN_TENANT_ID ?? "default",
    serviceTokenRoles: parseCsv(process.env.SERVICE_TOKEN_ROLES),
    serviceTokenPermissions: parseCsv(process.env.SERVICE_TOKEN_PERMISSIONS),
  },
  database: {
    url:
      process.env.DATABASE_URL ??
      "postgresql://agent:agent_password@localhost:5432/agent_db",
    poolMax: parsePositiveInt(process.env.DATABASE_POOL_MAX, 10),
  },
  redis: {
    url: process.env.REDIS_URL ?? "redis://localhost:6379",
    indexingQueue:
      process.env.INDEXING_QUEUE_NAME ?? "enterprise-agent:indexing-jobs",
    indexingConsumerGroup:
      process.env.INDEXING_CONSUMER_GROUP ?? "enterprise-agent-indexers",
    workerEnabled: parseBoolean(process.env.INDEXING_WORKER_ENABLED, true),
    blockTimeoutSeconds: parsePositiveInt(
      process.env.INDEXING_WORKER_BLOCK_TIMEOUT_SECONDS ??
        process.env.INDEXING_WORKER_BRPOP_TIMEOUT_SECONDS,
      5,
    ),
    maxAttempts: parsePositiveInt(process.env.INDEXING_JOB_MAX_ATTEMPTS, 3),
    heartbeatIntervalMs: parsePositiveInt(
      process.env.INDEXING_WORKER_HEARTBEAT_INTERVAL_MS,
      10_000,
    ),
    workerId: process.env.INDEXING_WORKER_ID ?? crypto.randomUUID(),
    concurrency: parsePositiveInt(process.env.INDEXING_WORKER_CONCURRENCY, 1),
    leaseMs: parsePositiveInt(process.env.INDEXING_WORKER_LEASE_MS, 60_000),
    recoveryIntervalMs: parsePositiveInt(
      process.env.INDEXING_WORKER_RECOVERY_INTERVAL_MS,
      30_000,
    ),
    retryDelayBaseMs: parsePositiveInt(
      process.env.INDEXING_RETRY_DELAY_BASE_MS,
      5_000,
    ),
    retryDelayMaxMs: parsePositiveInt(
      process.env.INDEXING_RETRY_DELAY_MAX_MS,
      60_000,
    ),
    retryPromotionBatchSize: parsePositiveInt(
      process.env.INDEXING_RETRY_PROMOTION_BATCH_SIZE,
      50,
    ),
    pendingClaimMinIdleMs: parsePositiveInt(
      process.env.INDEXING_PENDING_CLAIM_MIN_IDLE_MS,
      60_000,
    ),
    pendingClaimBatchSize: parsePositiveInt(
      process.env.INDEXING_PENDING_CLAIM_BATCH_SIZE,
      10,
    ),
    alertPendingThreshold: parsePositiveInt(
      process.env.INDEXING_ALERT_PENDING_THRESHOLD,
      100,
    ),
    alertDelayedThreshold: parsePositiveInt(
      process.env.INDEXING_ALERT_DELAYED_THRESHOLD,
      100,
    ),
    alertDeadLetterThreshold: parsePositiveInt(
      process.env.INDEXING_ALERT_DEAD_LETTER_THRESHOLD,
      1,
    ),
    alertQueueErrorsThreshold: parsePositiveInt(
      process.env.INDEXING_ALERT_QUEUE_ERRORS_THRESHOLD,
      10,
    ),
    alertRecoveryFailuresThreshold: parsePositiveInt(
      process.env.INDEXING_ALERT_RECOVERY_FAILURES_THRESHOLD,
      1,
    ),
    alertStaleRecoveryMs: parsePositiveInt(
      process.env.INDEXING_ALERT_STALE_RECOVERY_MS,
      120_000,
    ),
    deadLetterAdminBatchSize: parsePositiveInt(
      process.env.INDEXING_DEAD_LETTER_ADMIN_BATCH_SIZE,
      100,
    ),
  },
  governance: {
    defaultWindowSeconds: parsePositiveInt(
      process.env.QUOTA_DEFAULT_WINDOW_SECONDS,
      60,
    ),
    defaultRequestLimit: parsePositiveInt(
      process.env.QUOTA_DEFAULT_REQUEST_LIMIT,
      120,
    ),
    defaultTokenLimit: parsePositiveInt(
      process.env.QUOTA_DEFAULT_TOKEN_LIMIT,
      200_000,
    ),
    rateLimitKeyPrefix:
      process.env.RATE_LIMIT_KEY_PREFIX ?? "enterprise-agent:rate-limit",
  },
  secrets: {
    masterKey:
      process.env.SECRETS_MASTER_KEY ??
      "development-only-secret-master-key-change-me",
    keyId: process.env.SECRETS_MASTER_KEY_ID ?? "local-dev",
  },
  qdrant: {
    url: process.env.QDRANT_URL ?? "http://localhost:6333",
    apiKey: process.env.QDRANT_API_KEY,
    enabled: parseBoolean(process.env.QDRANT_ENABLED, false),
    collection:
      process.env.QDRANT_COLLECTION ?? "enterprise_agent_knowledge_chunks",
    vectorSize: parsePositiveInt(
      process.env.QDRANT_VECTOR_SIZE ?? process.env.EMBEDDING_DIMENSION,
      384,
    ),
    distance: process.env.QDRANT_DISTANCE ?? "Cosine",
    timeoutMs: parsePositiveInt(process.env.QDRANT_TIMEOUT_MS, 10_000),
  },
  embedding: {
    provider: process.env.EMBEDDING_PROVIDER ?? "local-hash",
    model: process.env.EMBEDDING_MODEL ?? "text-embedding-3-small",
    baseUrl:
      process.env.EMBEDDING_BASE_URL ??
      process.env.LLM_BASE_URL ??
      "https://api.openai.com/v1",
    apiKey:
      process.env.EMBEDDING_API_KEY ??
      process.env.LLM_API_KEY ??
      process.env.OPENAI_API_KEY,
    dimensions: parsePositiveInt(process.env.EMBEDDING_DIMENSION, 384),
    timeoutMs: parsePositiveInt(process.env.EMBEDDING_TIMEOUT_MS, 30_000),
    maxRetries: parsePositiveInt(process.env.EMBEDDING_MAX_RETRIES, 2),
  },
  model: {
    provider: process.env.LLM_PROVIDER ?? "deepseek",
    defaultModel: process.env.LLM_DEFAULT_MODEL ?? "deepseek-chat",
    baseUrl: process.env.LLM_BASE_URL ?? "https://api.deepseek.com",
    apiKey: process.env.LLM_API_KEY ?? process.env.DEEPSEEK_API_KEY,
    timeoutMs: parsePositiveInt(process.env.LLM_TIMEOUT_MS, 30_000),
    maxRetries: parsePositiveInt(process.env.LLM_MAX_RETRIES, 2),
  },
}));
