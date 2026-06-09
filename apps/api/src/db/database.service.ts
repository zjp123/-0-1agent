import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { Pool } from "pg";

import { DRIZZLE_DB, PG_POOL } from "./database.constants.js";
import type { Database } from "./database.types.js";

export type DatabaseHealth = {
  status: "ok" | "error";
  latencyMs: number;
  message?: string;
};

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  constructor(
    @Inject(DRIZZLE_DB) readonly db: Database,
    @Inject(PG_POOL) private readonly pool: Pool,
  ) {}

  async ping(): Promise<DatabaseHealth> {
    const startedAt = Date.now();
    try {
      await this.db.execute(sql`select 1`);
      return {
        status: "ok",
        latencyMs: Date.now() - startedAt,
      };
    } catch (error) {
      const health: DatabaseHealth = {
        status: "error",
        latencyMs: Date.now() - startedAt,
      };
      if (error instanceof Error) {
        health.message = error.message;
      }
      return health;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
