# Indexing Queue Metrics / Dashboard

## 目标

Indexing Queue Metrics / Dashboard 为 RAG indexing worker 增加生产排障视图。

这一步让运维侧可以直接查看：

- Redis queue / delayed retry / dead-letter / consumer pending 深度
- worker 当前配置和运行状态
- 当前进程内 job / message / recovery 计数器
- 最近一次 recovery loop 时间和错误
- recovery action trace

## 当前实现

路径：

```text
apps/api/src/rag/
  rag.controller.ts
  indexing-worker.service.ts
  rag.service.ts
  rag.types.ts

apps/api/src/observability/
  observability.types.ts
  observability.service.ts
```

## API

### Worker Metrics

```http
GET /api/knowledge/reindex/worker/metrics
```

权限：

```text
knowledge:read
```

返回字段：

- `workerId`
- `enabled`
- `stopped`
- `concurrency`
- `queueName`
- `retryQueueName`
- `deadLetterQueueName`
- `consumerGroup`
- `queueDepth.pending`
- `queueDepth.consumerPending`
- `queueDepth.delayed`
- `queueDepth.deadLetter`
- `queueAvailable`
- `queueError`
- `leaseMs`
- `heartbeatIntervalMs`
- `recoveryIntervalMs`
- `retryDelayBaseMs`
- `retryDelayMaxMs`
- `pendingClaimMinIdleMs`
- `uptimeMs`
- `recoveryRunning`
- `lastRecoveryAt`
- `lastRecoveryError`
- `counters`

### Worker Alerts

```http
GET /api/knowledge/reindex/worker/alerts
```

返回基于 metrics 和阈值计算出的运维摘要：

- `status`
- `checkedAt`
- `thresholds`
- `alerts`
- `metrics`

### Prometheus Metrics

```http
GET /api/knowledge/reindex/worker/prometheus
```

返回 Prometheus text exposition 格式指标，可用于 scrape 或临时排障。

## Counters

当前 counters 为进程内计数器，进程重启后清零：

- `jobsStarted`
- `jobsCompleted`
- `jobsFailed`
- `jobsSkipped`
- `jobsDeadLettered`
- `jobsRetried`
- `messagesDequeued`
- `messagesAcked`
- `delayedPromoted`
- `pendingClaimed`
- `expiredJobsRequeued`
- `recoveryRuns`
- `recoveryFailures`
- `queueErrors`

## Recovery Trace

新增 trace event：

```text
rag.indexing.recovery
```

attributes：

- `workerId`
- `promotedDelayed`
- `claimedPending`
- `requeuedExpired`
- `result`
- `error`

用途：

- 回溯 recovery loop 是否持续运行
- 定位 delayed retry 是否被提升
- 定位 pending message 是否被恢复
- 定位 lease 过期 job 是否反复被重新入队

## Dashboard 建议

后续前端或外部监控面板可以优先展示：

- queue depth：`pending / delayed / consumerPending / deadLetter`
- worker health：`enabled / stopped / queueAvailable / recoveryRunning`
- recovery health：`lastRecoveryAt / lastRecoveryError / recoveryFailures`
- throughput：`jobsStarted / jobsCompleted / messagesDequeued / messagesAcked`
- failure pressure：`jobsFailed / jobsRetried / jobsDeadLettered / queueErrors`

## 当前边界

已完成：

- worker metrics API
- process-level counters
- queue depth metrics
- delayed / pending / dead-letter 指标
- recovery loop counters
- recovery action trace
- worker alerts API
- alert threshold config
- Prometheus-style metrics endpoint

未完成：

- OpenTelemetry metric instruments
- 多 worker 聚合视图
- queue latency percentiles
- dashboard UI
- alert webhook

## 下一步

建议下一步实现 `Persistent RBAC / Service Token Store`：

1. 增加 roles / permissions / service_tokens 表
2. service token 只存 hash
3. 增加 token enabled / expiresAt / lastUsedAt
4. 用户角色从数据库解析
5. 增加 auth admin API
