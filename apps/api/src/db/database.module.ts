import { Global, Module } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { DatabaseService } from "./database.service.js";
import { DRIZZLE_DB, PG_POOL } from "./database.constants.js";
import * as schema from "./schema.js";

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        new Pool({
          connectionString: config.get<string>("app.database.url"),
          max: config.get<number>("app.database.poolMax", 10),
        }),
    },
    {
      provide: DRIZZLE_DB,
      inject: [PG_POOL],
      useFactory: (pool: Pool) => drizzle(pool, { schema }),
    },
    DatabaseService,
  ],
  exports: [DatabaseService, DRIZZLE_DB, PG_POOL],
})
export class DatabaseModule {}
