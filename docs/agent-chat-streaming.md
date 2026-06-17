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

## Web 消息区高度优化记录

记录日期：2026-06-17

现象：PC 端 `/agent-chat` 页面中，assistant 渲染内容只占消息面板上方一部分，下方出现大量空白；原 `.message-list` 使用 `max-height: 60vh`，在 Agent Chat 页面级布局中不能准确表达“占满剩余工作区高度”。

根因：聊天主区域同时依赖固定最小高度和 `60vh` 最大高度，消息列表没有跟随 `chat-layout` / `chat-main` 的可用高度进行弹性分配。大屏和不同浏览器面板尺寸下，消息列表高度会与页面工作区脱节。

修复：

- `.agent-chat-page` 改为 `grid-template-rows: auto minmax(0, 1fr)`，并设置页面级 `min-height: calc(100vh - 7rem)`。
- `.chat-layout` / `.chat-main` 增加 `min-height: 0`，允许内部滚动区域正确收缩和伸展。
- 移除 `.message-list` 的 `max-height: 60vh` 和固定 `min-height: 24rem`，改为由父级 grid 的 `1fr` 轨道分配高度。
- `.message-list` 保持 `overflow-y: auto`，消息内容多时只在消息区域内滚动，composer 固定在聊天面板底部。

验证：

```text
1440x900 desktop viewport
.chat-main height ~= 904px
.message-list height ~= 719px
.message-list max-height = none
hasHorizontalOverflow = false
```

## Web Auth 面板模式记录

记录日期：2026-06-17

现象：已登录 Web Console 后，`/agent-chat` 右侧 Auth 模块中的 `API key` 和 `Service token` 输入框展示出来但无法输入，容易让人误以为表单异常。

设计语义：

- 已登录时，Agent Chat 优先使用当前 Web Console session 的 `Authorization: Bearer <accessToken>` 调用 stream 接口。
- 未登录时，才允许手动输入 `API key` 或 `Service token`，作为本地开发和调试入口。

修复：

- 已登录状态下隐藏手动 `API key` / `Service token` 输入框。
- Auth 卡片文案改为说明当前 stream 请求使用已登录 Web Console session。
- 未登录状态下继续展示手动凭证输入，保持本地调试能力。

## Agent Execution Plan 记录

记录日期：2026-06-17

目标：开始补齐 Agent 闭环中的“可追踪执行计划”，让一次 Agent run 不再只是散落的 model/tool steps，而是有明确阶段、状态、时间戳和 trace 的生产执行过程。

实现：

- API `AgentRunResult` 新增 `plan` 字段。
- SSE `result` 事件新增 `plan` 字段。
- Execution Plan 阶段包括：`context`、`planning`、`model`、`tool`、`finalize`。
- 每个 plan step 包含：`id`、`stage`、`title`、`status`、`startedAt`、`completedAt`、`durationMs`、`summary`、`metadata`。
- Observability 新增 trace 类型：`agent.plan.created`、`agent.plan.step.started`、`agent.plan.step.completed`。
- Web Agent Chat 的 Run Details 新增 `Execution Plan` 展示区。

验证：

```text
API check passed
Web check passed
```

## Agent Loop Guard 记录

记录日期：2026-06-17

目标：补齐生产级 Agent loop 的基础保护，避免模型或工具调用异常时陷入无效循环。

实现：

- 新增停止原因：`max_tool_calls`、`empty_model_output`、`repeated_tool_call`。
- 每次 Agent run 默认最多允许 12 次工具调用，或 `maxSteps * 3` 中较小值。
- 模型连续 2 次返回空内容且没有工具调用时，停止为 `empty_model_output`。
- 同一 `toolName + normalized arguments` 重复 3 次时，停止为 `repeated_tool_call`。
- 第一次空模型输出不会立刻失败，会向上下文加入一次轻量提醒，让模型有一次恢复机会。
- loop guard 触发时会更新 Execution Plan step 为 `failed`，并在 final answer 中返回可理解停止说明。

验证：

```text
API check passed
Web check passed
```

## 关键文件

```text
apps/api/src/agent-runtime/agent-runtime.controller.ts
apps/api/src/agent-runtime/agent-runtime.service.ts
apps/api/src/agent-runtime/agent-runtime.types.ts
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
