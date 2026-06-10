import { Module } from "@nestjs/common";

import { EMBEDDING_PROVIDER, VECTOR_STORE } from "./vector-store.constants.js";
import { EmbeddingProviderFactory } from "./embedding-provider.factory.js";
import { LocalHashEmbeddingProvider } from "./local-hash-embedding.provider.js";
import { OpenAiCompatibleEmbeddingProvider } from "./openai-compatible-embedding.provider.js";
import { QdrantVectorStore } from "./qdrant-vector.store.js";

@Module({
  providers: [
    EmbeddingProviderFactory,
    LocalHashEmbeddingProvider,
    OpenAiCompatibleEmbeddingProvider,
    QdrantVectorStore,
    {
      provide: EMBEDDING_PROVIDER,
      useFactory: (factory: EmbeddingProviderFactory) => factory.create(),
      inject: [EmbeddingProviderFactory],
    },
    {
      provide: VECTOR_STORE,
      useExisting: QdrantVectorStore,
    },
  ],
  exports: [EMBEDDING_PROVIDER, VECTOR_STORE],
})
export class VectorStoreModule {}
