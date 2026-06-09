import { Module } from "@nestjs/common";

import { ModelGatewayService } from "./model-gateway.service.js";
import { OpenAiCompatibleProvider } from "./providers/openai-compatible.provider.js";

@Module({
  providers: [ModelGatewayService, OpenAiCompatibleProvider],
  exports: [ModelGatewayService],
})
export class ModelGatewayModule {}
