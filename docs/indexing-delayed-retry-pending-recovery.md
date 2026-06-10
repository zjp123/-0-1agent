# Indexing Delayed Retry / Pending Recovery

## 目标

Indexing Delayed Retry / Pending Recovery 为 RAG indexing worker 增加生产级失败恢复能力。

这一步解决两个问题：

- job 执行失败后不要立即重试，避免故障期间快速打满下游服务
- worker 读取 Redis Stream message 后异常退出时，pending message 可以被其他 worker 恢复处理

## 当前实现

路径：

```text
apps/api/src/rag/
  redis-indexing-queue.ts
  indexing-worker.service.ts
  rag.types.ts

apps/api/src/common/config/
  configuration.ts
  validate-env.ts
```

## Redis 数据结构

主 stream：

```text
enterprise-agent:indexing-jobs
```

retry sorted set：

```text
enterprise-agent:indexing-jobs:retry
```

dead-letter stream：

```text
enterprise-agent:indexing-jobs:dead-letter
```

## Redis 命令

- `ZADD`：写入延迟重试消息
- `ZRANGEBYSCORE`：读取到期重试消息
- `ZREM`：移除已提升的重试消息
- `ZCARD`：统计 delayed retry depth
- `XPENDING`：统计 consumer group pending message
- `XAUTOCLAIM`：认领超过 idle 时间的 pending message
- `XACK`：恢复处理完成后确认 message

## 配置

```bash
INDEXING_RETRY_DELAY_BASE_MS=5000
INDEXING_RETRY_DELAY_MAX_MS=60000
INDEXING_RETRY_PROMOTION_BATCH_SIZE=50
INDEXING_PENDING_CLAIM_MIN_IDLE_MS=60000
INDEXING_PENDING_CLAIM_BATCH_SIZE=10
```

## Retry 策略

worker 每次执行 job 前会增加 `attempts`。

如果执行失败：

- `attempts < maxAttempts`：写入 retry sorted set
- `attempts >= maxAttempts`：标记 PostgreSQL dead-letter，并写入 dead-letter stream

延迟时间使用指数退避：

```text
delay = min(baseDelayMs * 2^(attempt - 1), maxDelayMs)
```

默认：

- 第 1 次失败后 5s
- 第 2 次失败后 10s
- 第 3 次及以后最多 60s

## Recovery Loop

worker 启动后每隔 `INDEXING_WORKER_RECOVERY_INTERVAL_MS` 执行一次恢复循环。

恢复循环顺序：

1. 将到期 retry sorted set 消息提升回主 stream
2. 使用 `XAUTOCLAIM` 认领超时 pending messages
3. 扫描 PostgreSQL 中 lease 过期的 running jobs 并重新入队

同一进程内 recovery loop 有并发保护，避免上一次恢复还没结束时下一次重复执行。

## Worker Status

`GET /api/knowledge/reindex/worker/status` 已增加：

- `retryQueueName`
- `queueDepth.consumerPending`
- `queueDepth.delayed`
- `retryDelayBaseMs`
- `retryDelayMaxMs`
- `pendingClaimMinIdleMs`

## Source Of Truth

Redis 负责队列传递和恢复。

PostgreSQL `indexing_jobs` 仍是最终状态源：

- job status
- attempts
- leaseUntil
- workerId
- deadLetteredAt
- error

如果 Redis 中出现重复消息，worker 执行前仍会通过 PostgreSQL lease 和 job status 做幂等保护。

## 当前边界

已完成：

- delayed retry sorted set
- 指数退避 retry delay
- 到期 retry promotion
- XPENDING pending count
- XAUTOCLAIM pending recovery
- recovery loop 并发保护
- worker status 增加 delayed / consumerPending 指标
- worker metrics endpoint
- pending recovery 审计 trace
- worker alerts API
- dead-letter replay all / purge
- Prometheus-style metrics endpoint

未完成：

- queue dashboard UI
- OpenTelemetry metrics
- retry delay jitter
- BullMQ 评估

## 下一步

建议下一步实现 `Auth / RBAC Enterprise Upgrade`：

1. JWT / service token 双模式认证
2. RBAC role / permission 持久化
3. tenant isolation 强化
4. admin 操作 reason/comment
5. 审计日志查询增强
