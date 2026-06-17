import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import type { ModelRequest, ModelResponse } from "./model-gateway.types.js";
import { OpenAiCompatibleProvider } from "./providers/openai-compatible.provider.js";

export type ModelGatewayStatus = {
  provider: string;
  defaultModel: string;
  hasApiKey: boolean;
  timeoutMs: number;
  maxRetries: number;
  capabilities: string[];
};

@Injectable()
export class ModelGatewayService {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(OpenAiCompatibleProvider)
    private readonly provider: OpenAiCompatibleProvider,
  ) {}

  async generateText(request: ModelRequest): Promise<ModelResponse> {
    return this.provider.generateText(request);
  }

  getStatus(): ModelGatewayStatus {
    return {
      provider: this.config.get<string>("app.model.provider", "deepseek"),
      defaultModel: this.config.get<string>(
        "app.model.defaultModel",
        "deepseek-chat",
      ),
      hasApiKey: Boolean(this.config.get<string>("app.model.apiKey")),
      timeoutMs: this.config.get<number>("app.model.timeoutMs", 30_000),
      maxRetries: this.config.get<number>("app.model.maxRetries", 2),
      capabilities: [
        "provider abstraction",
        "model configuration",
        "timeouts",
        "retries",
        "usage tracking",
      ],
    };
  }
}
