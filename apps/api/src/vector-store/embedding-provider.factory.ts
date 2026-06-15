import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { EMBEDDING_PROVIDER } from "./vector-store.constants.js";
import { LocalHashEmbeddingProvider } from "./local-hash-embedding.provider.js";
import { OpenAiCompatibleEmbeddingProvider } from "./openai-compatible-embedding.provider.js";
import type { EmbeddingProvider } from "./vector-store.types.js";

@Injectable()
export class EmbeddingProviderFactory {
  constructor(
    @Inject(ConfigService)
    private readonly config: ConfigService,
    @Inject(LocalHashEmbeddingProvider)
    private readonly localHash: LocalHashEmbeddingProvider,
    @Inject(OpenAiCompatibleEmbeddingProvider)
    private readonly openAiCompatible: OpenAiCompatibleEmbeddingProvider,
  ) {}

  create(): EmbeddingProvider {
    const provider = this.config.get<string>(
      "app.embedding.provider",
      "local-hash",
    );
    if (provider === "openai-compatible") {
      return this.openAiCompatible;
    }
    return this.localHash;
  }
}
