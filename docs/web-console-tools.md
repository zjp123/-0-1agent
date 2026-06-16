# Web Console Tools

## 目标

完成 Web 控制台 Tools 页面，用于查看企业 Agent 平台内已注册工具，并进行本地受控调用测试。

## 页面入口

```text
http://localhost:3001/tools
```

侧边栏 `Tools` 已接入该页面。

## 已实现能力

- 展示 `/api/tools` 工具列表。
- 展示工具名称、来源、描述。
- 展示工具 input schema。
- 展示 timeout、result limit、required permissions。
- 支持输入 API key 或 service token。
- 支持编辑 arguments JSON。
- 支持执行工具。
- 支持 `calculator` 默认测试参数。
- 支持 `current_time` 默认测试参数。
- 展示工具执行结果。
- 展示完整 response/audit JSON。

## API

工具列表：

```http
GET /api/tools
```

工具执行：

```http
POST /api/tools/execute
```

执行接口需要：

```text
tools:execute
```

## 关键文件

```text
apps/web/src/app/tools/page.tsx
apps/web/src/features/tools/tools-workbench.tsx
apps/web/src/lib/api/client.ts
apps/web/src/components/layout/app-shell.tsx
apps/web/src/app/globals.css
```

## 验证

Web 类型检查：

```bash
PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH npm run check:web
```

结果：

```text
passed
```

API 类型检查：

```bash
PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH npm run check -w @enterprise-agent/api
```

结果：

```text
passed
```

工具列表：

```bash
curl --max-time 10 -fsS http://127.0.0.1:3000/api/tools
```

结果包含：

```text
current_time
calculator
```

Calculator smoke test：

```bash
curl --max-time 10 -fsS -X POST http://127.0.0.1:3000/api/tools/execute \
  -H 'content-type: application/json' \
  -H 'x-service-token: local-admin-service-token' \
  -d '{"requestId":"22222222-2222-4222-8222-222222222222","name":"calculator","arguments":{"expression":"(128 * 256) / 2"}}'
```

结果：

```text
(128 * 256) / 2 = 16384
```

Current time smoke test：

```bash
curl --max-time 10 -fsS -X POST http://127.0.0.1:3000/api/tools/execute \
  -H 'content-type: application/json' \
  -H 'x-service-token: local-admin-service-token' \
  -d '{"requestId":"22222222-2222-4222-8222-222222222223","name":"current_time","arguments":{"timeZone":"Asia/Shanghai"}}'
```

结果：

```text
status: success
timeZone: Asia/Shanghai
```

Web route smoke test：

```text
GET http://localhost:3001/tools -> 200 OK
```

## 后续

- Tools 页面与 Agent Chat tool timeline 互相跳转。
- 增加工具调用历史。
- 增加 MCP 工具来源展示。
- 增加 schema-driven form，替代手写 JSON。
