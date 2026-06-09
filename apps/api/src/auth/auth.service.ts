import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

export type AuthStatus = {
  enabled: boolean;
  mode: "api_key" | "dev";
  controls: string[];
};

@Injectable()
export class AuthService {
  constructor(private readonly config: ConfigService) {}

  getStatus(): AuthStatus {
    const hasApiKey = Boolean(this.config.get<string>("app.auth.apiKey"));
    return {
      enabled: true,
      mode: hasApiKey ? "api_key" : "dev",
      controls: [
        "authentication",
        "RBAC",
        "tenant isolation",
        "tool authorization",
        "audit logs",
      ],
    };
  }
}
