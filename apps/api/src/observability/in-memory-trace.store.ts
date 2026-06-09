import { Injectable } from "@nestjs/common";

import type { TraceEvent, TraceQuery } from "./observability.types.js";

const DEFAULT_LIMIT = 100;

@Injectable()
export class InMemoryTraceStore {
  private readonly events: TraceEvent[] = [];

  append(event: TraceEvent): void {
    this.events.push(event);
  }

  list(query: TraceQuery = {}): TraceEvent[] {
    const limit = query.limit ?? DEFAULT_LIMIT;
    return this.events
      .filter((event) => !query.requestId || event.requestId === query.requestId)
      .filter((event) => !query.type || event.type === query.type)
      .slice(-limit)
      .reverse();
  }
}
