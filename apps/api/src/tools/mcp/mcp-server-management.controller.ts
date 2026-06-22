import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";

import { ApiKeyGuard } from "../../auth/api-key.guard.js";
import type { RequestUser } from "../../auth/auth.types.js";
import { CurrentUser } from "../../auth/current-user.decorator.js";
import { RequirePermissions } from "../../auth/permissions.decorator.js";
import { PermissionsGuard } from "../../auth/permissions.guard.js";
import { CreateMcpServerDto } from "../dto/create-mcp-server.dto.js";
import { McpServerActionDto } from "../dto/mcp-server-action.dto.js";
import { UpdateMcpServerDto } from "../dto/update-mcp-server.dto.js";
import {
  McpServerManagementService,
  type McpServerResponse,
} from "./mcp-server-management.service.js";
import {
  ToolRegistryService,
  type ToolRegistryStatus,
} from "../tool-registry.service.js";

@Controller("tools/mcp/servers")
@UseGuards(ApiKeyGuard, PermissionsGuard)
@RequirePermissions("auth:manage")
export class McpServerManagementController {
  constructor(
    @Inject(McpServerManagementService)
    private readonly servers: McpServerManagementService,
    @Inject(ToolRegistryService)
    private readonly registry: ToolRegistryService,
  ) {}

  @Get()
  listServers(@CurrentUser() user: RequestUser): Promise<McpServerResponse[]> {
    return this.servers.listServers(user);
  }

  @Post()
  async createServer(
    @Body() body: CreateMcpServerDto,
    @CurrentUser() user: RequestUser,
  ): Promise<{ server: McpServerResponse; registry: ToolRegistryStatus }> {
    const server = await this.servers.createServer(body, user);
    const registry = await this.registry.reloadMcpHandlers();
    return { server, registry };
  }

  @Post("reload")
  async reload(): Promise<ToolRegistryStatus> {
    return this.registry.reloadMcpHandlers();
  }

  @Patch(":serverId")
  async updateServer(
    @Param("serverId") serverId: string,
    @Body() body: UpdateMcpServerDto,
    @CurrentUser() user: RequestUser,
  ): Promise<{ server: McpServerResponse; registry: ToolRegistryStatus }> {
    const server = await this.servers.updateServer(serverId, body, user);
    const registry = await this.registry.reloadMcpHandlers();
    return { server, registry };
  }

  @Post(":serverId/approve")
  async approveServer(
    @Param("serverId") serverId: string,
    @Body() body: McpServerActionDto,
    @CurrentUser() user: RequestUser,
  ): Promise<{ server: McpServerResponse; registry: ToolRegistryStatus }> {
    const server = await this.servers.approveServer(serverId, body, user);
    const registry = await this.registry.reloadMcpHandlers();
    return { server, registry };
  }

  @Post(":serverId/disable")
  async disableServer(
    @Param("serverId") serverId: string,
    @Body() body: McpServerActionDto,
    @CurrentUser() user: RequestUser,
  ): Promise<{ server: McpServerResponse; registry: ToolRegistryStatus }> {
    const server = await this.servers.disableServer(serverId, body, user);
    const registry = await this.registry.reloadMcpHandlers();
    return { server, registry };
  }

}
