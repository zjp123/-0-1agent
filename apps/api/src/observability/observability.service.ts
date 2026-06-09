import { Injectable } from "@nestjs/common";

export type ObservabilityStatus = {
  signals: string[];
};

@Injectable()
export class ObservabilityService {
  getStatus(): ObservabilityStatus {
    return {
      signals: [
        "structured logs",
        "metrics",
        "traces",
        "token usage",
        "cost tracking",
        "task replay",
      ],
    };
  }
}
