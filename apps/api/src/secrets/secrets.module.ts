import { Module } from "@nestjs/common";

import { SecretCryptoService } from "./secret-crypto.service.js";
import { SecretsController } from "./secrets.controller.js";
import { SecretsService } from "./secrets.service.js";

@Module({
  controllers: [SecretsController],
  providers: [SecretCryptoService, SecretsService],
  exports: [SecretCryptoService, SecretsService],
})
export class SecretsModule {}
