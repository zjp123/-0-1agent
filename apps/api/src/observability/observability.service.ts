import { Injectable } from "@nestjs/common";

import { InMemoryTraceStore } from "./in-memory-trace.store.js";
import type {
  TraceEvent,
  TraceEventType,
  TraceQuery,
} from "./observability.types.js";

export type ObservabilityStatus = {
  store: string;
  signals: string[];
  eventTypes: TraceEventType[];
};

@Injectable()
export class ObservabilityService {
  constructor(private readonly traceStore: InMemoryTraceStore) {}

  record(event: Omit<TraceEvent, "id" | "timestamp"> & { timestamp?: string }): TraceEvent {
    const traceEvent: TraceEvent = {
      id: crypto.randomUUID(),
      timestamp: event.timestamp ?? new Date().toISOString(),
      requestId: event.requestId,
      type: event.type,
      attributes: event.attributes,
    };
    if (event.durationMs !== undefined) {
      traceEvent.durationMs = event.durationMs;
    }
    if (event.userId) {
      traceEvent.userId = event.userId;
    }
    if (event.tenantId) {
      traceEvent.tenantId = event.tenantId;
    }

    this.traceStore.append(traceEvent);
    return traceEvent;
  }

  list(query: TraceQuery = {}): TraceEvent[] {
    return this.traceStore.list(query);
  }

  getStatus(): ObservabilityStatus {
    return {
      store: "in-memory",
      signals: [
        "structured trace events",
        "model usage",
        "tool call audit",
        "rag retrieval",
        "context budget",
        "task replay planned",
      ],
      eventTypes: [
        "agent.run.started",
        "agent.context.built",
        "rag.retrieved",
        "model.completed",
        "model.failed",
        "tool.completed",
        "agent.run.completed",
      ],
    };
  }
}
