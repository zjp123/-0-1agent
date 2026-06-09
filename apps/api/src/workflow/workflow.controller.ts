import {
  Body,
  Controller,
  Get,
  NotFoundException,
  Param,
  Patch,
  Post,
  UseGuards,
} from "@nestjs/common";

import { ApiKeyGuard } from "../auth/api-key.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { RequirePermissions } from "../auth/permissions.decorator.js";
import { PermissionsGuard } from "../auth/permissions.guard.js";
import type { RequestUser } from "../auth/auth.types.js";
import { CreateWorkflowDto } from "./dto/create-workflow.dto.js";
import { UpdateWorkflowStepDto } from "./dto/update-workflow-step.dto.js";
import { WorkflowService } from "./workflow.service.js";
import type {
  CreateWorkflowInput,
  UpdateWorkflowStepInput,
  Workflow,
} from "./workflow.types.js";

@Controller("workflows")
@UseGuards(ApiKeyGuard, PermissionsGuard)
@RequirePermissions("workflow:manage")
export class WorkflowController {
  constructor(private readonly workflow: WorkflowService) {}

  @Post()
  create(
    @Body() body: CreateWorkflowDto,
    @CurrentUser() user: RequestUser,
  ): Promise<Workflow> {
    const input: CreateWorkflowInput = {
      tenantId: user.tenantId,
      userId: user.userId,
      title: body.title,
      goal: body.goal,
      steps: body.steps,
    };
    return this.workflow.create(input);
  }

  @Get()
  list(@CurrentUser() user: RequestUser): Promise<Workflow[]> {
    return this.workflow.list(user.tenantId);
  }

  @Get(":workflowId")
  async get(
    @Param("workflowId") workflowId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<Workflow> {
    const workflow = await this.workflow.get(user.tenantId, workflowId);
    if (!workflow) {
      throw new NotFoundException("Workflow not found");
    }
    return workflow;
  }

  @Patch(":workflowId/steps/:stepId")
  async updateStep(
    @Param("workflowId") workflowId: string,
    @Param("stepId") stepId: string,
    @Body() body: UpdateWorkflowStepDto,
    @CurrentUser() user: RequestUser,
  ): Promise<Workflow> {
    const input: UpdateWorkflowStepInput = {
      tenantId: user.tenantId,
      workflowId,
      stepId,
      userId: user.userId,
      status: body.status,
    };
    if (body.output !== undefined) {
      input.output = body.output;
    }
    if (body.error !== undefined) {
      input.error = body.error;
    }

    const workflow = await this.workflow.updateStep(input);
    if (!workflow) {
      throw new NotFoundException("Workflow or step not found");
    }
    return workflow;
  }
}
