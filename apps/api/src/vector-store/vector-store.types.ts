export type VectorStoreHealth =
  | {
      status: "disabled";
      collection: string;
    }
  | {
      status: "ok" | "error";
      collection: string;
      message?: string;
    };

export type VectorPoint = {
  id: string;
  vector: number[];
  payload: Record<string, unknown>;
};

export type VectorSearchInput = {
  vector: number[];
  limit: number;
  filter?: Record<string, unknown>;
};

export type VectorSearchResult = {
  id: string;
  score: number;
  payload: Record<string, unknown>;
};

export interface EmbeddingProvider {
  getModel(): string;
  getDimension(): number;
  embedMany(texts: string[]): Promise<number[][]>;
}

export interface VectorStore {
  isEnabled(): boolean;
  getCollectionName(): string;
  health(): Promise<VectorStoreHealth>;
  ensureCollection(): Promise<void>;
  ensurePayloadIndexes(): Promise<void>;
  upsert(points: VectorPoint[]): Promise<void>;
  search(input: VectorSearchInput): Promise<VectorSearchResult[]>;
  delete(pointIds: string[]): Promise<void>;
}
