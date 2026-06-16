import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

import { DatabaseService, type DatabaseHealth } from "../db/database.service.js";
import { VECTOR_STORE } from "../vector-store/vector-store.constants.js";
import type {
  VectorStore,
  VectorStoreHealth,
} from "../vector-store/vector-store.types.js";

type HealthResponse = {
  status: "ok" | "error";
  service: string;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
  dependencies: {
    database: DatabaseHealth;
    vectorStore: VectorStoreHealth;
  };
};

type LiveResponse = {
  status: "ok";
  service: string;
  uptimeSeconds: number;
  timestamp: string;
};

@Controller("health")
export class HealthController {
  constructor(
    @Inject(ConfigService) private readonly config: ConfigService,
    @Inject(DatabaseService)
    private readonly database: DatabaseService,
    @Inject(VECTOR_STORE) private readonly vectorStore: VectorStore,
  ) {}

  @Get()
  async getHealth(): Promise<HealthResponse> {
    return this.buildHealthResponse();
  }

  @Get("live")
  getLive(): LiveResponse {
    return {
      status: "ok",
      service: "enterprise-agent-api",
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }

  @Get("ready")
  async getReady(): Promise<HealthResponse> {
    const response = await this.buildHealthResponse();
    if (response.status !== "ok") {
      throw new ServiceUnavailableException(response);
    }
    return response;
  }

  private async buildHealthResponse(): Promise<HealthResponse> {
    const database = await this.database.ping();
    const vectorStore = await this.vectorStore.health();
    const ready =
      database.status === "ok" &&
      (vectorStore.status === "ok" || vectorStore.status === "disabled");

    return {
      status: ready ? "ok" : "error",
      service: "enterprise-agent-api",
      environment: this.config.get<string>("app.nodeEnv", "development"),
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
      dependencies: {
        database,
        vectorStore,
      },
    };
  }
}
