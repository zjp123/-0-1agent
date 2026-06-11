import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import { and, eq } from "drizzle-orm";

import { DRIZZLE_DB } from "../db/database.constants.js";
import type { Database } from "../db/database.types.js";
import { IdentityService } from "../db/identity.service.js";
import {
  authRoles,
  authServiceTokens,
  authUserRoles,
  tenants,
  users,
} from "../db/schema.js";

export type PersistentAuthorization = {
  roles: string[];
  permissions: string[];
};

export type PersistentServiceToken = PersistentAuthorization & {
  tokenId: string;
  tenantId: string;
  userId: string;
};

@Injectable()
export class AuthRbacService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    private readonly identity: IdentityService,
  ) {}

  async resolveUserAuthorization(input: {
    tenantId: string;
    userId: string;
  }): Promise<PersistentAuthorization> {
    const identity = await this.identity.resolve({
      tenantExternalId: input.tenantId,
      userExternalId: input.userId,
    });

    const [user] = await this.db
      .select({ roles: users.roles })
      .from(users)
      .where(eq(users.id, identity.userId))
      .limit(1);

    const assignments = await this.db
      .select({
        name: authRoles.name,
        permissions: authRoles.permissions,
      })
      .from(authUserRoles)
      .innerJoin(authRoles, eq(authUserRoles.roleId, authRoles.id))
      .where(
        and(
          eq(authUserRoles.tenantId, identity.tenantId),
          eq(authUserRoles.userId, identity.userId),
        ),
      );

    return {
      roles: [
        ...(user?.roles ?? []),
        ...assignments.map((assignment) => assignment.name),
      ],
      permissions: assignments.flatMap(
        (assignment) => assignment.permissions ?? [],
      ),
    };
  }

  async resolveServiceToken(input: {
    tokenHash: string;
    tenantId?: string;
  }): Promise<PersistentServiceToken | undefined> {
    const [row] = await this.db
      .select({
        id: authServiceTokens.id,
        name: authServiceTokens.name,
        roles: authServiceTokens.roles,
        permissions: authServiceTokens.permissions,
        enabled: authServiceTokens.enabled,
        expiresAt: authServiceTokens.expiresAt,
        tenantName: tenants.name,
      })
      .from(authServiceTokens)
      .innerJoin(tenants, eq(authServiceTokens.tenantId, tenants.id))
      .where(eq(authServiceTokens.tokenHash, input.tokenHash))
      .limit(1);

    if (!row || !row.enabled) {
      if (!row) {
        return undefined;
      }
      throw new UnauthorizedException("Service token is disabled");
    }
    if (row.expiresAt && row.expiresAt.getTime() <= Date.now()) {
      throw new UnauthorizedException("Service token expired");
    }
    if (input.tenantId && input.tenantId !== row.tenantName) {
      throw new UnauthorizedException("Service token tenant mismatch");
    }

    await this.db
      .update(authServiceTokens)
      .set({
        lastUsedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(authServiceTokens.id, row.id));

    return {
      tokenId: row.id,
      tenantId: row.tenantName,
      userId: `service-token:${row.name}`,
      roles: row.roles,
      permissions: row.permissions,
    };
  }
}
