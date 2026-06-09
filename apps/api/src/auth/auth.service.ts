import { Injectable } from "@nestjs/common";

export type AuthStatus = {
  enabled: boolean;
  controls: string[];
};

@Injectable()
export class AuthService {
  getStatus(): AuthStatus {
    return {
      enabled: false,
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
