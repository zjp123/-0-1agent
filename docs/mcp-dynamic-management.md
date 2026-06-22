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
  - `transport=stdio | streamable_http`
  - `command`
  - `url`
  - `args`
  - `env`
  - `headers`
  - `authType`
  - `authSecretRef`
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
- Web Tools 页面支持 stdio / Streamable HTTP transport 切换。
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

推荐使用具备 admin 权限的 service token 登录：

```text
Credential type: Service token
Credential: local-admin-service-token
Tenant: default
```

如果使用 API key 登录，默认只有 `developer` 权限，可以执行工具，但不能管理 MCP server，会缺少 `auth:manage`。

4. 打开：

```text
http://localhost:3001/tools
```

5. 在 MCP Servers 中添加示例：

```text
Name: local_mcp
Transport: stdio
Command: node
Args JSON: ["tools/mcp/echo-server.mjs"]
Env JSON: {}
Risk: medium
```

动态 MCP 的相对路径会按项目仓库根目录解析，所以本地示例可以直接填写 `tools/mcp/echo-server.mjs`。

6. 点击 Add 后，系统会 reload MCP servers。

如果同名 server 已存在，Web 会把主按钮切换为 Update，更新原有配置并重新加载，而不是再次创建导致 409。

如果需要添加另一个 MCP server，点击 New，表单会切换到一个新的默认名称，主按钮会回到 Add。

### stdio 配置格式

stdio MCP 与 Cursor / Claude Desktop 的配置模型一致：

```json
{
  "command": "/Users/bjsttlp406/.nvm/versions/node/v22.21.1/bin/npx",
  "args": ["-y", "brave-search-mcp"],
  "env": {
    "BRAVE_API_KEY": "your-key",
    "npm_config_registry": "https://registry.npmmirror.com",
    "PATH": "/Users/bjsttlp406/.nvm/versions/node/v22.21.1/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
  }
}
```

Web 表单对应关系：

```text
Command   -> command 字符串，支持 node、npx 或绝对路径 .../bin/npx
Args JSON -> args 字符串数组，例如 ["-y", "chrome-devtools-mcp@latest", "--isolated"]
Env JSON  -> env 字符串对象，例如 {"BRAVE_API_KEY":"..."}
```

编辑已有 server 时，如果 env 字段显示为 `********`，保存时会保留原 secret 值，不会把掩码写回数据库。

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

## Streamable HTTP 测试流程

启动本地 HTTP MCP mock server：

```bash
node tools/mcp/http-echo-server.mjs
```

打开 Web Tools 页面，点击 New，填写：

```text
Name: remote_echo
Transport: streamable_http
URL: http://127.0.0.1:8787/mcp
Auth: none
Risk: medium
```

由于 remote MCP 默认需要审批，保存后点击 Approve 或 Reload。工具列表应出现：

```text
remote_echo.echo
```

执行参数：

```json
{
  "message": "hello remote mcp"
}
```

应返回：

```text
remote echo: hello remote mcp
```

## 当前边界

- 目前支持 MCP stdio 和 Streamable HTTP 的 JSON-RPC POST 最小闭环。
- 当前 Tool Registry 仍是全局注册表，会加载所有租户 active server；已临时要求动态 MCP server 名称全局唯一，后续需要按请求租户过滤工具可见性。
- `env` 已掩码展示，但尚未接入 Secret Store 引用或 KMS 加密字段。
- command allowlist 目前是代码内置，后续应升级为策略配置或审批工作流。
- 高风险 server 的 approve 目前是管理员动作，不是完整多人审批流。
- Remote MCP 当前支持 `none`、`bearer`、`api_key` 三种基础鉴权，完整 OAuth 2.1 授权流程仍待实现。
- Streamable HTTP 当前按 JSON-RPC POST 响应解析，SSE streaming response 兼容仍待增强。
- 尚未实现工具级 approval 恢复执行。

## 下一步建议

- MCP server env 改为 `secretRef`，由 Secrets/KMS 解密注入子进程。
- Tool Registry 按 tenant 隔离 MCP 工具列表和执行权限。
- command allowlist 改为数据库策略。
- MCP tool 级别风险识别和 approval policy。
- Streamable HTTP SSE response 兼容。
- OAuth 2.1 remote MCP 授权流。
