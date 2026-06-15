import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import crypto from "node:crypto";

export type EncryptedSecretPayload = {
  version: 1;
  keyId: string;
  algorithm: "aes-256-gcm";
  iv: string;
  tag: string;
  ciphertext: string;
};

@Injectable()
export class SecretCryptoService {
  private readonly key: Buffer;
  private readonly keyId: string;

  constructor(config: ConfigService) {
    const masterKey = config.get<string>(
      "app.secrets.masterKey",
      "development-only-secret-master-key-change-me",
    );
    this.keyId = config.get<string>("app.secrets.keyId", "local-dev");
    this.key = crypto.createHash("sha256").update(masterKey).digest();
  }

  encrypt(value: string): string {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(value, "utf8"),
      cipher.final(),
    ]);
    const payload: EncryptedSecretPayload = {
      version: 1,
      keyId: this.keyId,
      algorithm: "aes-256-gcm",
      iv: iv.toString("base64url"),
      tag: cipher.getAuthTag().toString("base64url"),
      ciphertext: ciphertext.toString("base64url"),
    };
    return Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  }

  decrypt(payload: string): string {
    const parsed = this.parsePayload(payload);
    const decipher = crypto.createDecipheriv(
      "aes-256-gcm",
      this.key,
      Buffer.from(parsed.iv, "base64url"),
    );
    decipher.setAuthTag(Buffer.from(parsed.tag, "base64url"));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(parsed.ciphertext, "base64url")),
      decipher.final(),
    ]);
    return plaintext.toString("utf8");
  }

  hash(value: string): string {
    return crypto.createHash("sha256").update(value).digest("hex");
  }

  private parsePayload(value: string): EncryptedSecretPayload {
    const decoded = Buffer.from(value, "base64url").toString("utf8");
    const parsed = JSON.parse(decoded) as Partial<EncryptedSecretPayload>;
    if (
      parsed.version !== 1 ||
      parsed.algorithm !== "aes-256-gcm" ||
      typeof parsed.keyId !== "string" ||
      typeof parsed.iv !== "string" ||
      typeof parsed.tag !== "string" ||
      typeof parsed.ciphertext !== "string"
    ) {
      throw new Error("Invalid encrypted secret payload");
    }
    return parsed as EncryptedSecretPayload;
  }
}
