import assert from "node:assert/strict";
import test from "node:test";

import { CalculatorTool } from "../../src/tools/builtin/calculator.tool.js";
import { ToolRegistryError } from "../../src/tools/tool-registry.errors.js";
import type { ToolExecutionContext } from "../../src/tools/tool.types.js";

const context: ToolExecutionContext = {
  requestId: "test-request",
  permissions: [],
};

test("CalculatorTool evaluates precedence and parentheses", () => {
  const tool = new CalculatorTool();
  const result = tool.execute({ expression: "2 + 3 * (4 - 1)" }, context);

  assert.equal(result.content, "2 + 3 * (4 - 1) = 11");
  assert.deepEqual(result.data, {
    expression: "2 + 3 * (4 - 1)",
    result: 11,
  });
});

test("CalculatorTool rejects division by zero", () => {
  const tool = new CalculatorTool();

  assert.throws(
    () => tool.execute({ expression: "10 / 0" }, context),
    (error) =>
      error instanceof ToolRegistryError &&
      error.code === "TOOL_EXECUTION_FAILED" &&
      error.message === "Division by zero",
  );
});
