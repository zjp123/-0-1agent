import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { GovernanceModule } from "../governance/governance.module.js";
import { SecretCryptoService } from "./secret-crypto.service.js";
import { SecretsController } from "./secrets.controller.js";
import { SecretsService } from "./secrets.service.js";

@Module({
  imports: [AuthModule, GovernanceModule],
  controllers: [SecretsController],
  providers: [SecretCryptoService, SecretsService],
  exports: [SecretCryptoService, SecretsService],
})
export class SecretsModule {}
