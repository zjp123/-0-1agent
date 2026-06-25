import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { DatabaseModule } from "../db/database.module.js";
import { GovernanceModule } from "../governance/governance.module.js";
import { ObservabilityModule } from "../observability/observability.module.js";
import { VectorStoreModule } from "../vector-store/vector-store.module.js";
import {
  INDEXING_JOB_STORE,
  KNOWLEDGE_STORE,
} from "./knowledge.constants.js";
import { DocumentExtractorService } from "./document-extractor.service.js";
import { KnowledgeChunkerService } from "./knowledge-chunker.service.js";
import { IndexingWorkerService } from "./indexing-worker.service.js";
import { PostgresIndexingJobStore } from "./postgres-indexing-job.store.js";
import { PostgresKnowledgeStore } from "./postgres-knowledge.store.js";
import { RedisIndexingQueue } from "./redis-indexing-queue.js";
import { RagController } from "./rag.controller.js";
import { RagService } from "./rag.service.js";

@Module({
  imports: [
    DatabaseModule,
    AuthModule,
    VectorStoreModule,
    ObservabilityModule,
    GovernanceModule,
  ],
  controllers: [RagController],
  providers: [
    KnowledgeChunkerService,
    DocumentExtractorService,
    RedisIndexingQueue,
    IndexingWorkerService,
    PostgresKnowledgeStore,
    PostgresIndexingJobStore,
    {
      provide: KNOWLEDGE_STORE,
      useExisting: PostgresKnowledgeStore,
    },
    {
      provide: INDEXING_JOB_STORE,
      useExisting: PostgresIndexingJobStore,
    },
    RagService,
  ],
  exports: [RagService],
})
export class RagModule {}
