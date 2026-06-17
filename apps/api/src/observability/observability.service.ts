import { Inject, Injectable } from "@nestjs/common";

import { TRACE_STORE } from "./observability.constants.js";
import type {
  TraceEvent,
  TraceEventType,
  TraceFailureSummary,
  TraceQuery,
  TraceStore,
  TraceTimeline,
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

  async timeline(query: { requestId: string; tenantId: string }): Promise<TraceTimeline> {
    const events = await this.traceStore.list({
      requestId: query.requestId,
      tenantId: query.tenantId,
      limit: 500,
    });
    const sortedEvents = [...events].sort(
      (left, right) =>
        new Date(left.timestamp).getTime() - new Date(right.timestamp).getTime(),
    );
    const firstTimestamp = sortedEvents[0]?.timestamp;
    const lastTimestamp = sortedEvents[sortedEvents.length - 1]?.timestamp;
    const summary: TraceTimeline["summary"] = {
      eventCount: sortedEvents.length,
      failureCount: sortedEvents.filter((event) => event.type.endsWith(".failed")).length,
      eventMix: this.eventMix(sortedEvents),
    };
    if (firstTimestamp) {
      summary.firstTimestamp = firstTimestamp;
    }
    if (lastTimestamp) {
      summary.lastTimestamp = lastTimestamp;
    }
    if (firstTimestamp && lastTimestamp) {
      summary.durationMs =
        new Date(lastTimestamp).getTime() - new Date(firstTimestamp).getTime();
    }

    return {
      requestId: query.requestId,
      events: sortedEvents,
      summary,
    };
  }

  async recentFailures(query: {
    tenantId: string;
    limit?: number;
  }): Promise<TraceFailureSummary[]> {
    const events = await this.traceStore.list({
      tenantId: query.tenantId,
      limit: 500,
    });
    const failures = events
      .filter((event) => event.type.endsWith(".failed"))
      .sort(
        (left, right) =>
          new Date(right.timestamp).getTime() - new Date(left.timestamp).getTime(),
      );
    const summaries = new Map<string, TraceFailureSummary>();

    for (const event of failures) {
      const existing = summaries.get(event.requestId);
      if (existing) {
        existing.failureCount += 1;
        continue;
      }
      const summary: TraceFailureSummary = {
        requestId: event.requestId,
        failureCount: 1,
        lastFailureType: event.type,
        lastTimestamp: event.timestamp,
      };
      const lastError = this.failureMessage(event);
      if (lastError) {
        summary.lastError = lastError;
      }
      summaries.set(event.requestId, summary);
    }

    return [...summaries.values()].slice(0, query.limit ?? 20);
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
        "rag.indexing.recovery",
        "model.completed",
        "model.failed",
        "tool.completed",
        "agent.run.completed",
      ],
    };
  }

  private eventMix(events: TraceEvent[]): Record<string, number> {
    return events.reduce<Record<string, number>>((mix, event) => {
      const prefix = event.type.split(".")[0] ?? "unknown";
      mix[prefix] = (mix[prefix] ?? 0) + 1;
      return mix;
    }, {});
  }

  private failureMessage(event: TraceEvent): string | undefined {
    const message = event.attributes.message ?? event.attributes.error ?? event.attributes.stopReason;
    return typeof message === "string" ? message : undefined;
  }
}
