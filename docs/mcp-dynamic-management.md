# MCP Dynamic Management

## 目标

把 MCP 从“只能通过环境变量写死启动”升级为“可在运行时配置、审批、启停、刷新”的生产级工具接入能力。

## 已实现能力

- 新增 `mcp_servers` 持久化表。
- 新增 Web/API 管理入口：
  - `GET /api/tools/mcp/servers`
  - `POST /api/tools/mcp/servers`
  - `PATCH /api/tools/mcp/servers/:serverId`
  - `POST /api/tools/mcp/servers/:serverId/approve`
  - `POST /api/tools/mcp/servers/:serverId/disable`
  - `POST /api/tools/mcp/servers/reload`
- MCP server 配置支持：
  - `name`
  - `transport=stdio`
  - `command`
  - `args`
  - `env`
  - `enabled`
  - `riskLevel`
  - `requiredPermissions`
  - `toolNamePrefix`
  - `timeoutMs`
- Tool Registry 支持运行时 reload MCP handlers。
- MCP Provider 可同时加载：
  - `.env` / `MCP_SERVERS` 静态配置
  - DB 中 `active + enabled` 的动态配置
- 动态 MCP 加载结果会写回：
  - `status`
  - `lastLoadedAt`
  - `lastError`
- 在 tenant-scoped Tool Registry 完成前，动态 MCP server `name` 需要全局唯一，避免工具命名冲突。
- Web Tools 页面新增 MCP Servers 管理卡片。
- MCP env 返回前统一掩码，避免明文展示。
- MCP 配置变更写入 `auth_admin_audit_events`。

## 安全策略

### env/secrets 不直接明文展示

API 返回 MCP server 配置时，`env` 值统一显示为：

```text
********
```

避免 Web Console、浏览器日志、截图、录屏或排障输出泄露密钥。

### command allowlist

当前默认允许的 MCP 启动命令：

```text
node
npx
```

如果配置了非白名单命令，server 会进入 `pending_approval`，不会自动启用。

### 高风险 server 需要 approval

当 `riskLevel` 为：

```text
high
critical
```

server 创建或更新后默认进入 `pending_approval`。管理员需要调用 approve 接口或在 Web 上点击 Approve，才会进入 `active` 并被 Tool Registry 加载。

### 强制关闭开关

`MCP_ENABLED=false` 是生产事故开关。

即使数据库里存在 `active + enabled` 的 MCP server，只要设置了 `MCP_ENABLED=false`，API 进程也不会加载任何 MCP server。

## 本地测试流程

1. 启动基础设施和迁移：

```bash
npm run infra:up
npm run build -w @enterprise-agent/api
npm run db:migrate -w @enterprise-agent/api
```

2. 启动 API/Web：

```bash
npm run dev:api
npm run dev:web
```

3. 登录 Web Console。

4. 打开：

```text
http://localhost:3001/tools
```

5. 在 MCP Servers 中添加示例：

```text
Name: local_mcp
Command: node
Args: tools/mcp/echo-server.mjs
Risk: medium
```

6. 点击 Add 后，系统会 reload MCP servers。

7. 工具列表应出现：

```text
local_mcp.echo
local_mcp.word_count
```

8. 选择 `local_mcp.echo`，参数示例：

```json
{
  "message": "hello from dynamic mcp"
}
```

9. 点击 Execute，应返回：

```text
echo: hello from dynamic mcp
```

## 当前边界

- 目前只支持 MCP stdio transport。
- 当前 Tool Registry 仍是全局注册表，会加载所有租户 active server；已临时要求动态 MCP server 名称全局唯一，后续需要按请求租户过滤工具可见性。
- `env` 已掩码展示，但尚未接入 Secret Store 引用或 KMS 加密字段。
- command allowlist 目前是代码内置，后续应升级为策略配置或审批工作流。
- 高风险 server 的 approve 目前是管理员动作，不是完整多人审批流。
- 尚未实现工具级 approval 恢复执行。

## 下一步建议

- MCP server env 改为 `secretRef`，由 Secrets/KMS 解密注入子进程。
- Tool Registry 按 tenant 隔离 MCP 工具列表和执行权限。
- command allowlist 改为数据库策略。
- MCP tool 级别风险识别和 approval policy。
- HTTP/SSE MCP transport。
