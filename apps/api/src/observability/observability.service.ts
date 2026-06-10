import { Inject, Injectable } from "@nestjs/common";

import { TRACE_STORE } from "./observability.constants.js";
import type {
  TraceEvent,
  TraceEventType,
  TraceQuery,
  TraceStore,
} from "./observability.types.js";

export type ObservabilityStatus = {
  store: string;
  signals: string[];
  eventTypes: TraceEventType[];
};

@Injectable()
export class ObservabilityService {
  constructor(@Inject(TRACE_STORE) private readonly traceStore: TraceStore) {}

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

    void Promise.resolve(this.traceStore.append(traceEvent));
    return traceEvent;
  }

  async list(query: TraceQuery = {}): Promise<TraceEvent[]> {
    return this.traceStore.list(query);
  }

  getStatus(): ObservabilityStatus {
    return {
      store: "postgres",
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
        "rag.vector.failed",
        "rag.indexing.completed",
        "rag.indexing.failed",
        "rag.indexing.admin",
        "model.completed",
        "model.failed",
        "tool.completed",
        "agent.run.completed",
      ],
    };
  }
}
