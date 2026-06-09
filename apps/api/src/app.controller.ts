import { Controller, Get } from "@nestjs/common";

@Controller()
export class AppController {
  @Get()
  getRoot(): { service: string; docs: string[] } {
    return {
      service: "enterprise-agent-api",
      docs: ["/api/health", "/api/agent/capabilities"],
    };
  }
}
