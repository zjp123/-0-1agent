import { Injectable, OnModuleDestroy } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import net from "node:net";

export type IndexingQueueMessage = {
  jobId: string;
  tenantId: string;
};

@Injectable()
export class RedisIndexingQueue implements OnModuleDestroy {
  private readonly redisUrl: URL;
  private readonly queueName: string;
  private readonly brpopTimeoutSeconds: number;
  private closed = false;

  constructor(config: ConfigService) {
    this.redisUrl = new URL(
      config.get<string>("app.redis.url", "redis://localhost:6379"),
    );
    this.queueName = config.get<string>(
      "app.redis.indexingQueue",
      "enterprise-agent:indexing-jobs",
    );
    this.brpopTimeoutSeconds = config.get<number>(
      "app.redis.brpopTimeoutSeconds",
      5,
    );
  }

  onModuleDestroy(): void {
    this.closed = true;
  }

  getQueueName(): string {
    return this.queueName;
  }

  isClosed(): boolean {
    return this.closed;
  }

  async enqueue(message: IndexingQueueMessage): Promise<void> {
    await this.command(
      "LPUSH",
      this.queueName,
      JSON.stringify(message),
    );
  }

  async dequeue(): Promise<IndexingQueueMessage | undefined> {
    const response = await this.command(
      "BRPOP",
      this.queueName,
      String(this.brpopTimeoutSeconds),
    );
    if (!Array.isArray(response) || response.length < 2) {
      return undefined;
    }

    const payload = response[1];
    if (typeof payload !== "string") {
      return undefined;
    }

    const parsed = JSON.parse(payload) as Partial<IndexingQueueMessage>;
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
