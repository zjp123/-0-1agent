import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { DatabaseService, type DatabaseHealth } from "../db/database.service.js";

type HealthResponse = {
  status: "ok";
  service: string;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
  dependencies: {
    database: DatabaseHealth;
  };
};

@Controller("health")
export class HealthController {
  constructor(
    private readonly config: ConfigService,
    private readonly database: DatabaseService,
  ) {}

  @Get()
  async getHealth(): Promise<HealthResponse> {
    return {
      status: "ok",
      service: "enterprise-agent-api",
      environment: this.config.get<string>("app.nodeEnv", "development"),
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      dependencies: {
        database: await this.database.ping(),
      },
    };
  }
}
