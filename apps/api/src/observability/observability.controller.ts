import { Controller, Get, Query } from "@nestjs/common";

import { ListTracesDto } from "./dto/list-traces.dto.js";
import { ObservabilityService } from "./observability.service.js";
import type { TraceEvent, TraceQuery } from "./observability.types.js";

@Controller("observability")
export class ObservabilityController {
  constructor(private readonly observability: ObservabilityService) {}

  @Get("traces")
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
