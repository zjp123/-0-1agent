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

  for (const key of ["LLM_TIMEOUT_MS", "LLM_MAX_RETRIES"]) {
    const value = asString(env, key);
    if (value && !/^\d+$/.test(value)) {
      throw new Error(`${key} must be a positive integer`);
    }
  }

  const nodeEnv = asString(env, "NODE_ENV") ?? "development";
  const apiKey = asString(env, "LLM_API_KEY") ?? asString(env, "DEEPSEEK_API_KEY");

  if (nodeEnv === "production" && !apiKey) {
    throw new Error("LLM_API_KEY is required in production");
  }

  return env;
}
