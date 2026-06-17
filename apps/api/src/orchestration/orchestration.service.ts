import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { AgentRuntimeService } from "../agent-runtime/agent-runtime.service.js";
import type { AgentRunOptions } from "../agent-runtime/agent-runtime.types.js";
import type { RequestUser } from "../auth/auth.types.js";
import { DRIZZLE_DB } from "../db/database.constants.js";
import type { Database } from "../db/database.types.js";
import { IdentityService } from "../db/identity.service.js";
import {
  orchestrationHandoffs,
  orchestrationParticipants,
  orchestrationRuns,
} from "../db/schema.js";
import { ObservabilityService } from "../observability/observability.service.js";
import type { CreateParticipantDto } from "./dto/create-participant.dto.js";
import type { RunOrchestrationDto } from "./dto/run-orchestration.dto.js";
import type {
  OrchestrationHandoff,
  OrchestrationParticipant,
  OrchestrationRun,
  OrchestrationRunStatus,
  OrchestrationStatus,
} from "./orchestration.types.js";

@Injectable()
export class OrchestrationService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    @Inject(IdentityService)
    private readonly identity: IdentityService,
    @Inject(AgentRuntimeService)
    private readonly agentRuntime: AgentRuntimeService,
    @Inject(ObservabilityService)
    private readonly observability: ObservabilityService,
  ) {}

  getStatus(): OrchestrationStatus {
    return {
      enabled: true,
      store: "postgres",
      strategies: ["sequential_handoff"],
      capabilities: [
        "participant registry",
        "coordinator / worker / reviewer roles",
        "persistent orchestration runs",
        "handoff history",
        "agent runtime delegation",
        "trace events",
      ],
    };
  }

  async listParticipants(
    actor: RequestUser,
  ): Promise<OrchestrationParticipant[]> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    const rows = await this.db
      .select()
      .from(orchestrationParticipants)
      .where(eq(orchestrationParticipants.tenantId, tenantUuid))
      .orderBy(desc(orchestrationParticipants.createdAt));

    return rows.map((row) => this.toParticipant(row, actor.tenantId));
  }

  async createParticipant(
    body: CreateParticipantDto,
    actor: RequestUser,
  ): Promise<OrchestrationParticipant> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    const [created] = await this.db
      .insert(orchestrationParticipants)
      .values({
        tenantId: tenantUuid,
        name: body.name.trim(),
        role: body.role,
        systemPrompt: body.systemPrompt,
        model: body.model,
        enabled: body.enabled ?? true,
        maxSteps: body.maxSteps ?? 4,
        maxDurationMs: body.maxDurationMs ?? 60_000,
        metadata: body.metadata ?? {},
      })
      .returning();
    if (!created) {
      throw new Error("Failed to create orchestration participant");
    }

    return this.toParticipant(created, actor.tenantId);
  }

  async listRuns(actor: RequestUser): Promise<OrchestrationRun[]> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    const rows = await this.db
      .select()
      .from(orchestrationRuns)
      .where(eq(orchestrationRuns.tenantId, tenantUuid))
      .orderBy(desc(orchestrationRuns.createdAt))
      .limit(100);

    const result: OrchestrationRun[] = [];
    for (const row of rows) {
      const handoffs = await this.loadHandoffs(tenantUuid, row.id, actor.tenantId);
      result.push(this.toRun(row, actor.tenantId, handoffs));
    }
    return result;
  }

  async getRun(
    runId: string,
    actor: RequestUser,
  ): Promise<OrchestrationRun> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    const run = await this.getTenantRun(tenantUuid, runId);
    const handoffs = await this.loadHandoffs(tenantUuid, run.id, actor.tenantId);
    return this.toRun(run, actor.tenantId, handoffs);
  }

  async run(
    body: RunOrchestrationDto,
    actor: RequestUser,
  ): Promise<OrchestrationRun> {
    const tenantUuid = await this.identity.ensureTenant(actor.tenantId);
    const participants = await this.loadParticipants(
      tenantUuid,
      body.participantIds,
    );
    const participantById = new Map(participants.map((item) => [item.id, item]));
    const orderedParticipants = body.participantIds.map((participantId) => {
      const participant = participantById.get(participantId);
      if (!participant || !participant.enabled) {
        throw new NotFoundException("Orchestration participant not found");
      }
      return participant;
    });

    const now = new Date();
    const [createdRun] = await this.db
      .insert(orchestrationRuns)
      .values({
        tenantId: tenantUuid,
        createdBy: actor.userId,
        requestId: body.requestId,
        objective: body.objective,
        strategy: "sequential_handoff",
        status: "running",
        participantIds: body.participantIds,
        metadata: body.metadata ?? {},
        startedAt: now,
      })
      .returning();
    if (!createdRun) {
      throw new Error("Failed to create orchestration run");
    }

    this.recordTrace(actor, body.requestId, "orchestration.run.started", {
      runId: createdRun.id,
      participantCount: orderedParticipants.length,
      strategy: "sequential_handoff",
      hasWorkflow: Boolean(body.workflowId),
      correlationId: body.correlationId ?? null,
    });

    let status: OrchestrationRunStatus = "completed";
    let finalAnswer = body.objective;
    let error: string | undefined;
    let previousParticipantId: string | undefined;

    for (const [index, participant] of orderedParticipants.entries()) {
      const stepOrder = index + 1;
      const handoffInput = this.buildHandoffInput({
        objective: body.objective,
        previousOutput: finalAnswer,
        participantRole: participant.role,
        stepOrder,
        totalSteps: orderedParticipants.length,
      });
      const handoffStartedAt = new Date();
      const [handoff] = await this.db
        .insert(orchestrationHandoffs)
        .values({
          tenantId: tenantUuid,
          runId: createdRun.id,
          fromParticipantId: previousParticipantId,
          toParticipantId: participant.id,
          stepOrder,
          status: "running",
          input: handoffInput,
          startedAt: handoffStartedAt,
        })
        .returning();
      if (!handoff) {
        throw new Error("Failed to create orchestration handoff");
      }

      const agentRequestId = randomUUID();
      this.recordTrace(actor, body.requestId, "orchestration.handoff.started", {
        runId: createdRun.id,
        handoffId: handoff.id,
        stepOrder,
        participantId: participant.id,
        participantRole: participant.role,
        agentRequestId,
      });

      try {
        const agentOptions: AgentRunOptions = {
          requestId: agentRequestId,
          userId: actor.userId,
          tenantId: actor.tenantId,
          permissions: actor.permissions,
          userMessage: handoffInput,
          maxSteps: participant.maxSteps,
          maxDurationMs: participant.maxDurationMs,
        };
        if (participant.systemPrompt) {
          agentOptions.systemPrompt = participant.systemPrompt;
        }
        if (participant.model) {
          agentOptions.model = participant.model;
        }
        const agentResult = await this.agentRuntime.run(agentOptions);
        finalAnswer = agentResult.answer;
        const completedAt = new Date();
        await this.db
          .update(orchestrationHandoffs)
          .set({
            status: "completed",
            output: agentResult.answer,
            agentRequestId,
            usage: agentResult.usage,
            completedAt,
            updatedAt: completedAt,
          })
          .where(eq(orchestrationHandoffs.id, handoff.id));

        this.recordTrace(actor, body.requestId, "orchestration.handoff.completed", {
          runId: createdRun.id,
          handoffId: handoff.id,
          stepOrder,
          participantId: participant.id,
          participantRole: participant.role,
          agentRequestId,
          stopReason: agentResult.stopReason,
          totalTokens: agentResult.usage.totalTokens,
        });
        previousParticipantId = participant.id;
      } catch (caught) {
        status = "failed";
        error = caught instanceof Error ? caught.message : "Orchestration failed";
        const failedAt = new Date();
        await this.db
          .update(orchestrationHandoffs)
          .set({
            status: "failed",
            error,
            agentRequestId,
            completedAt: failedAt,
            updatedAt: failedAt,
          })
          .where(eq(orchestrationHandoffs.id, handoff.id));
        this.recordTrace(actor, body.requestId, "orchestration.handoff.failed", {
          runId: createdRun.id,
          handoffId: handoff.id,
          stepOrder,
          participantId: participant.id,
          participantRole: participant.role,
          agentRequestId,
        });
        break;
      }
    }

    const finishedAt = new Date();
    const updateValues: Partial<typeof orchestrationRuns.$inferInsert> = {
      status,
      finalAnswer,
      completedAt: finishedAt,
      updatedAt: finishedAt,
    };
    if (error) {
      updateValues.error = error;
    }
    const [updatedRun] = await this.db
      .update(orchestrationRuns)
      .set(updateValues)
      .where(
        and(
          eq(orchestrationRuns.tenantId, tenantUuid),
          eq(orchestrationRuns.id, createdRun.id),
        ),
      )
      .returning();
    if (!updatedRun) {
      throw new Error("Failed to update orchestration run");
    }

    this.recordTrace(actor, body.requestId, "orchestration.run.completed", {
      runId: updatedRun.id,
      status,
      participantCount: orderedParticipants.length,
      hasError: Boolean(error),
    });

    const handoffs = await this.loadHandoffs(
      tenantUuid,
      updatedRun.id,
      actor.tenantId,
    );
    return this.toRun(updatedRun, actor.tenantId, handoffs);
  }

  private async loadParticipants(
    tenantUuid: string,
    participantIds: string[],
  ): Promise<Array<typeof orchestrationParticipants.$inferSelect>> {
    if (participantIds.length === 0) {
      return [];
    }
    return this.db
      .select()
      .from(orchestrationParticipants)
      .where(
        and(
          eq(orchestrationParticipants.tenantId, tenantUuid),
          inArray(orchestrationParticipants.id, participantIds),
        ),
      );
  }

  private async getTenantRun(
    tenantUuid: string,
    runId: string,
  ): Promise<typeof orchestrationRuns.$inferSelect> {
    const [run] = await this.db
      .select()
      .from(orchestrationRuns)
      .where(
        and(
          eq(orchestrationRuns.tenantId, tenantUuid),
          eq(orchestrationRuns.id, runId),
        ),
      )
      .limit(1);
    if (!run) {
      throw new NotFoundException("Orchestration run not found");
    }
    return run;
  }

  private async loadHandoffs(
    tenantUuid: string,
    runId: string,
    externalTenantId: string,
  ): Promise<OrchestrationHandoff[]> {
    const rows = await this.db
      .select()
      .from(orchestrationHandoffs)
      .where(
        and(
          eq(orchestrationHandoffs.tenantId, tenantUuid),
          eq(orchestrationHandoffs.runId, runId),
        ),
      )
      .orderBy(asc(orchestrationHandoffs.stepOrder));
    return rows.map((row) => this.toHandoff(row, externalTenantId));
  }

  private buildHandoffInput(input: {
    objective: string;
    previousOutput: string;
    participantRole: string;
    stepOrder: number;
    totalSteps: number;
  }): string {
    return [
      `Objective: ${input.objective}`,
      `Current participant role: ${input.participantRole}`,
      `Handoff step: ${input.stepOrder}/${input.totalSteps}`,
      "Previous output:",
      input.previousOutput,
      "Produce the best next contribution for this role. If this is the final reviewer step, return a concise final answer.",
    ].join("\n\n");
  }

  private recordTrace(
    actor: RequestUser,
    requestId: string,
    type: Parameters<ObservabilityService["record"]>[0]["type"],
    attributes: Parameters<ObservabilityService["record"]>[0]["attributes"],
  ): void {
    this.observability.record({
      tenantId: actor.tenantId,
      userId: actor.userId,
      requestId,
      type,
      attributes,
    });
  }

  private toParticipant(
    row: typeof orchestrationParticipants.$inferSelect,
    externalTenantId: string,
  ): OrchestrationParticipant {
    const participant: OrchestrationParticipant = {
      id: row.id,
      tenantId: externalTenantId,
      name: row.name,
      role: row.role as OrchestrationParticipant["role"],
      enabled: row.enabled,
      maxSteps: row.maxSteps,
      maxDurationMs: row.maxDurationMs,
      metadata: row.metadata,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
    if (row.systemPrompt) {
      participant.systemPrompt = row.systemPrompt;
    }
    if (row.model) {
      participant.model = row.model;
    }
    return participant;
  }

  private toRun(
    row: typeof orchestrationRuns.$inferSelect,
    externalTenantId: string,
    handoffs: OrchestrationHandoff[],
  ): OrchestrationRun {
    const run: OrchestrationRun = {
      id: row.id,
      tenantId: externalTenantId,
      createdBy: row.createdBy,
      requestId: row.requestId,
      objective: row.objective,
      strategy: "sequential_handoff",
      status: row.status as OrchestrationRunStatus,
      participantIds: row.participantIds,
      metadata: row.metadata,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      handoffs,
    };
    if (row.finalAnswer) {
      run.finalAnswer = row.finalAnswer;
    }
    if (row.error) {
      run.error = row.error;
    }
    if (row.startedAt) {
      run.startedAt = row.startedAt.toISOString();
    }
    if (row.completedAt) {
      run.completedAt = row.completedAt.toISOString();
    }
    return run;
  }

  private toHandoff(
    row: typeof orchestrationHandoffs.$inferSelect,
    externalTenantId: string,
  ): OrchestrationHandoff {
    const handoff: OrchestrationHandoff = {
      id: row.id,
      tenantId: externalTenantId,
      runId: row.runId,
      toParticipantId: row.toParticipantId,
      stepOrder: row.stepOrder,
      status: row.status as OrchestrationHandoff["status"],
      input: row.input,
      usage: row.usage,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
    if (row.fromParticipantId) {
      handoff.fromParticipantId = row.fromParticipantId;
    }
    if (row.output) {
      handoff.output = row.output;
    }
    if (row.error) {
      handoff.error = row.error;
    }
    if (row.agentRequestId) {
      handoff.agentRequestId = row.agentRequestId;
    }
    if (row.startedAt) {
      handoff.startedAt = row.startedAt.toISOString();
    }
    if (row.completedAt) {
      handoff.completedAt = row.completedAt.toISOString();
    }
    return handoff;
  }
}
