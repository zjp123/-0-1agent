import { Inject, Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import net from "node:net";

export type RateLimitIncrementResult = {
  count: number;
  resetAt: Date;
  windowKey: string;
};

@Injectable()
export class RedisRateLimitStore {
  private readonly redisUrl: URL;
  private readonly keyPrefix: string;

  constructor(@Inject(ConfigService) config: ConfigService) {
    this.redisUrl = new URL(
      config.get<string>("app.redis.url", "redis://localhost:6379"),
    );
    this.keyPrefix = config.get<string>(
      "app.governance.rateLimitKeyPrefix",
      "enterprise-agent:rate-limit",
    );
  }

  async increment(input: {
    keyParts: string[];
    windowSeconds: number;
    amount: number;
  }): Promise<RateLimitIncrementResult> {
    const windowId = Math.floor(Date.now() / (input.windowSeconds * 1_000));
    const windowKey = [
      this.keyPrefix,
      ...input.keyParts.map((part) => this.sanitize(part)),
      String(windowId),
    ].join(":");
    const response = await this.command(
      "INCRBY",
      windowKey,
      String(input.amount),
    );
    const count = typeof response === "number" ? response : input.amount;
    if (count === input.amount) {
      await this.command("EXPIRE", windowKey, String(input.windowSeconds));
    }

    return {
      count,
      resetAt: new Date((windowId + 1) * input.windowSeconds * 1_000),
      windowKey,
    };
  }

  private sanitize(value: string): string {
    return value.replace(/[^a-zA-Z0-9._-]/g, "_");
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
