import { Module } from "@nestjs/common";

import { DatabaseModule } from "../db/database.module.js";
import { ObservabilityModule } from "../observability/observability.module.js";
import { VectorStoreModule } from "../vector-store/vector-store.module.js";
import { KNOWLEDGE_STORE } from "./knowledge.constants.js";
import { KnowledgeChunkerService } from "./knowledge-chunker.service.js";
import { PostgresKnowledgeStore } from "./postgres-knowledge.store.js";
import { RagController } from "./rag.controller.js";
import { RagService } from "./rag.service.js";

@Module({
  imports: [DatabaseModule, VectorStoreModule, ObservabilityModule],
  controllers: [RagController],
  providers: [
    KnowledgeChunkerService,
    PostgresKnowledgeStore,
    {
      provide: KNOWLEDGE_STORE,
      useExisting: PostgresKnowledgeStore,
    },
    RagService,
  ],
  exports: [RagService],
})
export class RagModule {}
