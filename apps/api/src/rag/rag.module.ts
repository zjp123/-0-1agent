import { Module } from "@nestjs/common";

import { InMemoryKnowledgeStore } from "./in-memory-knowledge.store.js";
import { KnowledgeChunkerService } from "./knowledge-chunker.service.js";
import { RagController } from "./rag.controller.js";
import { RagService } from "./rag.service.js";

@Module({
  controllers: [RagController],
  providers: [KnowledgeChunkerService, InMemoryKnowledgeStore, RagService],
  exports: [RagService],
})
export class RagModule {}
