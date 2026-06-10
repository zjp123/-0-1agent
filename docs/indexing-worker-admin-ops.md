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
- retryQueueName
- deadLetterQueueName
- consumerGroup
- queueDepth.pending
- queueDepth.consumerPending
- queueDepth.delayed
- queueDepth.deadLetter
- queueAvailable
- queueError
- leaseMs
- heartbeatIntervalMs
- recoveryIntervalMs
- retryDelayBaseMs
- retryDelayMaxMs
- pendingClaimMinIdleMs

### Worker Metrics

```http
GET /api/knowledge/reindex/worker/metrics
```

在 worker status 基础上额外返回：

- uptimeMs
- recoveryRunning
- lastRecoveryAt
- lastRecoveryError
- counters.jobsStarted
- counters.jobsCompleted
- counters.jobsFailed
- counters.jobsSkipped
- counters.jobsDeadLettered
- counters.jobsRetried
- counters.messagesDequeued
- counters.messagesAcked
- counters.delayedPromoted
- counters.pendingClaimed
- counters.expiredJobsRequeued
- counters.recoveryRuns
- counters.recoveryFailures
- counters.queueErrors

### Worker Alerts

```http
GET /api/knowledge/reindex/worker/alerts
```

返回当前 worker 的告警摘要：

- status
- checkedAt
- thresholds
- alerts
- metrics

### Worker Prometheus Metrics

```http
GET /api/knowledge/reindex/worker/prometheus
```

返回 Prometheus text exposition 格式指标。

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

### Dead-letter Replay All

```http
POST /api/knowledge/reindex/dead-letter/replay-all
```

批量 replay 当前租户下的 dead-letter messages。

### Dead-letter Purge

```http
POST /api/knowledge/reindex/dead-letter/purge
```

批量删除当前租户下的 Redis dead-letter messages，不修改 PostgreSQL job 状态。

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
- replay all / purge 只能处理当前 tenant 的 dead-letter messages

## Audit Trace

新增 trace event：

```text
rag.indexing.admin
rag.indexing.recovery
```

当前记录的 action：

- `enqueue_reindex`
- `cancel`
- `replay_dead_letter`
- `replay_dead_letter_all`
- `purge_dead_letter`

attributes：

- action
- jobId
- result

`rag.indexing.recovery` attributes：

- workerId
- promotedDelayed
- claimedPending
- requeuedExpired
- result
- error

## 当前边界

已完成：

- worker status API
- queue depth
- delayed queue depth
- consumer pending depth
- Redis unavailable status fallback
- stuck job query
- dead-letter list API
- cancel audit trace
- replay audit trace
- enqueue audit trace
- tenant filter
- delayed retry status fields
- pending recovery status fields
- worker metrics endpoint
- process-level counters
- recovery action trace
- worker alerts API
- dead-letter replay all
- dead-letter purge
- alert threshold config
- Prometheus-style metrics endpoint

未完成：

- queue latency
- admin operation reason/comment
- alert webhook

## 下一步

建议下一步实现 `Persistent RBAC / Service Token Store`：

1. 增加 roles / permissions / service_tokens 表
2. service token 只存 hash
3. 增加 token enabled / expiresAt / lastUsedAt
4. 用户角色从数据库解析
5. 增加 auth admin API
