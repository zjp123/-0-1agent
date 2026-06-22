import http from "node:http";

const port = Number.parseInt(process.env.MCP_HTTP_PORT ?? "8787", 10);

const tools = [
  {
    name: "echo",
    description: "Echo a message from a remote Streamable HTTP MCP server.",
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
];

const server = http.createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/mcp") {
    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not_found" }));
    return;
  }

  const body = await readBody(request);
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    response.writeHead(400, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "invalid_json" }));
    return;
  }

  const result = handleRequest(payload.method, payload.params ?? {});
  response.writeHead(200, { "content-type": "application/json" });
  response.end(JSON.stringify({ jsonrpc: "2.0", id: payload.id, result }));
});

server.listen(port, "127.0.0.1", () => {
  console.error(`HTTP MCP echo server listening on http://127.0.0.1:${port}/mcp`);
});

function handleRequest(method, params) {
  if (method === "initialize") {
    return {
      protocolVersion: "2024-11-05",
      capabilities: { tools: {} },
      serverInfo: {
        name: "enterprise-agent-http-echo-mcp",
        version: "0.1.0",
      },
    };
  }

  if (method === "tools/list") {
    return { tools };
  }

  if (method === "tools/call") {
    const message = String(params.arguments?.message ?? "");
    return {
      content: [{ type: "text", text: `remote echo: ${message}` }],
      structuredContent: { message },
    };
  }

  throw new Error(`Unsupported method: ${method}`);
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      body += chunk;
    });
    request.on("end", () => resolve(body));
    request.on("error", reject);
  });
}
