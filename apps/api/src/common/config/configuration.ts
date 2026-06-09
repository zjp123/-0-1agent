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

export const configuration = registerAs("app", () => ({
  nodeEnv: process.env.NODE_ENV ?? "development",
  port: Number.parseInt(process.env.PORT ?? "3000", 10),
  allowedOrigins: parseCsv(process.env.ALLOWED_ORIGINS),
  model: {
    provider: process.env.LLM_PROVIDER ?? "deepseek",
    defaultModel: process.env.LLM_DEFAULT_MODEL ?? "deepseek-chat",
    baseUrl: process.env.LLM_BASE_URL ?? "https://api.deepseek.com",
    apiKey: process.env.LLM_API_KEY ?? process.env.DEEPSEEK_API_KEY,
    timeoutMs: parsePositiveInt(process.env.LLM_TIMEOUT_MS, 30_000),
    maxRetries: parsePositiveInt(process.env.LLM_MAX_RETRIES, 2),
  },
}));
