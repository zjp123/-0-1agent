import assert from "node:assert/strict";
import test from "node:test";

import {
  resolveModelToolCall,
  toModelSafeToolName,
} from "../../src/agent-runtime/tool-name-alias.js";

test("toModelSafeToolName replaces OpenAI-incompatible separators", () => {
  const aliases = new Map<string, string>();

  const safeName = toModelSafeToolName("github.search/repositories", aliases);

  assert.equal(safeName, "github_search_repositories");
  assert.equal(aliases.get(safeName), "github.search/repositories");
});

test("toModelSafeToolName avoids collisions and resolves model tool calls", () => {
  const aliases = new Map<string, string>();
  const first = toModelSafeToolName("github.search", aliases);
  const second = toModelSafeToolName("github/search", aliases);

  assert.equal(first, "github_search");
  assert.equal(second, "github_search_2");

  const resolved = resolveModelToolCall(
    { id: "call-1", name: second, arguments: "{}" },
    aliases,
  );
  assert.equal(resolved.name, "github/search");
});
