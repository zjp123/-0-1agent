# Observability

## 目标

Observability 模块负责记录 Agent 平台运行过程中的关键事件，帮助开发、排障、评估和后续回放。

当前阶段先实现 in-memory trace store，保证事件模型和查询 API 稳定。后续可替换为 OpenTelemetry、Pino、Prometheus、数据库或日志平台。

## 当前实现

路径：

```text
apps/api/src/observability/
  observability.types.ts
  observability.service.ts
  observability.controller.ts
  in-memory-trace.store.ts
  dto/
    list-traces.dto.ts
```

## Trace Event

核心结构：

```ts
type TraceEvent = {
  id: string;
  requestId: string;
  type: TraceEventType;
  timestamp: string;
  durationMs?: number;
  userId?: string;
  tenantId?: string;
  attributes: Record<string, string | number | boolean | null>;
};
```

## 当前事件类型

已支持：

- `agent.run.started`
- `rag.retrieved`
- `agent.context.built`
- `model.completed`
- `model.failed`
- `tool.completed`
- `agent.run.completed`

## Agent Runtime 接入点

当前 Runtime 会记录：

1. Agent run 开始
2. RAG 检索完成
3. Memory & Context 构造完成
4. 每次模型调用成功
5. 模型调用失败
6. 每次工具调用完成
7. Agent run 完成

这些事件可以通过同一个 `requestId` 串起来。

## API

### 查询 traces

```http
GET /api/observability/traces
```

可选查询参数：

```text
requestId=...
type=agent.run.completed
limit=100
```

示例：

```http
GET /api/observability/traces?requestId=00000000-0000-4000-8000-000000000000
```

## 当前边界

已完成：

- TraceEvent 类型
- InMemoryTraceStore
- Trace 查询 API
- Agent Runtime trace 接入
- RAG/context/model/tool/run summary 事件

未完成：

- 持久化 trace store
- OpenTelemetry span
- Pino structured logger
- Prometheus metrics
- cost 持久统计
- trace 与用户/租户权限联动
- 前端 trace viewer

## 下一步

建议下一步实现 `Auth & Governance` 基础版：

1. 定义用户、租户、角色、权限类型
2. 建立 request context
3. 让 Agent Runtime 和 Tool Registry 使用真实权限
4. 提供开发期 API key guard 或 mock auth
5. 后续再接 JWT / Refresh Token / RBAC 持久化
