import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import net from "node:net";

export type IndexingQueueMessage = {
  jobId: string;
  tenantId: string;
  messageId?: string;
};

export type QueueDepth = {
  queue: string;
  pending: number;
  consumerPending: number;
  delayed: number;
  deadLetter: number;
};

@Injectable()
export class RedisIndexingQueue implements OnModuleDestroy {
  private readonly redisUrl: URL;
  private readonly queueName: string;
  private readonly retryQueueName: string;
  private readonly deadLetterQueueName: string;
  private readonly consumerGroup: string;
  private readonly blockMs: number;
  private closed = false;

  constructor(config: ConfigService) {
    this.redisUrl = new URL(
      config.get<string>("app.redis.url", "redis://localhost:6379"),
    );
    this.queueName = config.get<string>(
      "app.redis.indexingQueue",
      "enterprise-agent:indexing-jobs",
    );
    this.retryQueueName = `${this.queueName}:retry`;
    this.deadLetterQueueName = `${this.queueName}:dead-letter`;
    this.consumerGroup = config.get<string>(
      "app.redis.indexingConsumerGroup",
      "enterprise-agent-indexers",
    );
    this.blockMs =
      config.get<number>("app.redis.blockTimeoutSeconds", 5) * 1_000;
  }

  onModuleDestroy(): void {
    this.closed = true;
  }

  getQueueName(): string {
    return this.queueName;
  }

  getDeadLetterQueueName(): string {
    return this.deadLetterQueueName;
  }

  getRetryQueueName(): string {
    return this.retryQueueName;
  }

  getConsumerGroup(): string {
    return this.consumerGroup;
  }

  isClosed(): boolean {
    return this.closed;
  }

  async enqueue(message: IndexingQueueMessage): Promise<void> {
    await this.command(
      "XADD",
      this.queueName,
      "*",
      "payload",
      this.serializeMessage(message),
    );
  }

  async enqueueDelayed(
    message: IndexingQueueMessage,
    delayMs: number,
  ): Promise<void> {
    const score = Date.now() + delayMs;
    await this.command(
      "ZADD",
      this.retryQueueName,
      String(score),
      this.serializeMessage(message),
    );
  }

  async deadLetter(message: IndexingQueueMessage): Promise<void> {
    await this.command(
      "XADD",
      this.deadLetterQueueName,
      "*",
      "payload",
      this.serializeMessage(message),
    );
  }

