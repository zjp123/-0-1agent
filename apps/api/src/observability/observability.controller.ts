import { Controller, Get, Query, UseGuards } from "@nestjs/common";

import { ApiKeyGuard } from "../auth/api-key.guard.js";
import { RequirePermissions } from "../auth/permissions.decorator.js";
import { PermissionsGuard } from "../auth/permissions.guard.js";
import { ListTracesDto } from "./dto/list-traces.dto.js";
import { ObservabilityService } from "./observability.service.js";
import type { TraceEvent, TraceQuery } from "./observability.types.js";

@Controller("observability")
export class ObservabilityController {
  constructor(private readonly observability: ObservabilityService) {}

  @Get("traces")
  @UseGuards(ApiKeyGuard, PermissionsGuard)
  @RequirePermissions("observability:read")
  listTraces(@Query() query: ListTracesDto): TraceEvent[] {
    const traceQuery: TraceQuery = {};
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
}
