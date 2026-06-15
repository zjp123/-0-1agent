import assert from "node:assert/strict";
import test from "node:test";

import { validateToolInput } from "../../src/tools/tool-input.validator.js";
import type { ToolInputSchema } from "../../src/tools/tool.types.js";

const schema: ToolInputSchema = {
  type: "object",
  additionalProperties: false,
  required: ["query", "limit"],
  properties: {
    query: { type: "string" },
    limit: { type: "integer" },
    tags: {
      type: "array",
      items: { type: "string" },
    },
    filters: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: { type: "boolean" },
      },
    },
  },
};

test("validateToolInput accepts matching nested tool input", () => {
  const result = validateToolInput(schema, {
    query: "incident response",
    limit: 5,
    tags: ["ops", "prod"],
    filters: { enabled: true },
  });

  assert.equal(result.ok, true);
});

test("validateToolInput rejects missing required and unknown fields", () => {
  const result = validateToolInput(schema, {
    query: "incident response",
    extra: "not allowed",
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, [
    "$.limit is required",
    "$.extra is not allowed",
  ]);
});

test("validateToolInput validates array item types", () => {
  const result = validateToolInput(schema, {
    query: "incident response",
    limit: 5,
    tags: ["ops", 100],
  });

  assert.equal(result.ok, false);
  assert.deepEqual(result.errors, ["$.tags[1] must be a string"]);
});
