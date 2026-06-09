import { Module } from "@nestjs/common";

import { EMBEDDING_PROVIDER, VECTOR_STORE } from "./vector-store.constants.js";
import { LocalHashEmbeddingProvider } from "./local-hash-embedding.provider.js";
import { QdrantVectorStore } from "./qdrant-vector.store.js";

@Module({
  providers: [
    LocalHashEmbeddingProvider,
    QdrantVectorStore,
    {
      provide: EMBEDDING_PROVIDER,
      useExisting: LocalHashEmbeddingProvider,
    },
    {
      provide: VECTOR_STORE,
      useExisting: QdrantVectorStore,
    },
  ],
  exports: [EMBEDDING_PROVIDER, VECTOR_STORE],
})
export class VectorStoreModule {}
