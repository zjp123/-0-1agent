import {
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, desc, eq, sql } from "drizzle-orm";

import { DRIZZLE_DB } from "../db/database.constants.js";
import type { Database } from "../db/database.types.js";
import { IdentityService } from "../db/identity.service.js";
import { messages, sessions } from "../db/schema.js";
import type { RequestUser } from "../auth/auth.types.js";
import type { ModelMessage } from "../model-gateway/model-gateway.types.js";
import type {
  AgentConversation,
  AgentConversationMessage,
  AppendAgentConversationMessageInput,
  CreateAgentConversationInput,
} from "./agent-conversation.types.js";

@Injectable()
export class AgentConversationService {
  constructor(
    @Inject(DRIZZLE_DB) private readonly db: Database,
    @Inject(IdentityService)
    private readonly identity: IdentityService,
  ) {}

  async list(user: RequestUser): Promise<AgentConversation[]> {
    const identity = await this.resolveUser(user);
    const rows = await this.db
      .select({
        session: sessions,
        messageCount: sql<number>`count(${messages.id})::int`,
      })
      .from(sessions)
      .leftJoin(
        messages,
        and(
          eq(messages.tenantId, sessions.tenantId),
          eq(messages.sessionId, sessions.id),
        ),
      )
      .where(
        and(
          eq(sessions.tenantId, identity.tenantId),
          eq(sessions.userId, identity.userId),
        ),
      )
      .groupBy(sessions.id)
      .orderBy(desc(sessions.updatedAt));

    return rows.map((row) =>
      this.toConversation(row.session, user.tenantId, row.messageCount),
    );
  }

  async create(
    input: CreateAgentConversationInput,
  ): Promise<AgentConversation> {
    const identity = await this.identity.resolve({
      tenantExternalId: input.tenantId,
      userExternalId: input.userId,
    });
    const title = this.normalizeTitle(input.title) ?? "New conversation";
    const [row] = await this.db
      .insert(sessions)
      .values({
        tenantId: identity.tenantId,
        userId: identity.userId,
        title,
      })
      .returning();

    if (!row) {
      throw new Error("Failed to create conversation");
    }
    return this.toConversation(row, input.tenantId, 0);
  }

  async getMessages(
    user: RequestUser,
    sessionId: string,
  ): Promise<AgentConversationMessage[]> {
    const identity = await this.resolveUser(user);
    await this.assertConversationAccess(identity, sessionId);

    const rows = await this.db
      .select()
      .from(messages)
      .where(
        and(
          eq(messages.tenantId, identity.tenantId),
          eq(messages.sessionId, sessionId),
        ),
      )
      .orderBy(asc(messages.createdAt));

    return rows.map((row) => this.toMessage(row, user.tenantId));
  }

  async getModelHistory(
    user: RequestUser,
    sessionId: string,
  ): Promise<ModelMessage[]> {
    const rows = await this.getMessages(user, sessionId);
    return rows
      .filter((row) => row.content.trim().length > 0)
      .map((row) => {
        const message: ModelMessage = {
          role: row.role,
          content: row.content,
        };
        if (row.toolCallId) {
          message.toolCallId = row.toolCallId;
        }
        return message;
      });
  }

  async appendMessage(
    input: AppendAgentConversationMessageInput,
  ): Promise<AgentConversationMessage> {
    const identity = await this.identity.resolve({
      tenantExternalId: input.tenantId,
      userExternalId: input.userId,
    });
    await this.assertConversationAccess(identity, input.sessionId);

    const [row] = await this.db
      .insert(messages)
      .values({
        tenantId: identity.tenantId,
        sessionId: input.sessionId,
        role: input.role,
        content: input.content,
        toolCallId: input.toolCallId,
        toolCalls: input.toolCalls,
      })
      .returning();

    if (!row) {
      throw new Error("Failed to append conversation message");
    }

    const title = await this.deriveTitleAfterAppend(identity, input.sessionId);
    await this.db
      .update(sessions)
      .set({
        ...(title ? { title } : {}),
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(sessions.tenantId, identity.tenantId),
          eq(sessions.id, input.sessionId),
        ),
      );

    return this.toMessage(row, input.tenantId);
  }