  async ensureConsumerGroup(): Promise<void> {
    try {
      await this.command(
        "XGROUP",
        "CREATE",
        this.queueName,
        this.consumerGroup,
        "0",
        "MKSTREAM",
      );
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.toUpperCase().includes("BUSYGROUP")
      ) {
        return;
      }
      throw error;
    }
  }

  async depth(): Promise<QueueDepth> {
    const [pending, consumerPending, delayed, deadLetter] = await Promise.all([
      this.length(this.queueName),
      this.pendingCount(),
      this.sortedSetLength(this.retryQueueName),
      this.length(this.deadLetterQueueName),
    ]);
    return {
      queue: this.queueName,
      pending,
      consumerPending,
      delayed,
      deadLetter,
    };
  }

  async listDeadLetters(limit: number): Promise<IndexingQueueMessage[]> {
    const response = await this.command(
      "XREVRANGE",
      this.deadLetterQueueName,
      "+",
      "-",
      "COUNT",
      String(limit),
    );
    if (!Array.isArray(response)) {
      return [];
    }
    return response
      .map((item) => this.parseStreamEntry(item))
      .filter((item): item is IndexingQueueMessage => Boolean(item));
  }

  async dequeue(consumerName: string): Promise<IndexingQueueMessage | undefined> {
    await this.ensureConsumerGroup();
    const response = await this.command(
      "XREADGROUP",
      "GROUP",
      this.consumerGroup,
      consumerName,
      "COUNT",
      "1",
      "BLOCK",
      String(this.blockMs),
      "STREAMS",
      this.queueName,
      ">",
    );
    const message = this.parseReadGroupResponse(response);
    return message;
  }

  async promoteDueDelayed(limit: number): Promise<number> {
    const response = await this.command(
      "ZRANGEBYSCORE",
      this.retryQueueName,
      "-inf",
      String(Date.now()),
      "LIMIT",
      "0",
      String(limit),
    );
    if (!Array.isArray(response) || response.length === 0) {
      return 0;
    }

    let promoted = 0;
    for (const payload of response) {
      if (typeof payload !== "string") {
        continue;
      }
      const message = this.parseMessage(payload);
      if (!message) {
        await this.command("ZREM", this.retryQueueName, payload);
        continue;
      }
      await this.enqueue(message);
      await this.command("ZREM", this.retryQueueName, payload);
      promoted += 1;
    }
    return promoted;
  }

  async claimPending(
    consumerName: string,
    minIdleMs: number,
    count: number,
  ): Promise<IndexingQueueMessage[]> {
    await this.ensureConsumerGroup();
    const response = await this.command(
      "XAUTOCLAIM",
      this.queueName,
      this.consumerGroup,
      consumerName,
      String(minIdleMs),
      "0-0",
      "COUNT",
      String(count),
    );
    return this.parseAutoClaimResponse(response);
  }

  async ack(message: IndexingQueueMessage): Promise<void> {
    if (!message.messageId) {
      return;
    }
    await this.command(
      "XACK",
      this.queueName,
      this.consumerGroup,
      message.messageId,
    );
  }

  private parseAutoClaimResponse(response: unknown): IndexingQueueMessage[] {
    if (!Array.isArray(response) || response.length < 2) {
      return [];
    }

    const entries = response[1];
    if (!Array.isArray(entries) || entries.length === 0) {
      return [];
    }

    return entries
      .map((item) => this.parseStreamEntry(item))
      .filter((item): item is IndexingQueueMessage => Boolean(item));
  }

  private parseReadGroupResponse(response: unknown): IndexingQueueMessage | undefined {
    if (!Array.isArray(response) || response.length === 0) {
      return undefined;
    }

    const stream = response[0];
    if (!Array.isArray(stream) || stream.length < 2) {
      return undefined;
    }

    const entries = stream[1];
    if (!Array.isArray(entries) || entries.length === 0) {
      return undefined;
    }

    return this.parseStreamEntry(entries[0]);
  }

  private async length(queueName: string): Promise<number> {
    const response = await this.command("XLEN", queueName);
    return typeof response === "number" ? response : 0;
  }

  private async sortedSetLength(queueName: string): Promise<number> {
    const response = await this.command("ZCARD", queueName);
    return typeof response === "number" ? response : 0;
  }

  private async pendingCount(): Promise<number> {
    await this.ensureConsumerGroup();
    const response = await this.command(
      "XPENDING",
      this.queueName,
      this.consumerGroup,
    );
    if (!Array.isArray(response) || typeof response[0] !== "number") {
      return 0;
    }
    return response[0];
  }

  private parseStreamEntry(entry: unknown): IndexingQueueMessage | undefined {
    if (!Array.isArray(entry) || entry.length < 2) {
      return undefined;
    }

    const messageId = entry[0];
    const fields = entry[1];
    if (typeof messageId !== "string" || !Array.isArray(fields)) {
      return undefined;
    }

    let payload: string | undefined;
    for (let index = 0; index < fields.length; index += 2) {
      if (fields[index] === "payload" && typeof fields[index + 1] === "string") {
        payload = fields[index + 1];
        break;
      }
    }
    if (!payload) {
      return undefined;
    }

    const message = this.parseMessage(payload);
    if (!message) {
      return undefined;
    }
    return {
      ...message,
      messageId,
    };
  }

  private serializeMessage(message: IndexingQueueMessage): string {
    return JSON.stringify({
      jobId: message.jobId,
      tenantId: message.tenantId,
    });
  }

  private parseMessage(payload: string): IndexingQueueMessage | undefined {
    let parsed: Partial<IndexingQueueMessage>;
    try {
      parsed = JSON.parse(payload) as Partial<IndexingQueueMessage>;
    } catch {
      return undefined;
    }
    if (typeof parsed.jobId !== "string" || typeof parsed.tenantId !== "string") {
      return undefined;
    }
    return {
      jobId: parsed.jobId,
      tenantId: parsed.tenantId,
    };
  }

  private async command(...parts: string[]): Promise<unknown> {
    const socket = await this.connect();
    try {
      socket.write(this.serialize(parts));
      const chunks: Buffer[] = [];
      return await new Promise((resolve, reject) => {
        socket.on("data", (chunk: Buffer) => {
          chunks.push(chunk);
          try {
            const parsed = this.parse(Buffer.concat(chunks).toString("utf8"));
            resolve(parsed);
            socket.end();
          } catch (error) {
            if (!this.isIncompleteResponse(error)) {
              reject(error);
              socket.destroy();
            }
          }
        });
        socket.on("error", reject);
        socket.on("end", () => {
          if (chunks.length === 0) {
            resolve(undefined);
          }
        });
      });
    } finally {
      socket.destroy();
    }
  }

  private connect(): Promise<net.Socket> {
    const port = this.redisUrl.port ? Number.parseInt(this.redisUrl.port, 10) : 6379;
    const host = this.redisUrl.hostname || "localhost";

    return new Promise((resolve, reject) => {
      const socket = net.createConnection({ host, port }, () => {
        resolve(socket);
      });
      socket.on("error", reject);
    });
  }

  private serialize(parts: string[]): string {
    return [
      `*${parts.length}`,
      ...parts.flatMap((part) => [`$${Buffer.byteLength(part)}`, part]),
      "",
    ].join("\r\n");
  }

  private parse(input: string): unknown {
    const parsed = this.parseAt(input, 0);
    return parsed.value;
  }

  private parseAt(
    input: string,
    offset: number,
  ): { value: unknown; nextOffset: number } {
    const type = input[offset];
    if (!type) {
      throw new Error("Incomplete Redis response");
    }

    if (type === "+") {
      const end = this.lineEnd(input, offset);
      return { value: input.slice(offset + 1, end), nextOffset: end + 2 };
    }
    if (type === "-") {
      const end = this.lineEnd(input, offset);
      throw new Error(input.slice(offset + 1, end));
    }
    if (type === ":") {
      const end = this.lineEnd(input, offset);
      return {
        value: Number.parseInt(input.slice(offset + 1, end), 10),
        nextOffset: end + 2,
      };
    }
    if (type === "$") {
      return this.parseBulkString(input, offset);
    }
    if (type === "*") {
      return this.parseArray(input, offset);
    }

    throw new Error(`Unsupported Redis response type: ${type}`);
  }

  private parseBulkString(
    input: string,
    offset: number,
  ): { value: string | null; nextOffset: number } {
    const end = this.lineEnd(input, offset);
    const length = Number.parseInt(input.slice(offset + 1, end), 10);
    if (length === -1) {
      return { value: null, nextOffset: end + 2 };
    }

    const start = end + 2;
    const nextOffset = start + length + 2;
    if (input.length < nextOffset) {
      throw new Error("Incomplete Redis response");
    }
    return {
      value: input.slice(start, start + length),
      nextOffset,
    };
  }

  private parseArray(
    input: string,
    offset: number,
  ): { value: unknown[] | null; nextOffset: number } {
    const end = this.lineEnd(input, offset);
    const length = Number.parseInt(input.slice(offset + 1, end), 10);
    if (length === -1) {
      return { value: null, nextOffset: end + 2 };
    }

    const values: unknown[] = [];
    let nextOffset = end + 2;
    for (let index = 0; index < length; index += 1) {
      const parsed = this.parseAt(input, nextOffset);
      values.push(parsed.value);
      nextOffset = parsed.nextOffset;
    }
    return { value: values, nextOffset };
  }

  private lineEnd(input: string, offset: number): number {
    const end = input.indexOf("\r\n", offset);
    if (end === -1) {
      throw new Error("Incomplete Redis response");
    }
    return end;
  }

  private isIncompleteResponse(error: unknown): boolean {
    return error instanceof Error && error.message === "Incomplete Redis response";
  }
}
