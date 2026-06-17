import { Controller, Get, Inject, Param, Query, UseGuards } from "@nestjs/common";

import { ApiKeyGuard } from "../auth/api-key.guard.js";
import { CurrentUser } from "../auth/current-user.decorator.js";
import { RequirePermissions } from "../auth/permissions.decorator.js";
import { PermissionsGuard } from "../auth/permissions.guard.js";
import type { RequestUser } from "../auth/auth.types.js";
import { ListTracesDto } from "./dto/list-traces.dto.js";
import { ObservabilityService } from "./observability.service.js";
import type {
  TraceEvent,
  TraceFailureSummary,
  TraceQuery,
  TraceTimeline,
} from "./observability.types.js";

@Controller("observability")
export class ObservabilityController {
  constructor(
    @Inject(ObservabilityService)
    private readonly observability: ObservabilityService,
  ) {}

  @Get("traces")
  @UseGuards(ApiKeyGuard, PermissionsGuard)
  @RequirePermissions("observability:read")
  listTraces(
    @Query() query: ListTracesDto,
    @CurrentUser() user: RequestUser,
  ): Promise<TraceEvent[]> {
    const traceQuery: TraceQuery = {
      tenantId: user.tenantId,
    };
    if (query.requestId) {
      traceQuery.requestId = query.requestId;
    }
    if (query.type) {
      traceQuery.type = query.type;
    }
    if (query.limit !== undefined) {
      traceQuery.limit = query.limit;
    }
    return this.observability.list(traceQuery);
  }

  @Get("traces/:requestId/timeline")
  @UseGuards(ApiKeyGuard, PermissionsGuard)
  @RequirePermissions("observability:read")
  getTraceTimeline(
    @Param("requestId") requestId: string,
    @CurrentUser() user: RequestUser,
  ): Promise<TraceTimeline> {
    return this.observability.timeline({
      requestId,
      tenantId: user.tenantId,
    });
  }

  @Get("failures")
  @UseGuards(ApiKeyGuard, PermissionsGuard)
  @RequirePermissions("observability:read")
  listRecentFailures(@CurrentUser() user: RequestUser): Promise<TraceFailureSummary[]> {
    return this.observability.recentFailures({
      tenantId: user.tenantId,
      limit: 20,
    });
  }
}
