import { Body, Controller, Get, Param, Post, UseGuards } from "@nestjs/common";

import { ApiKeyGuard } from "../auth/api-key.guard.js";
import type { RequestUser } from "../auth/auth.types.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { RequirePermissions } from "../auth/permissions.decorator.js";
import { PermissionsGuard } from "../auth/permissions.guard.js";
import { CreateParticipantDto } from "./dto/create-participant.dto.js";
import { RunOrchestrationDto } from "./dto/run-orchestration.dto.js";
import { OrchestrationService } from "./orchestration.service.js";
import type {
  OrchestrationParticipant,
  OrchestrationRun,
  OrchestrationStatus,
} from "./orchestration.types.js";

@Controller("orchestration")
@UseGuards(ApiKeyGuard, PermissionsGuard)
@RequirePermissions("workflow:manage")
export class OrchestrationController {
  constructor(private readonly orchestration: OrchestrationService) {}

  @Get("status")
  getStatus(): OrchestrationStatus {
    return this.orchestration.getStatus();
  }

  @Get("participants")
  listParticipants(
    @CurrentUser() user: RequestUser,
  ): Promise<OrchestrationParticipant[]> {
    return this.orchestration.listParticipants(user);
  }

  @Post("participants")
  createParticipant(
    @Body() body: CreateParticipantDto,
    @CurrentUser() user: RequestUser,
  ): Promise<OrchestrationParticipant> {
    return this.orchestration.createParticipant(body, user);
  }

  @Get("runs")
  listRuns(@CurrentUser() user: RequestUser): Promise<OrchestrationRun[]> {
    return this.orchestration.listRuns(user);
  }

  @Get("runs/:runId")
  getRun(
    @Param("runId") runId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<OrchestrationRun> {
    return this.orchestration.getRun(runId, user);
  }

  @Post("runs")
  run(
    @Body() body: RunOrchestrationDto,
    @CurrentUser() user: RequestUser,
  ): Promise<OrchestrationRun> {
    return this.orchestration.run(body, user);
  }
}
