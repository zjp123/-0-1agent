import { Controller, Get } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

type HealthResponse = {
  status: "ok";
  service: string;
  environment: string;
  uptimeSeconds: number;
  timestamp: string;
};

@Controller("health")
export class HealthController {
  constructor(private readonly config: ConfigService) {}

  @Get()
  getHealth(): HealthResponse {
    return {
      status: "ok",
      service: "enterprise-agent-api",
      environment: this.config.get<string>("app.nodeEnv", "development"),
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString(),
    };
  }
}
