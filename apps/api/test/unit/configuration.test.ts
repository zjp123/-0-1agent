import assert from "node:assert/strict";
import test from "node:test";

import { buildAppConfiguration } from "../../src/common/config/configuration.js";

test("MCP remains disabled when no servers are configured", () => {
  withEnv({ MCP_ENABLED: undefined, MCP_SERVERS: undefined }, () => {
    const config = buildAppConfiguration();
    assert.equal(config.tools.mcpEnabled, false);
    assert.deepEqual(config.tools.mcpServers, []);
  });
});

test("MCP is enabled automatically when servers are configured", () => {
  withEnv(
    {
      MCP_ENABLED: undefined,
      MCP_SERVERS:
        '[{"name":"local_mcp","command":"node","args":["tools/mcp/echo-server.mjs"]}]',
    },
    () => {
      const config = buildAppConfiguration();
      assert.equal(config.tools.mcpEnabled, true);
      assert.equal(config.tools.mcpServers[0]?.name, "local_mcp");
    },
  );
});

test("MCP_ENABLED=false explicitly disables configured servers", () => {
  withEnv(
    {
      MCP_ENABLED: "false",
      MCP_SERVERS:
        '[{"name":"local_mcp","command":"node","args":["tools/mcp/echo-server.mjs"]}]',
    },
    () => {
      const config = buildAppConfiguration();
      assert.equal(config.tools.mcpEnabled, false);
      assert.equal(config.tools.mcpServers.length, 1);
    },
  );
});

function withEnv(values: Record<string, string | undefined>, callback: () => void): void {
  const previous = new Map<string, string | undefined>();
  for (const [key, value] of Object.entries(values)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    callback();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}
