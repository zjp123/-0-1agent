type RawEnv = Record<string, unknown>;

function asString(env: RawEnv, key: string): string | undefined {
  const value = env[key];
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function validateEnv(env: RawEnv): RawEnv {
  const port = asString(env, "PORT");
  if (port && !/^\d+$/.test(port)) {
    throw new Error("PORT must be a number");
  }

  for (const key of [
    "LLM_TIMEOUT_MS",
    "LLM_MAX_RETRIES",
    "QDRANT_VECTOR_SIZE",
    "QDRANT_TIMEOUT_MS",
    "EMBEDDING_DIMENSION",
    "EMBEDDING_TIMEOUT_MS",
    "EMBEDDING_MAX_RETRIES",
    "INDEXING_WORKER_BLOCK_TIMEOUT_SECONDS",
    "INDEXING_WORKER_BRPOP_TIMEOUT_SECONDS",
    "INDEXING_JOB_MAX_ATTEMPTS",
    "INDEXING_WORKER_HEARTBEAT_INTERVAL_MS",
    "INDEXING_WORKER_CONCURRENCY",
    "INDEXING_WORKER_LEASE_MS",
    "INDEXING_WORKER_RECOVERY_INTERVAL_MS",
    "INDEXING_RETRY_DELAY_BASE_MS",
    "INDEXING_RETRY_DELAY_MAX_MS",
    "INDEXING_RETRY_PROMOTION_BATCH_SIZE",
    "INDEXING_PENDING_CLAIM_MIN_IDLE_MS",
    "INDEXING_PENDING_CLAIM_BATCH_SIZE",
    "INDEXING_ALERT_PENDING_THRESHOLD",
    "INDEXING_ALERT_DELAYED_THRESHOLD",
    "INDEXING_ALERT_DEAD_LETTER_THRESHOLD",
    "INDEXING_ALERT_QUEUE_ERRORS_THRESHOLD",
    "INDEXING_ALERT_RECOVERY_FAILURES_THRESHOLD",
    "INDEXING_ALERT_STALE_RECOVERY_MS",
    "INDEXING_DEAD_LETTER_ADMIN_BATCH_SIZE",
  ]) {
    const value = asString(env, key);
    if (value && !/^\d+$/.test(value)) {
      throw new Error(`${key} must be a positive integer`);
    }
  }

  const embeddingProvider = asString(env, "EMBEDDING_PROVIDER") ?? "local-hash";
  if (!["local-hash", "openai-compatible"].includes(embeddingProvider)) {
    throw new Error(
      "EMBEDDING_PROVIDER must be local-hash or openai-compatible",
    );
  }

  const qdrantEnabled = asString(env, "QDRANT_ENABLED");
  if (
    qdrantEnabled &&
    !["1", "0", "true", "false", "yes", "no", "on", "off"].includes(
      qdrantEnabled.toLowerCase(),
    )
  ) {
    throw new Error("QDRANT_ENABLED must be a boolean");
  }

  const indexingWorkerEnabled = asString(env, "INDEXING_WORKER_ENABLED");
  if (
    indexingWorkerEnabled &&
    !["1", "0", "true", "false", "yes", "no", "on", "off"].includes(
      indexingWorkerEnabled.toLowerCase(),
    )
  ) {
    throw new Error("INDEXING_WORKER_ENABLED must be a boolean");
  }

  const nodeEnv = asString(env, "NODE_ENV") ?? "development";
  const apiKey = asString(env, "LLM_API_KEY") ?? asString(env, "DEEPSEEK_API_KEY");

  if (nodeEnv === "production" && !apiKey) {
    throw new Error("LLM_API_KEY is required in production");
  }

  if (nodeEnv === "production" && !asString(env, "API_KEY")) {
    throw new Error("API_KEY is required in production");
  }

  const embeddingApiKey =
    asString(env, "EMBEDDING_API_KEY") ??
    asString(env, "LLM_API_KEY") ??
    asString(env, "OPENAI_API_KEY");
  if (
    nodeEnv === "production" &&
    embeddingProvider === "openai-compatible" &&
    !embeddingApiKey
  ) {
    throw new Error(
      "EMBEDDING_API_KEY is required in production when EMBEDDING_PROVIDER=openai-compatible",
    );
  }

  return env;
}