  async ensureConversation(
    user: RequestUser,
    sessionId: string | undefined,
    titleSeed: string,
  ): Promise<AgentConversation> {
    if (sessionId) {
      const identity = await this.resolveUser(user);
      const row = await this.assertConversationAccess(identity, sessionId);
      return this.toConversation(row, user.tenantId, 0);
    }

    return this.create({
      tenantId: user.tenantId,
      userId: user.userId,
      title: this.titleFromContent(titleSeed),
    });
  }

  async delete(user: RequestUser, sessionId: string): Promise<{ deleted: true }> {
    const identity = await this.resolveUser(user);
    await this.assertConversationAccess(identity, sessionId);
    await this.db
      .delete(messages)
      .where(
        and(
          eq(messages.tenantId, identity.tenantId),
          eq(messages.sessionId, sessionId),
        ),
      );
    await this.db
      .delete(sessions)
      .where(
        and(
          eq(sessions.tenantId, identity.tenantId),
          eq(sessions.id, sessionId),
        ),
      );
    return { deleted: true };
  }

  private async resolveUser(user: RequestUser): Promise<{
    tenantId: string;
    userId: string;
  }> {
    return this.identity.resolve({
      tenantExternalId: user.tenantId,
      userExternalId: user.userId,
    });
  }

  private async assertConversationAccess(
    identity: { tenantId: string; userId: string },
    sessionId: string,
  ): Promise<typeof sessions.$inferSelect> {
    const [row] = await this.db
      .select()
      .from(sessions)
      .where(
        and(
          eq(sessions.tenantId, identity.tenantId),
          eq(sessions.id, sessionId),
        ),
      )
      .limit(1);

    if (!row) {
      throw new NotFoundException("Conversation not found");
    }
    if (row.userId !== identity.userId) {
      throw new ForbiddenException("Conversation belongs to another user");
    }
    return row;
  }

  private async deriveTitleAfterAppend(
    identity: { tenantId: string; userId: string },
    sessionId: string,
  ): Promise<string | undefined> {
    const [session] = await this.db
      .select({
        title: sessions.title,
      })
      .from(sessions)
      .where(
        and(
          eq(sessions.tenantId, identity.tenantId),
          eq(sessions.userId, identity.userId),
          eq(sessions.id, sessionId),
        ),
      )
      .limit(1);

    if (!session || session.title !== "New conversation") {
      return undefined;
    }

    const [firstUserMessage] = await this.db
      .select({ content: messages.content })
      .from(messages)
      .where(
        and(
          eq(messages.tenantId, identity.tenantId),
          eq(messages.sessionId, sessionId),
          eq(messages.role, "user"),
        ),
      )
      .orderBy(asc(messages.createdAt))
      .limit(1);

    return firstUserMessage
      ? this.titleFromContent(firstUserMessage.content)
      : undefined;
  }

  private normalizeTitle(title: string | undefined): string | undefined {
    const normalized = title?.trim().replace(/\s+/g, " ");
    if (!normalized) {
      return undefined;
    }
    return normalized.slice(0, 240);
  }

  private titleFromContent(content: string): string {
    return this.normalizeTitle(content)?.slice(0, 60) ?? "New conversation";
  }

  private toConversation(
    row: typeof sessions.$inferSelect,
    externalTenantId: string,
    messageCount: number,
  ): AgentConversation {
    const conversation: AgentConversation = {
      id: row.id,
      tenantId: externalTenantId,
      title: row.title,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      messageCount,
    };
    return conversation;
  }

  private toMessage(
    row: typeof messages.$inferSelect,
    externalTenantId: string,
  ): AgentConversationMessage {
    const message: AgentConversationMessage = {
      id: row.id,
      tenantId: externalTenantId,
      sessionId: row.sessionId,
      role: row.role,
      content: row.content,
      createdAt: row.createdAt.toISOString(),
    };
    if (row.toolCallId) {
      message.toolCallId = row.toolCallId;
    }
    if (row.toolCalls) {
      message.toolCalls = row.toolCalls;
    }
    return message;
  }
}
