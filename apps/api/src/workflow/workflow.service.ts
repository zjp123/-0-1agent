import { Injectable } from "@nestjs/common";

export type WorkflowStatus = {
  enabled: boolean;
  capabilities: string[];
};

@Injectable()
export class WorkflowService {
  getStatus(): WorkflowStatus {
    return {
      enabled: false,
      capabilities: [
        "planning",
        "step state",
        "pause and resume",
        "human approval",
        "execution history",
      ],
    };
  }
}
