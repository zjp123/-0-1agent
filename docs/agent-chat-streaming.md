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
- 支持 Retry 复用上一次请求。
- 支持 Clear 清空当前对话。
- 后续请求会把已有 user/assistant 消息作为 history 传给后端。
- 展示 context sources，可用于查看 RAG/context 注入情况。
- 展示 model/tool timeline。
- 侧边栏 Agent Chat 导航可点击。

## 401 与长错误布局保护

记录日期：2026-06-17

问题：未登录或未填写凭据时点击 Agent Chat 的 `Send`，后端会返回 `401 Invalid credentials`。如果前端直接展示完整 JSON 错误体，长时间戳、URL path 和 JSON 字符串会撑开 `Run Details` 卡片，导致页面出现横向滚动，内容和侧边栏视觉上混在一起。

处理：

- `runAgentStream` 会把 HTTP JSON 错误体转换为较短的 `error: message` 文案。
- Agent Chat 将 `Unauthorized / Invalid credentials` 归一为可理解提示：需要登录或填写有效 API key / service token。
- CSS 对 `.alert`、`.section-card`、`.chat-layout`、`.chat-main`、`.chat-side` 增加长文本和网格溢出保护，长错误不会撑开页面。

验证重点：

- 未登录状态点击 `Send` 时，`Run Details` 显示简短 401 提示。
- 页面不出现横向滚动条。
- 左侧 sidebar、顶部 topbar 和右侧 Run Details 不发生重叠。

## 登录后 stream 500 排查记录

记录日期：2026-06-17

现象：完成 Login 后进入 `http://localhost:3001/agent-chat`，点击 `Send`，接口返回：

```text
{"statusCode":500,"message":"Unexpected error","path":"/api/agent/run/stream"}
```

根因：Nest dev runtime (`tsx watch`) 下部分构造器元数据不稳定，少数 guard/store/controller 没有显式 `@Inject(...)`，导致运行时依赖为 `undefined`。本次链路中先后触发：

- `ApiKeyGuard.authenticateJwt()` 中 `AuthService` 未注入，Bearer session 鉴权阶段抛 500。
- `PostgresTraceStore.append()` / `PostgresKnowledgeStore.search()` 中 `IdentityService` 未注入，Agent run trace/RAG 阶段抛错。

修复：

- 为 `ApiKeyGuard`、`PermissionsGuard`、Postgres store、部分 controller/service 补齐显式 `@Inject(...)`。
- 全局 `HttpExceptionFilter` 对非 HTTP 异常增加服务端日志，响应仍保持不泄漏内部 stack。
- 清理多个旧 `npm run dev:api` 进程，重新启动一个干净的 3000 API。

验证：

```text
POST /api/agent/run/stream
HTTP 201
SSE: started -> delta -> result -> done
error event: false
```

当前本地 `.env` 的 `LLM_API_KEY` 仍是 placeholder 时，Agent 会返回 `stopReason=model_error` 和友好文本 `Agent stopped because the model request failed.`；这表示 stream 链路正常，真实模型调用需要配置有效 LLM key。

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
- Agent Chat 引用卡片继续细化为可点击来源。
- Agent Chat 可持久化会话历史。
- Auth 配置后续改为统一设置页或浏览器本地安全存储。
