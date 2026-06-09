import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";

import { DRIZZLE_DB } from "./database.constants.js";
import type { Database } from "./database.types.js";
import { tenants, users } from "./schema.js";

export type ResolvedIdentity = {
  tenantId: string;
  userId: string;
};

@Injectable()
export class IdentityService {
  constructor(@Inject(DRIZZLE_DB) private readonly db: Database) {}

  async resolve(input: {
    tenantExternalId: string;
    userExternalId: string;
  }): Promise<ResolvedIdentity> {
    const tenantId = await this.ensureTenant(input.tenantExternalId);
    const userId = await this.ensureUser({
      tenantId,
      externalId: input.userExternalId,
    });

    return { tenantId, userId };
  }

  async ensureTenant(externalId: string): Promise<string> {
    const [existing] = await this.db
      .select({ id: tenants.id })
      .from(tenants)
      .where(eq(tenants.name, externalId))
      .limit(1);

    if (existing) {
      return existing.id;
    }

    const [created] = await this.db
      .insert(tenants)
      .values({ name: externalId })
      .returning({ id: tenants.id });

    if (!created) {
      throw new Error("Failed to create tenant");
    }
    return created.id;
  }

  async ensureUser(input: {
    tenantId: string;
    externalId: string;
  }): Promise<string> {
    const [existing] = await this.db
      .select({ id: users.id })
      .from(users)
      .where(
        and(
          eq(users.tenantId, input.tenantId),
          eq(users.externalId, input.externalId),
        ),
      )
      .limit(1);

    if (existing) {
      return existing.id;
    }

    const [created] = await this.db
      .insert(users)
      .values({
        tenantId: input.tenantId,
        externalId: input.externalId,
        displayName: input.externalId,
        roles: ["developer"],
      })
      .returning({ id: users.id });

    if (!created) {
      throw new Error("Failed to create user");
    }
    return created.id;
  }
}
