import { createInterface } from "node:readline";

const tools = [
  {
    name: "echo",
    description: "Echo a message from an external MCP stdio server.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        message: {
          type: "string",
          description: "Message to echo.",
        },
      },
      required: ["message"],
    },
  },
  {
    name: "word_count",
    description: "Count words and characters from an external MCP stdio server.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        text: {
          type: "string",
          description: "Text to analyze.",
        },
      },
      required: ["text"],
    },
  },
];

const readline = createInterface({ input: process.stdin });

readline.on("line", (line) => {
  if (!line.trim()) {
    return;
  }

  let request;
  try {
    request = JSON.parse(line);
  } catch {
    return;
  }

  if (!request.id) {
    return;
  }

  try {
    const result = handleRequest(request.method, request.params ?? {});
    respond({ id: request.id, result });
  } catch (error) {
    respond({
      id: request.id,
      error: {
        code: -32000,
        message: error instanceof Error ? error.message : "MCP tool failed",
      },
    });
  }
});

function handleRequest(method, params) {
  if (method === "initialize") {
    return {
      protocolVersion: "2024-11-05",
      capabilities: {
        tools: {},
      },
      serverInfo: {
        name: "enterprise-agent-echo-mcp",
        version: "0.1.0",
      },
    };
  }

  if (method === "tools/list") {
    return { tools };
  }

  if (method === "tools/call") {
    return callTool(String(params.name), params.arguments ?? {});
  }

  throw new Error(`Unsupported method: ${method}`);
}

function callTool(name, args) {
  if (name === "echo") {
    const message = String(args.message ?? "");
    return {
      content: [{ type: "text", text: `echo: ${message}` }],
      structuredContent: { message },
    };
  }

  if (name === "word_count") {
    const text = String(args.text ?? "");
    const words = text.trim() ? text.trim().split(/\s+/).length : 0;
    const characters = text.length;
    return {
      content: [{ type: "text", text: `${words} words, ${characters} characters` }],
      structuredContent: { words, characters },
    };
  }

  throw new Error(`Unknown tool: ${name}`);
}

function respond(payload) {
  process.stdout.write(`${JSON.stringify({ jsonrpc: "2.0", ...payload })}\n`);
}
