import { Injectable } from "@nestjs/common";

export type ToolRegistryStatus = {
  builtinTools: string[];
  mcpEnabled: boolean;
  controls: string[];
};

@Injectable()
export class ToolRegistryService {
  getStatus(): ToolRegistryStatus {
    return {
      builtinTools: [],
      mcpEnabled: false,
      controls: [
        "schema validation",
        "permission checks",
        "execution timeout",
        "result truncation",
        "audit logging",
      ],
    };
  }
}
