# Agent Chat Streaming

## 目标

首版 Web 平台入口支持从页面调用 Agent，并通过 SSE 展示流式输出。

## 后端接口

新增接口：

```text
POST /api/agent/run/stream
```

鉴权与权限：

```text
x-api-key: <local-api-key>
```

或：

```text
x-service-token: <local-service-token>
```

需要权限：

```text
agent:run
```

请求体复用 `RunAgentDto`：

```json
{
  "requestId": "11111111-1111-4111-8111-111111111112",
  "message": "用一句话介绍这个企业级 Agent 平台。",
  "maxSteps": 1,
  "maxDurationMs": 30000
}
```

## SSE 事件

首版事件：

```text
started
delta
result
done
error
```

示例：

```text
event: started
data: {"requestId":"...","timestamp":"..."}

event: delta
data: {"requestId":"...","content":"..."}

event: result
data: {"requestId":"...","stopReason":"final_answer","steps":[],"context":{},"usage":{},"durationMs":1234}

event: done
data: {"requestId":"...","timestamp":"..."}
```

## 当前实现说明

首版 streaming 是 Agent run 结果的 SSE 包装：

- 后端仍复用现有 `AgentRuntimeService.run()`。
- run 完成后，将 answer 分块发送为 `delta`。
- 同时发送 `result`，包含 steps、context、usage、durationMs。
- 后续可升级 Model Gateway provider，实现 token-level streaming。

这样可以先完成 Web 流式体验、SSE 协议、取消生成、错误状态和 UI 增量渲染，再逐步深入模型层 token stream。

## Web 页面

新增页面：

```text
http://localhost:3001/agent-chat
```

能力：

- 输入 Agent 任务。
- 使用 API key 或 service token 发起请求。
- 消费 SSE stream。
- 增量渲染 assistant Markdown 消息。
- 展示 stream events。
- 展示 usage、duration、steps 摘要。
- 支持 Stop 取消当前生成。
- 侧边栏 Agent Chat 导航可点击。

## 关键文件

```text
apps/api/src/agent-runtime/agent-runtime.controller.ts
apps/api/src/api-docs/openapi.document.ts
apps/web/src/lib/api/client.ts
apps/web/src/app/agent-chat/page.tsx
apps/web/src/features/agent-chat/agent-chat.tsx
apps/web/src/components/layout/app-shell.tsx
apps/web/src/app/globals.css
```

## 验证

API 类型检查：

```bash
PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH npm run check -w @enterprise-agent/api
```

结果：

```text
passed
```

Web 类型检查：

```bash
PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH npm run check:web
```

结果：

```text
passed
```

OpenAPI 导出：

```bash
PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH npm run docs:openapi -w @enterprise-agent/api
```

结果：

```text
passed
```

API tests：

```bash
PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH npm run test -w @enterprise-agent/api
```

结果：

```text
16 passed
```

SSE smoke test：

```bash
curl --max-time 40 -N -sS -X POST http://127.0.0.1:3000/api/agent/run/stream \
  -H 'content-type: application/json' \
  -H 'x-service-token: local-admin-service-token' \
  -d '{"requestId":"11111111-1111-4111-8111-111111111112","message":"用一句话介绍这个企业级 Agent 平台。","maxSteps":1,"maxDurationMs":30000}'
```

结果：

```text
started -> delta -> result -> done
```

当前本地 LLM key 是 placeholder，因此 smoke test 的 stop reason 为 `model_error`，但 SSE 协议和事件链路已通过。

Web route smoke test：

```text
GET http://localhost:3001/agent-chat -> 200 OK
```

## 后续

- Model Gateway 增加真正 token-level streaming。
- Agent Chat 支持会话历史。
- Agent Chat 展示 tool call timeline。
- Agent Chat 展示 RAG 引用。
- Auth 配置后续改为统一设置页或浏览器本地安全存储。
