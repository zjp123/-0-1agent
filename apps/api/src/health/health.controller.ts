import { Controller, Get, Inject } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { DatabaseService, type DatabaseHealth } from "../db/database.service.js";
import { VECTOR_STORE } from "../vector-store/vector-store.constants.js";
import type {
  VectorStore,
  VectorStoreHealth,
} from "../vector-store/vector-store.types.js";

type HealthResponse = {
  status: "ok";
  service: string;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
  dependencies: {
    database: DatabaseHealth;
    vectorStore: VectorStoreHealth;
  };
};

@Controller("health")
export class HealthController {
  constructor(
    private readonly config: ConfigService,
    private readonly database: DatabaseService,
    @Inject(VECTOR_STORE) private readonly vectorStore: VectorStore,
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
        vectorStore: await this.vectorStore.health(),
      },
    };
  }
}
