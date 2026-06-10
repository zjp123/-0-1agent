# Indexing Worker Admin Ops

## 目标

Indexing Worker Admin Ops 为 RAG indexing worker 提供生产排障入口。

这一步补齐 worker 状态、queue depth、stuck job 查询、dead-letter 列表，以及 cancel / replay / enqueue 的审计 trace。

## 当前实现

路径：

```text
apps/api/src/rag/
  rag.controller.ts
  indexing-worker.service.ts
  redis-indexing-queue.ts
  rag.service.ts

apps/api/src/observability/
  observability.types.ts
  observability.service.ts
```

## API

### Worker 状态

```http
GET /api/knowledge/reindex/worker/status
```

返回内容：

- workerId
- enabled
- stopped
- concurrency
- queueName
- deadLetterQueueName
- consumerGroup
- queueDepth.pending
- queueDepth.deadLetter
- queueAvailable
- queueError
- leaseMs
- heartbeatIntervalMs
- recoveryIntervalMs

### Stuck Jobs

```http
GET /api/knowledge/reindex/jobs/stuck
```

返回当前租户下 lease 已过期的 running jobs。

### Dead-letter List

```http
GET /api/knowledge/reindex/dead-letter
```

返回当前租户下 dead-letter queue 中最近的消息。

### Replay

```http
POST /api/knowledge/reindex/jobs/:jobId/replay
```

只允许 replay 当前租户下已 dead-letter 的 job。

### Cancel

```http
POST /api/knowledge/reindex/jobs/:jobId/cancel
```

取消当前租户下的 indexing job。

## 租户隔离

Admin Ops 当前使用认证上下文中的 `tenantId`：

- job list 按 tenant 过滤
- stuck job list 按 tenant 过滤
- dead-letter list 按 tenant 过滤
- cancel/replay 只能操作当前 tenant 的 job

## Audit Trace

新增 trace event：

```text
rag.indexing.admin
```

当前记录的 action：

- `enqueue_reindex`
- `cancel`
- `replay_dead_letter`

attributes：

- action
- jobId
- result

## 当前边界

已完成：

- worker status API
- queue depth
- Redis unavailable status fallback
- stuck job query
- dead-letter list API
- cancel audit trace
- replay audit trace
- enqueue audit trace
- tenant filter

未完成：

- worker metrics endpoint
- queue latency
- stuck job alert
- dead-letter replay all
- admin operation reason/comment

## 下一步

建议下一步实现 `Delayed Retry / Pending Recovery`：

1. 增加 delayed retry
2. 使用 XPENDING / XCLAIM 恢复 pending messages
3. 增加 queue dashboard
4. 增加 admin operation reason
5. 后续可替换 BullMQ
