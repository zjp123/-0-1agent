import { Injectable } from "@nestjs/common";

export type MemoryContextStatus = {
  layers: string[];
  strategies: string[];
};

@Injectable()
export class MemoryContextService {
  getStatus(): MemoryContextStatus {
    return {
      layers: ["session", "user", "task", "retrieved knowledge"],
      strategies: [
        "token budget",
        "summarization",
        "context ranking",
        "retrieval injection",
      ],
    };
  }
}
