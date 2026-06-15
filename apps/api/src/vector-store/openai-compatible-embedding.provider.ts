import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import OpenAI from "openai";

import type { EmbeddingProvider } from "./vector-store.types.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_RETRIES = 2;

@Injectable()
export class OpenAiCompatibleEmbeddingProvider implements EmbeddingProvider {
  private readonly client: OpenAI;
  private readonly model: string;
  private readonly dimensions: number;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.model = config.get<string>(
      "app.embedding.model",
      "text-embedding-3-small",
    );
    this.dimensions = config.get<number>("app.embedding.dimensions", 384);
    this.timeoutMs = config.get<number>(
      "app.embedding.timeoutMs",
      DEFAULT_TIMEOUT_MS,
    );
    this.maxRetries = config.get<number>(
      "app.embedding.maxRetries",
      DEFAULT_MAX_RETRIES,
    );

    this.client = new OpenAI({
      apiKey:
        config.get<string>("app.embedding.apiKey") ?? "missing-embedding-api-key",
      baseURL: config.get<string>("app.embedding.baseUrl"),
      timeout: this.timeoutMs,
      maxRetries: 0,
    });
  }

  getModel(): string {
    return this.model;
  }

  getDimension(): number {
    return this.dimensions;
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const response = await this.withRetry(() =>
      this.client.embeddings.create(
        {
          model: this.model,
          input: texts,
          dimensions: this.dimensions,
        },
        {
          timeout: this.timeoutMs,
          maxRetries: 0,
        },
      ),
    );

    const byIndex = new Map(
      response.data.map((item) => [item.index, item.embedding]),
    );
    return texts.map((_, index) => byIndex.get(index) ?? []);
  }

  private async withRetry<T>(operation: () => Promise<T>): Promise<T> {
    const maxAttempts = 1 + this.maxRetries;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (attempt >= maxAttempts || !this.isRetryable(error)) {
          break;
        }
        await this.wait(this.retryDelayMs(attempt));
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new Error("Embedding provider request failed");
  }

  private isRetryable(error: unknown): boolean {
    const statusCode = this.getStatusCode(error);
    if (statusCode !== undefined) {
      return (
        statusCode === 408 ||
        statusCode === 409 ||
        statusCode === 429 ||
        statusCode >= 500
      );
    }

    const name = error instanceof Error ? error.name.toLowerCase() : "";
    return name.includes("timeout") || name.includes("connection");
  }

  private getStatusCode(error: unknown): number | undefined {
    if (typeof error !== "object" || error === null || !("status" in error)) {
      return undefined;
    }

    const status = (error as { status?: unknown }).status;
    return typeof status === "number" ? status : undefined;
  }

  private retryDelayMs(attempt: number): number {
    return Math.min(250 * 2 ** (attempt - 1), 2_000);
  }

  private async wait(ms: number): Promise<void> {
    await new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }
}
