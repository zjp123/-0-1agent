import { Module } from "@nestjs/common";

import { CalculatorTool } from "./builtin/calculator.tool.js";
import { CurrentTimeTool } from "./builtin/current-time.tool.js";
import { ToolRegistryService } from "./tool-registry.service.js";
import { ToolsController } from "./tools.controller.js";

@Module({
  controllers: [ToolsController],
  providers: [CurrentTimeTool, CalculatorTool, ToolRegistryService],
  exports: [ToolRegistryService],
})
export class ToolsModule {}
