import { Injectable } from "@nestjs/common";

import type {
  ToolExecutionContext,
  ToolExecutionResult,
  ToolHandler,
} from "../tool.types.js";
import { ToolRegistryError } from "../tool-registry.errors.js";

@Injectable()
export class CalculatorTool implements ToolHandler {
  readonly definition = {
    name: "calculator",
    description: "Evaluate a basic arithmetic expression with a safe parser.",
    source: "builtin" as const,
    inputSchema: {
      type: "object" as const,
      additionalProperties: false,
      properties: {
        expression: {
          type: "string" as const,
          description: "Arithmetic expression using numbers, +, -, *, /, %, parentheses.",
        },
      },
      required: ["expression"],
    },
    timeoutMs: 1_000,
    maxResultLength: 1_000,
    requiredPermissions: [],
  };

  execute(
    input: Record<string, unknown>,
    _context: ToolExecutionContext,
  ): ToolExecutionResult {
    const expression = String(input.expression);
    const result = new ArithmeticParser(expression).parse();

    return {
      content: `${expression} = ${result}`,
      data: {
        expression,
        result,
      },
    };
  }
}

class ArithmeticParser {
  private index = 0;

  constructor(private readonly expression: string) {}

  parse(): number {
    const value = this.parseExpression();
    this.skipWhitespace();
    if (this.index !== this.expression.length) {
      throw new ToolRegistryError("Unexpected token in expression", "TOOL_EXECUTION_FAILED", {
        index: this.index,
      });
    }
    return value;
  }

  private parseExpression(): number {
    let value = this.parseTerm();

    while (true) {
      this.skipWhitespace();
      if (this.match("+")) {
        value += this.parseTerm();
      } else if (this.match("-")) {
        value -= this.parseTerm();
      } else {
        return value;
      }
    }
  }

  private parseTerm(): number {
    let value = this.parseFactor();

    while (true) {
      this.skipWhitespace();
      if (this.match("*")) {
        value *= this.parseFactor();
      } else if (this.match("/")) {
        const divisor = this.parseFactor();
        if (divisor === 0) {
          throw new ToolRegistryError("Division by zero", "TOOL_EXECUTION_FAILED");
        }
        value /= divisor;
      } else if (this.match("%")) {
        const divisor = this.parseFactor();
        if (divisor === 0) {
          throw new ToolRegistryError("Modulo by zero", "TOOL_EXECUTION_FAILED");
        }
        value %= divisor;
      } else {
        return value;
      }
    }
  }

  private parseFactor(): number {
    this.skipWhitespace();

    if (this.match("+")) {
      return this.parseFactor();
    }
    if (this.match("-")) {
      return -this.parseFactor();
    }
    if (this.match("(")) {
      const value = this.parseExpression();
      this.skipWhitespace();
      if (!this.match(")")) {
        throw new ToolRegistryError("Missing closing parenthesis", "TOOL_EXECUTION_FAILED");
      }
      return value;
    }

    return this.parseNumber();
  }

  private parseNumber(): number {
    this.skipWhitespace();
    const start = this.index;

    while (this.index < this.expression.length && /[0-9.]/.test(this.expression[this.index] ?? "")) {
      this.index += 1;
    }

    if (start === this.index) {
      throw new ToolRegistryError("Expected number", "TOOL_EXECUTION_FAILED", {
        index: this.index,
      });
    }

    const raw = this.expression.slice(start, this.index);
    if (!/^\d+(\.\d+)?$/.test(raw)) {
      throw new ToolRegistryError("Invalid number", "TOOL_EXECUTION_FAILED", {
        value: raw,
      });
    }

    return Number(raw);
  }

  private match(token: string): boolean {
    if (this.expression[this.index] !== token) {
      return false;
    }
    this.index += 1;
    return true;
  }

  private skipWhitespace(): void {
    while (this.index < this.expression.length && /\s/.test(this.expression[this.index] ?? "")) {
      this.index += 1;
    }
  }
}
