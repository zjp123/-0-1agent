# Indexing Job Reliability

## 目标

Indexing Job Reliability 为 RAG indexing worker 增加生产稳定性能力。

当前已经在 Redis queue 基础上补齐 retry、dead-letter、heartbeat、cancel、worker lease 和 dead-letter replay，使 re-index job 更容易排障和恢复。

## 当前实现

路径：

```text
apps/api/src/rag/
  indexing-worker.service.ts
  redis-indexing-queue.ts
  rag.service.ts
  rag.controller.ts
  postgres-indexing-job.store.ts

apps/api/src/db/
  schema.ts
```

## 配置

```bash
INDEXING_JOB_MAX_ATTEMPTS=3
INDEXING_WORKER_HEARTBEAT_INTERVAL_MS=10000
INDEXING_WORKER_ID=
INDEXING_WORKER_LEASE_MS=60000
INDEXING_WORKER_CONCURRENCY=1
INDEXING_WORKER_RECOVERY_INTERVAL_MS=30000
```

## 数据字段

`indexing_jobs` 新增：

- `attempts`
- `maxAttempts`
- `heartbeatAt`
- `workerId`
- `leaseUntil`
- `cancelledAt`
- `deadLetteredAt`

状态新增：

- `cancelled`

## Retry

worker 消费 job 后会先增加 `attempts`。

如果执行失败：

- `attempts < maxAttempts`：写入 retry sorted set，等待延迟后重新入队
- `attempts >= maxAttempts`：标记 dead-letter

retry delay 使用指数退避：

```text
delay = min(baseDelayMs * 2^(attempt - 1), maxDelayMs)
```

## Dead-letter

dead-letter 使用 Redis Stream：

```text
enterprise-agent:indexing-jobs:dead-letter
```

PostgreSQL 仍是 source of truth：

- status = `failed`
- `deadLetteredAt` 有值
- `error` 保存最终失败原因

## Heartbeat

worker 执行 job 时会定期更新：

```text
heartbeatAt
leaseUntil
```

这用于后续识别 stuck job 和 worker 异常退出。

## Lease

worker 消费 job 后会先 acquire lease。

当前 lease 字段：

- `workerId`
- `leaseUntil`

只有拿到 lease 的 worker 才会执行 job。

worker heartbeat 会延长 `leaseUntil`。如果 worker 异常退出，`leaseUntil` 到期后其他 worker 可以恢复该 running job。

## Cancel

取消 API：

```http
POST /api/knowledge/reindex/jobs/:jobId/cancel
```

当前取消行为：

- job 状态标记为 `cancelled`
- 设置 `cancelledAt`
- 设置 `completedAt`
- worker 执行过程中会在批次之间检查状态

## Dead-letter Replay

重放 API：

```http
POST /api/knowledge/reindex/jobs/:jobId/replay
```

当前行为：

- 仅允许 replay 已 dead-letter 的 failed job
- 重置 attempts / progress / error / lease 字段
- 将 job 重新写入 Redis queue

## 当前边界

已完成：

- retry attempts
- maxAttempts
- dead-letter queue
- heartbeat
- cancel API
- workerId
- leaseUntil
- stuck job recovery
- concurrency control
- dead-letter replay API
- cancelled status
- reliability migration
- Redis Streams consumer group
- XACK 消费确认
- delayed retry
- pending message recovery
- worker metrics endpoint
- recovery action trace
- worker alerts API
- dead-letter replay all / purge

未完成：

- workerId 查询过滤
- lease timeout 告警
- queue dashboard UI
- Prometheus metrics export
- BullMQ 评估

## 下一步

建议下一步实现 `Prometheus / OpenTelemetry Metrics Export`：

1. 增加 Prometheus-style metrics endpoint
2. 将 worker counters 映射为 metric names
3. 增加 queue depth gauges
4. 增加 alert webhook 或外部告警集成
5. 后续评估 BullMQ 替换
