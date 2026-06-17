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
- `agent.preflight.completed`
- `agent.usage.recorded`
- `agent.plan.created`
- `agent.plan.step.started`
- `agent.plan.step.completed`
- `rag.retrieved`
- `rag.vector.failed`
- `rag.indexing.completed`
- `rag.indexing.failed`
- `rag.indexing.admin`
- `rag.indexing.recovery`
- `agent.context.built`
- `model.completed`
- `model.failed`
- `tool.completed`
- `workflow.step.execution.started`
- `workflow.step.execution.completed`
- `workflow.step.execution.failed`
- `evaluation.agent.run.started`
- `evaluation.agent.run.completed`
- `evaluation.agent.run.failed`
- `agent.run.completed`

## Agent Runtime 接入点

当前 Runtime 会记录：

1. Agent run 开始
2. RAG 检索完成
3. RAG vector search 失败并 fallback
4. RAG indexing job 完成或失败
5. RAG indexing admin 操作
6. RAG indexing recovery loop
7. Memory & Context 构造完成
8. 每次模型调用成功
9. 模型调用失败
10. 每次工具调用完成
11. Agent run 完成

这些事件可以通过同一个 `requestId` 串起来。

Workflow step 执行和 Evaluation Agent run 也会写入同一套 trace store，后续可以用 `requestId` 把 Agent、RAG、模型、工具、Workflow、Evaluation 的调用链聚合成一条时间线。

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

### 查询 request timeline

```http
GET /api/observability/traces/:requestId/timeline
```

返回同一 `requestId` 下按时间正序排列的 trace events，并附带汇总信息：

```text
eventCount
failureCount
firstTimestamp
lastTimestamp
durationMs
eventMix
```

该接口用于 Web Observability 的 `Request Timeline` 视图，也用于从 Agent Chat 的 Run Details 跳转排查一次运行。

### 查询最近失败请求

```http
GET /api/observability/failures
```

返回最近失败事件按 `requestId` 聚合后的摘要：

```text
requestId
failureCount
lastFailureType
lastTimestamp
lastError
```

该接口用于 Web Observability 的 `Recent Failures` 入口，点击失败请求可以直接加载对应 request timeline。

### 查询 Agent run history

```http
GET /api/observability/agent-runs
```

按 tenant 从 trace store 聚合最近 Agent runs：

```text
requestId
status
stopReason
durationMs
stepCount
promptTokens
completionTokens
totalTokens
preflightAllowed
usageRecorded
startedAt
completedAt
```

该接口用于 Web Observability 的 `Agent Runs` 入口，点击 requestId 可以打开对应 timeline。

### Indexing Prometheus Metrics

```http
GET /api/knowledge/reindex/worker/prometheus
```

当前提供 RAG indexing worker 的 Prometheus text exposition 指标。

## 当前边界

已完成：

- TraceEvent 类型
- InMemoryTraceStore
- Trace 查询 API
- Agent Runtime trace 接入
- RAG/context/model/tool/run summary 事件
- RAG vector fallback trace
- RAG indexing trace
- RAG indexing admin audit trace
- RAG indexing recovery trace
- RAG indexing Prometheus metrics endpoint
- requestId timeline API
- recent failures API
- Workflow/Evaluation trace 接入
- Agent execution plan trace 接入
- Agent preflight trace
- Agent usage trace
- Agent run history API

未完成：

- OpenTelemetry span
- Pino structured logger
- 全局 Prometheus metrics
- cost 持久统计
- trace 与用户/租户权限联动
- incident annotation 和 replay 入口

## 下一步

建议下一步实现 `metrics / incident / replay`：

1. OpenTelemetry span 和 Pino structured logger
2. RAG fallback、model/tool/error metrics
3. retention policy
4. incident annotation
5. request replay
