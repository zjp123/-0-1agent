import "reflect-metadata";

import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import * as schema from "./schema.js";

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://agent:agent_password@localhost:5432/agent_db";
const migrationsFolder =
  process.env.DATABASE_MIGRATIONS_FOLDER ?? "apps/api/drizzle";

async function main(): Promise<void> {
  const pool = new Pool({ connectionString: databaseUrl });
  const db = drizzle(pool, { schema });
  try {
    await migrate(db, { migrationsFolder });
    console.log(`Database migrations applied from ${migrationsFolder}`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
