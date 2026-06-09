import { Injectable } from "@nestjs/common";

export type RagStatus = {
  enabled: boolean;
  pipeline: string[];
};

@Injectable()
export class RagService {
  getStatus(): RagStatus {
    return {
      enabled: false,
      pipeline: [
        "document ingestion",
        "chunking",
        "embedding",
        "vector retrieval",
        "source citation",
        "permission filtering",
      ],
    };
  }
}
