# Indexing Job Reliability

## 目标

Indexing Job Reliability 为 RAG indexing worker 增加生产稳定性能力。

当前已经在 Redis queue 基础上补齐 retry、dead-letter、heartbeat 和 cancel，使 re-index job 更容易排障和恢复。

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
```

## 数据字段

`indexing_jobs` 新增：

- `attempts`
- `maxAttempts`
- `heartbeatAt`
- `cancelledAt`
- `deadLetteredAt`

状态新增：

- `cancelled`

## Retry

worker 消费 job 后会先增加 `attempts`。

如果执行失败：

- `attempts < maxAttempts`：重新入队
- `attempts >= maxAttempts`：标记 dead-letter

## Dead-letter

dead-letter 使用 Redis List：

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
```

这用于后续识别 stuck job 和 worker 异常退出。

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

## 当前边界

已完成：

- retry attempts
- maxAttempts
- dead-letter queue
- heartbeat
- cancel API
- cancelled status
- reliability migration

未完成：

- workerId
- job lease / visibility timeout
- stuck job recovery
- concurrency control
- dead-letter replay API

## 下一步

建议下一步实现 `Worker Lease / Concurrency`：

1. 增加 workerId
2. 增加 leaseUntil
3. 恢复 heartbeat 超时的 running job
4. 增加 worker 并发数配置
5. 增加 dead-letter replay API
