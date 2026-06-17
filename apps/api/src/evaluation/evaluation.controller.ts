import {
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";

import { ApiKeyGuard } from "../auth/api-key.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { RequirePermissions } from "../auth/permissions.decorator.js";
import { PermissionsGuard } from "../auth/permissions.guard.js";
import type { RequestUser } from "../auth/auth.types.js";
import { CreateEvaluationCaseDto } from "./dto/create-evaluation-case.dto.js";
import { RunEvaluationDto } from "./dto/run-evaluation.dto.js";
import { EvaluationService } from "./evaluation.service.js";
import type {
  CreateEvaluationCaseInput,
  EvaluationCase,
  EvaluationRun,
} from "./evaluation.types.js";

@Controller("evaluations")
@UseGuards(ApiKeyGuard, PermissionsGuard)
@RequirePermissions("evaluation:manage")
export class EvaluationController {
  constructor(@Inject(EvaluationService) private readonly evaluation: EvaluationService) {}

  @Post("cases")
  createCase(
    @Body() body: CreateEvaluationCaseDto,
    @CurrentUser() user: RequestUser,
  ): Promise<EvaluationCase> {
    const input: CreateEvaluationCaseInput = {
      tenantId: user.tenantId,
      userId: user.userId,
      name: body.name,
      type: body.type,
      input: body.input,
      expectedOutput: body.expectedOutput,
    };
    if (body.tags) {
      input.tags = body.tags;
    }
    return this.evaluation.createCase(input);
  }

  @Get("cases")
  listCases(@CurrentUser() user: RequestUser): Promise<EvaluationCase[]> {
    return this.evaluation.listCases(user.tenantId);
  }

  @Post("cases/:caseId/runs")
  runCase(
    @Param("caseId") caseId: string,
    @Body() body: RunEvaluationDto,
    @CurrentUser() user: RequestUser,
  ): Promise<EvaluationRun> {
    return this.evaluation.run({
      tenantId: user.tenantId,
      caseId,
      actualOutput: body.actualOutput,
    });
  }

  @Get("runs")
  listRuns(
    @Query("caseId") caseId: string | undefined,
    @CurrentUser() user: RequestUser,
  ): Promise<EvaluationRun[]> {
    return this.evaluation.listRuns(user.tenantId, caseId);
  }
}
