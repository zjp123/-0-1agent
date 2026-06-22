# MCP External Tools

## 目标

将 Tool Registry 从“仅内置工具”升级为可接入真实外部 MCP stdio server 的工具系统。

MCP 工具接入后，Agent Runtime、Web Tools 页面、Quota、权限检查、schema 校验、timeout、结果截断和 audit response 都复用现有 Tool Registry 链路。

## 已实现能力

- MCP stdio JSON-RPC client。
- MCP `initialize`。
- MCP `tools/list` 工具发现。
- MCP `tools/call` 工具执行。
- MCP JSON Schema 子集映射到现有 `ToolInputSchema`。
- MCP 工具命名空间隔离，例如 `local_mcp.echo`。
- MCP server 状态进入 `GET /api/agent/capabilities`。
- MCP 外部工具进入 `GET /api/tools`。
- MCP 外部工具可通过 `POST /api/tools/execute` 执行。
- MCP 子进程最小环境变量传递，避免默认泄露 API 进程 secrets。
- MCP server 可通过 DB + Web/API 动态配置、审批、启停和 reload。

## 配置

默认行为：

- `MCP_SERVERS` 为空：不启动任何 MCP server。
- `MCP_SERVERS` 有配置：自动启用 MCP。
- `MCP_ENABLED=false`：强制关闭，即使 `MCP_SERVERS` 或 DB 有配置也不启动。
- `MCP_ENABLED=true`：显式开启。

本地示例：

```env
MCP_CONNECT_TIMEOUT_MS=10000
MCP_TOOL_TIMEOUT_MS=15000
MCP_SERVERS=[{"name":"local_mcp","command":"node","args":["tools/mcp/echo-server.mjs"],"toolNamePrefix":"local_mcp","riskLevel":"low","requiredPermissions":["tools:execute"]}]
```

## 动态管理

动态 MCP 配置详见：

```text
docs/mcp-dynamic-management.md
```

核心接口：

```http
GET /api/tools/mcp/servers
POST /api/tools/mcp/servers
PATCH /api/tools/mcp/servers/:serverId
POST /api/tools/mcp/servers/:serverId/approve
POST /api/tools/mcp/servers/:serverId/disable
POST /api/tools/mcp/servers/reload
```

Web 入口：

```text
http://localhost:3001/tools
```

## 本地示例 MCP Server

示例 server：

```text
tools/mcp/echo-server.mjs
```

提供两个外部工具：

- `echo`
- `word_count`

注册到 Tool Registry 后显示为：

- `local_mcp.echo`
- `local_mcp.word_count`

## Smoke Test

临时启动一个 MCP-enabled API：

```bash
PORT=3002 \
MCP_SERVERS='[{"name":"local_mcp","command":"node","args":["tools/mcp/echo-server.mjs"],"toolNamePrefix":"local_mcp","riskLevel":"low","requiredPermissions":["tools:execute"]}]' \
npm run start:api
```

工具发现：

```bash
curl --max-time 10 -fsS http://127.0.0.1:3002/api/tools
```

应包含：

```text
local_mcp.echo
local_mcp.word_count
```

工具执行：

```bash
curl --max-time 10 -fsS -X POST http://127.0.0.1:3002/api/tools/execute \
  -H 'content-type: application/json' \
  -H 'x-service-token: local-admin-service-token' \
  -d '{"requestId":"33333333-3333-4333-8333-333333333334","name":"local_mcp.echo","arguments":{"message":"hello from mcp"}}'
```

结果摘要：

```text
status: success
source: mcp
content: echo: hello from mcp
data.message: hello from mcp
```

Agent capabilities：

```bash
curl --max-time 10 -fsS http://127.0.0.1:3002/api/agent/capabilities
```

`tools` 中应包含：

```json
{
  "mcpEnabled": true,
  "mcpTools": ["local_mcp.echo", "local_mcp.word_count"],
  "mcpServers": [{ "name": "local_mcp", "disabled": false, "toolCount": 2 }]
}
```

## 安全边界

- 未配置 `MCP_SERVERS` 时不会启动任何 MCP server。
- 配置 `MCP_SERVERS` 后自动启用 MCP，减少“双开关”误配置。
- `MCP_ENABLED=false` 可作为生产应急强制关闭开关。
- MCP 工具默认需要 `tools:execute`。
- MCP 工具默认风险等级为 `medium`，可按 server 配置覆盖。
- MCP 子进程不继承完整 API 环境变量。
- 仅传递 `PATH`、`HOME`、`NODE_ENV` 和 `MCP_SERVERS[].env` 显式配置。
- 动态 MCP 的 `env` 响应会掩码，不直接明文展示。
- 动态 MCP 使用 command allowlist，非白名单命令默认需要 approval。
- `high` / `critical` 风险 server 默认需要 approval 后才能加载。
- MCP 工具输出仍经过统一 result truncation。
- MCP 工具调用失败时转换为统一 Tool Registry error response。

## 后续

- 支持 HTTP/SSE MCP transport。
- 支持 MCP resource / prompt 能力。
- MCP 工具健康检查和自动重连。
- MCP 工具级 approval policy。
- MCP audit event 持久化到 Observability。
