import "reflect-metadata";

import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

import * as schema from "./schema.js";

loadEnvFile();

const databaseUrl =
  process.env.DATABASE_URL ??
  "postgresql://agent:agent_password@localhost:5432/agent_db";
const migrationsFolder =
  process.env.DATABASE_MIGRATIONS_FOLDER ?? resolveMigrationsFolder();

function resolveMigrationsFolder(): string {
  const defaultFolder = resolve(process.cwd(), "apps/api/drizzle");
  const candidates = [
    defaultFolder,
    resolve(process.cwd(), "drizzle"),
    resolve(dirname(fileURLToPath(import.meta.url)), "../../drizzle"),
  ];
  const found = candidates.find((candidate) => existsSync(join(candidate, "meta/_journal.json")));
  return found ?? defaultFolder;
}

function loadEnvFile(): void {
  const candidates = [
    resolve(process.cwd(), ".env"),
    resolve(process.cwd(), "../../.env"),
  ];
  const envFile = candidates.find((candidate) => existsSync(candidate));
  if (!envFile) {
    return;
  }

  const lines = readFileSync(envFile, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

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
