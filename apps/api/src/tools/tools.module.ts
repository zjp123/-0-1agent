import { Module } from "@nestjs/common";

import { AuthModule } from "../auth/auth.module.js";
import { GovernanceModule } from "../governance/governance.module.js";
import { CalculatorTool } from "./builtin/calculator.tool.js";
import { CurrentTimeTool } from "./builtin/current-time.tool.js";
import { McpServerManagementController } from "./mcp/mcp-server-management.controller.js";
import { McpServerManagementService } from "./mcp/mcp-server-management.service.js";
import { McpToolProviderService } from "./mcp/mcp-tool-provider.service.js";
import { ToolRegistryService } from "./tool-registry.service.js";
import { ToolsController } from "./tools.controller.js";

@Module({
  imports: [AuthModule, GovernanceModule],
  controllers: [ToolsController, McpServerManagementController],
  providers: [
    CurrentTimeTool,
    CalculatorTool,
    McpServerManagementService,
    McpToolProviderService,
    ToolRegistryService,
  ],
  exports: [ToolRegistryService],
})
export class ToolsModule {}
