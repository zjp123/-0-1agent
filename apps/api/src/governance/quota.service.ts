import {
  ConflictException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { and, desc, eq, isNull, or } from "drizzle-orm";

import { DRIZZLE_DB } from "../db/database.constants.js";
import type { Database } from "../db/database.types.js";
import { IdentityService } from "../db/identity.service.js";
import { quotaPolicies, quotaUsageEvents } from "../db/schema.js";
import type { RequestUser } from "../auth/auth.types.js";
import { CreateQuotaPolicyDto } from "./dto/create-quota-policy.dto.js";
import { UpdateQuotaPolicyDto } from "./dto/update-quota-policy.dto.js";
import {
  QuotaAction,
  QuotaCheckInput,
  QuotaCheckResult,
  QuotaDecision,
  QuotaPolicy,
  QuotaSubjectType,
  QuotaUsageEvent,
} from "./governance.types.js";
import { RedisRateLimitStore } from "./redis-rate-limit.store.js";

type EffectivePolicy = {
  id: string;
  tenantUuid?: string;
  tenantId?: string;
  name: string;
  action: QuotaAction;
  subjectType: QuotaSubjectType;
  subjectId?: string;
  windowSeconds: number;
  requestLimit?: number;
  tokenLimit?: number;
  enabled: boolean;
};

@Injectable()
export class QuotaService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    private readonly identity: IdentityService,
    private readonly redis: RedisRateLimitStore,
    private readonly config: ConfigService,
  ) {}

  async enforce(input: QuotaCheckInput): Promise<QuotaCheckResult> {
    const result = await this.check(input);
    if (!result.allowed) {
      const denied = result.decisions.find((decision) => !decision.allowed);
      const message = denied
        ? `Quota exceeded for ${denied.unit}: ${denied.amount}/${denied.limit}`
        : "Quota exceeded";
      throw new HttpException(message, HttpStatus.TOO_MANY_REQUESTS);
    }
    return result;
  }

  async check(input: QuotaCheckInput): Promise<QuotaCheckResult> {
    const tenantUuid = await this.identity.ensureTenant(input.tenantId);
    const policies = await this.resolvePolicies(input, tenantUuid);
    const decisions: QuotaDecision[] = [];

    for (const policy of policies) {
      if (policy.requestLimit !== undefined) {
        decisions.push(
          await this.consume({
            policy,
            input,
            tenantUuid,
            unit: "requests",
            amount: input.requestCost ?? 1,
            limit: policy.requestLimit,
          }),
        );
      }
      if (policy.tokenLimit !== undefined && input.tokenCost !== undefined) {
        decisions.push(
          await this.consume({
            policy,
            input,
            tenantUuid,
            unit: "tokens",
            amount: input.tokenCost,
            limit: policy.tokenLimit,
          }),
        );
      }
    }

    const allowed = decisions.every((decision) => decision.allowed);
    if (!allowed) {
      const denied = decisions.find((decision) => !decision.allowed);
      await this.recordUsageEvent({
        input,
        tenantUuid,
        ...(denied ? { decision: denied } : {}),
        reason: "quota_exceeded",
      });
    }

    return {
      allowed,
      action: input.action,
      decisions,
    };
  }

  async listPolicies(actor: RequestUser): Promise<QuotaPolicy[]> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    const rows = await this.db
      .select()
      .from(quotaPolicies)
      .where(or(eq(quotaPolicies.tenantId, tenantUuid), isNull(quotaPolicies.tenantId)))
      .orderBy(desc(quotaPolicies.createdAt));

    return rows.map((row) => this.toPolicy(row, actor.tenantId));
  }

  async createPolicy(
    body: CreateQuotaPolicyDto,
    actor: RequestUser,
  ): Promise<QuotaPolicy> {
    this.assertPolicyHasLimit(body);
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    const tenantId = body.subjectType === "global" ? null : tenantUuid;

    const [created] = await this.db
      .insert(quotaPolicies)
      .values({
        tenantId,
        name: body.name.trim(),
        action: body.action,
        subjectType: body.subjectType,
        subjectId: body.subjectId,
        windowSeconds: body.windowSeconds,
        requestLimit: body.requestLimit,
        tokenLimit: body.tokenLimit,
        enabled: body.enabled ?? true,
      })
      .returning();

    if (!created) {
      throw new Error("Failed to create quota policy");
    }
    return this.toPolicy(created, actor.tenantId);
  }

  async updatePolicy(
    policyId: string,
    body: UpdateQuotaPolicyDto,
    actor: RequestUser,
  ): Promise<QuotaPolicy> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    const existing = await this.getTenantPolicy(policyId, tenantUuid);
    const updates: Partial<typeof quotaPolicies.$inferInsert> = {
      updatedAt: new Date(),
    };
    if (body.name !== undefined) {
      updates.name = body.name.trim();
    }
    if (body.windowSeconds !== undefined) {
      updates.windowSeconds = body.windowSeconds;
    }
    if (body.requestLimit !== undefined) {
      updates.requestLimit = body.requestLimit;
    }
    if (body.tokenLimit !== undefined) {
      updates.tokenLimit = body.tokenLimit;
    }
    if (body.enabled !== undefined) {
      updates.enabled = body.enabled;
    }
    if (Object.keys(updates).length === 1) {
      throw new ConflictException("No quota policy fields to update");
    }

    const [updated] = await this.db
      .update(quotaPolicies)
      .set(updates)
      .where(eq(quotaPolicies.id, existing.id))
      .returning();

    if (!updated) {
      throw new Error("Failed to update quota policy");
    }
    return this.toPolicy(updated, actor.tenantId);
  }

  async listUsageEvents(actor: RequestUser): Promise<QuotaUsageEvent[]> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    const rows = await this.db
      .select()
      .from(quotaUsageEvents)
      .where(eq(quotaUsageEvents.tenantId, tenantUuid))
      .orderBy(desc(quotaUsageEvents.createdAt))
      .limit(100);

    return rows.map((row) => this.toUsageEvent(row, actor.tenantId));
  }

  private async consume(input: {
    policy: EffectivePolicy;
    input: QuotaCheckInput;
    tenantUuid: string;
    unit: "requests" | "tokens";
    amount: number;
    limit: number;
  }): Promise<QuotaDecision> {
    const counter = await this.redis.increment({
      keyParts: [
        input.policy.id,
        input.input.action,
        input.policy.subjectType,
        input.policy.subjectId ?? "global",
        input.unit,
      ],
      windowSeconds: input.policy.windowSeconds,
      amount: input.amount,
    });
    const decision: QuotaDecision = {
      policyId: input.policy.id,
      subjectType: input.policy.subjectType,
      unit: input.unit,
      amount: counter.count,
      limit: input.limit,
      remaining: Math.max(input.limit - counter.count, 0),
      resetAt: counter.resetAt.toISOString(),
      windowKey: counter.windowKey,
      allowed: counter.count <= input.limit,
    };
    if (input.policy.subjectId) {
      decision.subjectId = input.policy.subjectId;
    }
    await this.recordUsageEvent({
      input: input.input,
      tenantUuid: input.tenantUuid,
      decision,
      reason: decision.allowed ? "allowed" : "quota_exceeded",
    });
    return decision;
  }

  private async resolvePolicies(
    input: QuotaCheckInput,
    tenantUuid: string,
  ): Promise<EffectivePolicy[]> {
    const rows = await this.db
      .select()
      .from(quotaPolicies)
      .where(
        and(
          eq(quotaPolicies.action, input.action),
          eq(quotaPolicies.enabled, true),
          or(eq(quotaPolicies.tenantId, tenantUuid), isNull(quotaPolicies.tenantId)),
        ),
      );

    const dbPolicies = rows
      .filter((row) => this.policyMatches(row, input))
      .map((row) => this.toEffectivePolicy(row, input.tenantId));
    if (dbPolicies.length > 0) {
      return dbPolicies;
    }

    return this.defaultPolicies(input);
  }

  private policyMatches(
    row: typeof quotaPolicies.$inferSelect,
    input: QuotaCheckInput,
  ): boolean {
    if (row.subjectType === "global") {
      return true;
    }
    if (row.subjectType === "tenant") {
      return !row.subjectId || row.subjectId === input.tenantId;
    }
    if (row.subjectType === "user") {
      return !row.subjectId || row.subjectId === input.userId;
    }
    return false;
  }

  private defaultPolicies(input: QuotaCheckInput): EffectivePolicy[] {
    const requestLimit = this.config.get<number>(
      "app.governance.defaultRequestLimit",
      120,
    );
    const tokenLimit = this.config.get<number>(
      "app.governance.defaultTokenLimit",
      200_000,
    );
    const windowSeconds = this.config.get<number>(
      "app.governance.defaultWindowSeconds",
      60,
    );
    const policies: EffectivePolicy[] = [
      {
        id: `default:${input.action}:tenant`,
        tenantId: input.tenantId,
        name: "Default tenant request limit",
        action: input.action,
        subjectType: "tenant",
        subjectId: input.tenantId,
        windowSeconds,
        requestLimit,
        enabled: true,
      },
      {
        id: `default:${input.action}:user`,
        tenantId: input.tenantId,
        name: "Default user request limit",
        action: input.action,
        subjectType: "user",
        subjectId: input.userId,
        windowSeconds,
        requestLimit: Math.max(Math.floor(requestLimit / 2), 1),
        enabled: true,
      },
    ];
    if (input.tokenCost !== undefined) {
      policies.push({
        id: `default:${input.action}:tenant:tokens`,
        tenantId: input.tenantId,
        name: "Default tenant token limit",
        action: input.action,
        subjectType: "tenant",
        subjectId: input.tenantId,
        windowSeconds,
        tokenLimit,
        enabled: true,
      });
    }
    return policies;
  }

  private async recordUsageEvent(input: {
    input: QuotaCheckInput;
    tenantUuid: string;
    decision?: QuotaDecision;
    reason: string;
  }): Promise<void> {
    const decision = input.decision;
    await this.db.insert(quotaUsageEvents).values({
      tenantId: input.tenantUuid,
      userId: input.input.userId,
      action: input.input.action,
      subjectType: decision?.subjectType ?? "tenant",
      subjectId: decision?.subjectId ?? input.input.tenantId,
      unit: decision?.unit ?? "requests",
      amount: decision?.amount ?? input.input.requestCost ?? 1,
      limit: decision?.limit,
      windowKey: decision?.windowKey,
      allowed: decision?.allowed ?? false,
      reason: input.reason,
      metadata: input.input.metadata ?? {},
    });
  }

  private async getTenantPolicy(
    policyId: string,
    tenantUuid: string,
  ): Promise<typeof quotaPolicies.$inferSelect> {
    const [policy] = await this.db
      .select()
      .from(quotaPolicies)
      .where(
        and(
          eq(quotaPolicies.id, policyId),
          or(eq(quotaPolicies.tenantId, tenantUuid), isNull(quotaPolicies.tenantId)),
        ),
      )
      .limit(1);
    if (!policy) {
      throw new NotFoundException("Quota policy not found");
    }
    return policy;
  }

  private assertPolicyHasLimit(body: CreateQuotaPolicyDto): void {
    if (body.requestLimit === undefined && body.tokenLimit === undefined) {
      throw new ConflictException("Quota policy requires requestLimit or tokenLimit");
    }
  }

  private toEffectivePolicy(
    row: typeof quotaPolicies.$inferSelect,
    externalTenantId: string,
  ): EffectivePolicy {
    const policy: EffectivePolicy = {
      id: row.id,
      name: row.name,
      action: row.action as QuotaAction,
      subjectType: row.subjectType as QuotaSubjectType,
      windowSeconds: row.windowSeconds,
      enabled: row.enabled,
    };
    if (row.tenantId) {
      policy.tenantUuid = row.tenantId;
      policy.tenantId = externalTenantId;
    }
    if (row.subjectId) {
      policy.subjectId = row.subjectId;
    }
    if (row.requestLimit !== null) {
      policy.requestLimit = row.requestLimit;
    }
    if (row.tokenLimit !== null) {
      policy.tokenLimit = row.tokenLimit;
    }
    return policy;
  }

  private toPolicy(
    row: typeof quotaPolicies.$inferSelect,
    externalTenantId: string,
  ): QuotaPolicy {
    const policy: QuotaPolicy = {
      id: row.id,
      name: row.name,
      action: row.action as QuotaAction,
      subjectType: row.subjectType as QuotaSubjectType,
      windowSeconds: row.windowSeconds,
      enabled: row.enabled,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
    if (row.tenantId) {
      policy.tenantId = externalTenantId;
    }
    if (row.subjectId) {
      policy.subjectId = row.subjectId;
    }
    if (row.requestLimit !== null) {
      policy.requestLimit = row.requestLimit;
    }
    if (row.tokenLimit !== null) {
      policy.tokenLimit = row.tokenLimit;
    }
    return policy;
  }

  private toUsageEvent(
    row: typeof quotaUsageEvents.$inferSelect,
    externalTenantId: string,
  ): QuotaUsageEvent {
    const event: QuotaUsageEvent = {
      id: row.id,
      action: row.action as QuotaAction,
      subjectType: row.subjectType as QuotaSubjectType,
      unit: row.unit,
      amount: row.amount,
      allowed: row.allowed,
      reason: row.reason,
      metadata: row.metadata,
      createdAt: row.createdAt.toISOString(),
    };
    if (row.tenantId) {
      event.tenantId = externalTenantId;
    }
    if (row.userId) {
      event.userId = row.userId;
    }
    if (row.subjectId) {
      event.subjectId = row.subjectId;
    }
    if (row.limit !== null) {
      event.limit = row.limit;
    }
    if (row.windowKey) {
      event.windowKey = row.windowKey;
    }
    return event;
  }
}
