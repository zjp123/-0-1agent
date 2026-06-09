import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { EmbeddingProvider } from "./vector-store.types.js";

@Injectable()
export class LocalHashEmbeddingProvider implements EmbeddingProvider {
  private readonly dimension: number;

  constructor(config: ConfigService) {
    this.dimension = config.get<number>("app.qdrant.vectorSize", 384);
  }

  getModel(): string {
    return "local-hash-embedding";
  }

  getDimension(): number {
    return this.dimension;
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    return texts.map((text) => this.embed(text));
  }

  private embed(text: string): number[] {
    const vector = new Array<number>(this.dimension).fill(0);
    const tokens = this.tokenize(text);

    for (const token of tokens) {
      const hash = this.hash(token);
      const index = hash % this.dimension;
      vector[index] = (vector[index] ?? 0) + 1;
    }

    return this.normalize(vector);
  }

  private tokenize(text: string): string[] {
    const normalized = text.toLowerCase();
    const ascii = normalized.match(/[a-z0-9_]+/g) ?? [];
    const cjk = normalized.match(/[\u4e00-\u9fff]/g) ?? [];
    return [...ascii, ...cjk];
  }

  private hash(value: string): number {
    let hash = 2_166_136_261;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 16_777_619);
    }
    return hash >>> 0;
  }

  private normalize(vector: number[]): number[] {
    const magnitude = Math.sqrt(
      vector.reduce((sum, value) => sum + value * value, 0),
    );
    if (magnitude === 0) {
      return vector;
    }
    return vector.map((value) => value / magnitude);
  }
}
