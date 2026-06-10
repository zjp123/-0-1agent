# Observability

## 目标

Observability 模块负责记录 Agent 平台运行过程中的关键事件，帮助开发、排障、评估和后续回放。

当前 trace store 已迁移到 PostgreSQL。持久化说明见 [trace-persistence.md](./trace-persistence.md)。

后续仍可继续接入 OpenTelemetry、Pino、Prometheus 或日志平台。

## 当前实现

路径：

```text
apps/api/src/observability/
  observability.types.ts
  observability.service.ts
  observability.controller.ts
  postgres-trace.store.ts
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
- `rag.vector.failed`
- `agent.context.built`
- `model.completed`
- `model.failed`
- `tool.completed`
- `agent.run.completed`

## Agent Runtime 接入点

当前 Runtime 会记录：

1. Agent run 开始
2. RAG 检索完成
3. RAG vector search 失败并 fallback
4. Memory & Context 构造完成
5. 每次模型调用成功
6. 模型调用失败
7. 每次工具调用完成
8. Agent run 完成

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
- RAG vector fallback trace

未完成：

- OpenTelemetry span
- Pino structured logger
- Prometheus metrics
- cost 持久统计
- trace 与用户/租户权限联动
- 前端 trace viewer

## 下一步

建议下一步实现 `trace failure logging / metrics`：

1. trace 写入失败日志
2. RAG fallback 计数
3. model/tool/error metrics
4. retention policy
5. trace viewer
