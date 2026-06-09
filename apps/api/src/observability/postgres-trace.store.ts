import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq } from "drizzle-orm";

import { DRIZZLE_DB } from "../db/database.constants.js";
import type { Database } from "../db/database.types.js";
import { IdentityService } from "../db/identity.service.js";
import { traceEvents } from "../db/schema.js";
import type {
  TraceEvent,
  TraceEventType,
  TraceQuery,
  TraceStore,
} from "./observability.types.js";

const DEFAULT_LIMIT = 100;

@Injectable()
export class PostgresTraceStore implements TraceStore {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    private readonly identity: IdentityService,
  ) {}

  async append(event: TraceEvent): Promise<void> {
    const tenantId = event.tenantId
      ? await this.identity.ensureTenant(event.tenantId)
      : undefined;

    await this.db.insert(traceEvents).values({
      id: event.id,
      tenantId,
      requestId: event.requestId,
      type: event.type,
      durationMs: event.durationMs,
      attributes: {
        ...event.attributes,
        externalTenantId: event.tenantId ?? null,
        userId: event.userId ?? null,
      },
      createdAt: new Date(event.timestamp),
    });
  }

  async list(query: TraceQuery = {}): Promise<TraceEvent[]> {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const filters = [];
    if (query.requestId) {
      filters.push(eq(traceEvents.requestId, query.requestId));
    }
    if (query.type) {
      filters.push(eq(traceEvents.type, query.type));
    }
    if (query.tenantId) {
      const tenantId = await this.identity.ensureTenant(query.tenantId);
      filters.push(eq(traceEvents.tenantId, tenantId));
    }

    const whereClause =
      filters.length === 0
        ? undefined
        : filters.length === 1
          ? filters[0]
          : and(...filters);

    const rows = await this.db
      .select()
      .from(traceEvents)
      .where(whereClause)
      .orderBy(desc(traceEvents.createdAt))
      .limit(limit);

    return rows.map((row) => this.toTraceEvent(row));
  }

  private toTraceEvent(row: typeof traceEvents.$inferSelect): TraceEvent {
    const attributes = row.attributes as Record<string, string | number | boolean | null>;
    const traceEvent: TraceEvent = {
      id: row.id,
      requestId: row.requestId,
      type: row.type as TraceEventType,
      timestamp: row.createdAt.toISOString(),
      attributes,
    };
    if (row.durationMs !== null) {
      traceEvent.durationMs = row.durationMs;
    }
    const tenantId = attributes.externalTenantId;
    if (typeof tenantId === "string") {
      traceEvent.tenantId = tenantId;
    }
    const userId = attributes.userId;
    if (typeof userId === "string") {
      traceEvent.userId = userId;
    }
    return traceEvent;
  }
}
