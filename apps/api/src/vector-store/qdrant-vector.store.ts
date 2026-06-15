import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type {
  VectorPoint,
  VectorSearchInput,
  VectorSearchResult,
  VectorStore,
  VectorStoreHealth,
} from "./vector-store.types.js";

type QdrantSearchResponse = {
  result?: Array<{
    id: string | number;
    score?: number;
    payload?: Record<string, unknown>;
  }>;
};

const PAYLOAD_INDEXES = [
  "tenantId",
  "tags",
  "sourceType",
  "documentId",
  "chunkId",
] as const;

@Injectable()
export class QdrantVectorStore implements VectorStore {
  private readonly enabled: boolean;
  private readonly url: string;
  private readonly apiKey: string | undefined;
  private readonly collection: string;
  private readonly vectorSize: number;
  private readonly distance: string;
  private readonly timeoutMs: number;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.enabled = config.get<boolean>("app.qdrant.enabled", false);
    this.url = config.get<string>("app.qdrant.url", "http://localhost:6333");
    this.apiKey = config.get<string>("app.qdrant.apiKey");
    this.collection = config.get<string>(
      "app.qdrant.collection",
      "enterprise_agent_knowledge_chunks",
    );
    this.vectorSize = config.get<number>("app.qdrant.vectorSize", 384);
    this.distance = config.get<string>("app.qdrant.distance", "Cosine");
    this.timeoutMs = config.get<number>("app.qdrant.timeoutMs", 10_000);
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  getCollectionName(): string {
    return this.collection;
  }

  async health(): Promise<VectorStoreHealth> {
    if (!this.enabled) {
      return {
        status: "disabled",
        collection: this.collection,
      };
    }

    try {
      const response = await this.requestRaw("/healthz", { method: "GET" });
      if (!response.ok) {
        throw await this.toError(response);
      }
      return {
        status: "ok",
        collection: this.collection,
      };
    } catch (error) {
      return {
        status: "error",
        collection: this.collection,
        message: error instanceof Error ? error.message : "Unknown Qdrant error",
      };
    }
  }

  async ensureCollection(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const encoded = encodeURIComponent(this.collection);
    const exists = await this.collectionExists(encoded);
    if (exists) {
      return;
    }

    await this.request(`/collections/${encoded}`, {
      method: "PUT",
      body: {
        vectors: {
          size: this.vectorSize,
          distance: this.distance,
        },
      },
    });
    await this.ensurePayloadIndexes();
  }

  async ensurePayloadIndexes(): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const encoded = encodeURIComponent(this.collection);
    for (const fieldName of PAYLOAD_INDEXES) {
      await this.createPayloadIndex(encoded, fieldName);
    }
  }

  async upsert(points: VectorPoint[]): Promise<void> {
    if (!this.enabled || points.length === 0) {
      return;
    }

    await this.ensureCollection();
    await this.ensurePayloadIndexes();
    await this.request(`/collections/${encodeURIComponent(this.collection)}/points?wait=true`, {
      method: "PUT",
      body: {
        points,
      },
    });
  }

  async search(input: VectorSearchInput): Promise<VectorSearchResult[]> {
    if (!this.enabled) {
      return [];
    }

    await this.ensureCollection();
    const body: Record<string, unknown> = {
      vector: input.vector,
      limit: input.limit,
      with_payload: true,
    };
    if (input.filter) {
      body.filter = input.filter;
    }

    const response = await this.request<QdrantSearchResponse>(
      `/collections/${encodeURIComponent(this.collection)}/points/search`,
      {
        method: "POST",
        body,
      },
    );

    return (response.result ?? []).map((result) => ({
      id: String(result.id),
      score: result.score ?? 0,
      payload: result.payload ?? {},
    }));
  }

  private async collectionExists(encodedCollection: string): Promise<boolean> {
    const response = await this.requestRaw(`/collections/${encodedCollection}`, {
      method: "GET",
    });
    if (response.status === 404) {
      return false;
    }
    if (!response.ok) {
      throw await this.toError(response);
    }
    return true;
  }

  private async createPayloadIndex(
    encodedCollection: string,
    fieldName: string,
  ): Promise<void> {
    const response = await this.requestRaw(
      `/collections/${encodedCollection}/index`,
      {
        method: "PUT",
        body: {
          field_name: fieldName,
          field_schema: "keyword",
        },
      },
    );

    if (response.ok || response.status === 409) {
      return;
    }

    const error = await this.toError(response);
    if (error.message.toLowerCase().includes("already exists")) {
      return;
    }
    throw error;
  }

  private async request<T>(
    path: string,
    init: {
      method: string;
      body?: unknown;
    },
  ): Promise<T> {
    const response = await this.requestRaw(path, init);
    if (!response.ok) {
      throw await this.toError(response);
    }

    if (response.status === 204) {
      return {} as T;
    }
    return (await response.json()) as T;
  }

  private async requestRaw(
    path: string,
    init: {
      method: string;
      body?: unknown;
    },
  ): Promise<Response> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["api-key"] = this.apiKey;
    }

    try {
      const requestInit: RequestInit = {
        method: init.method,
        headers,
        signal: controller.signal,
      };
      if (init.body) {
        requestInit.body = JSON.stringify(init.body);
      }

      return await fetch(`${this.url}${path}`, requestInit);
    } finally {
      clearTimeout(timeout);
    }
  }

  private async toError(response: Response): Promise<Error> {
    const body = await response.text();
    return new Error(
      `Qdrant request failed: ${response.status} ${response.statusText} ${body}`,
    );
  }
}
