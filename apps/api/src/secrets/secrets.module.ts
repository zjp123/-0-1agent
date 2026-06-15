import { Module } from "@nestjs/common";

import { GovernanceModule } from "../governance/governance.module.js";
import { SecretCryptoService } from "./secret-crypto.service.js";
import { SecretsController } from "./secrets.controller.js";
import { SecretsService } from "./secrets.service.js";

@Module({
  imports: [GovernanceModule],
  controllers: [SecretsController],
  providers: [SecretCryptoService, SecretsService],
  exports: [SecretCryptoService, SecretsService],
})
export class SecretsModule {}
