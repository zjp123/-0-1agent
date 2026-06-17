import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeMcpToolName,
  toToolInputSchema,
} from "../../src/tools/mcp/mcp.types.js";

test("normalizeMcpToolName namespaces external MCP tools", () => {
  assert.equal(
    normalizeMcpToolName("local server", "word/count", "mcp"),
    "mcp.word_count",
  );
});

test("toToolInputSchema maps MCP JSON schema to registry schema subset", () => {
  const schema = toToolInputSchema({
    type: "object",
    additionalProperties: false,
    properties: {
      message: { type: "string", description: "Message to echo" },
      count: { type: "integer" },
      tags: { type: "array", items: { type: "string" } },
    },
    required: ["message"],
  });

  assert.equal(schema.type, "object");
  assert.equal(schema.additionalProperties, false);
  assert.deepEqual(schema.required, ["message"]);
  assert.equal(schema.properties.message?.type, "string");
  assert.equal(schema.properties.count?.type, "integer");
  assert.equal(schema.properties.tags?.items?.type, "string");
});
