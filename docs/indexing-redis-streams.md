# Indexing Redis Streams

## 目标

Indexing Redis Streams 将 RAG indexing queue 从 Redis List 模式升级到 Redis Streams consumer group 模式。

这一步用 `XADD / XGROUP / XREADGROUP / XACK` 替换早期的 `LPUSH / BRPOP`，让 worker 消费具备明确的 ack 语义。

## 当前实现

路径：

```text
apps/api/src/rag/
  redis-indexing-queue.ts
  indexing-worker.service.ts
```

## 配置

```bash
INDEXING_QUEUE_NAME=enterprise-agent:indexing-jobs
INDEXING_CONSUMER_GROUP=enterprise-agent-indexers
INDEXING_WORKER_ID=
INDEXING_WORKER_BLOCK_TIMEOUT_SECONDS=5
INDEXING_RETRY_DELAY_BASE_MS=5000
INDEXING_RETRY_DELAY_MAX_MS=60000
INDEXING_RETRY_PROMOTION_BATCH_SIZE=50
INDEXING_PENDING_CLAIM_MIN_IDLE_MS=60000
INDEXING_PENDING_CLAIM_BATCH_SIZE=10
```

兼容说明：旧的 `INDEXING_WORKER_BRPOP_TIMEOUT_SECONDS` 仍可作为 fallback，但新配置统一使用 `INDEXING_WORKER_BLOCK_TIMEOUT_SECONDS`。

## Redis 命令

当前主队列：

```text
enterprise-agent:indexing-jobs
```

当前 dead-letter stream：

```text
enterprise-agent:indexing-jobs:dead-letter
```

当前 retry sorted set：

```text
enterprise-agent:indexing-jobs:retry
```

命令：

- `XADD`：写入 job message
- `XGROUP CREATE ... MKSTREAM`：初始化 consumer group
- `XREADGROUP GROUP ... STREAMS ... >`：消费新消息
- `XACK`：确认已处理消息
- `XPENDING`：查看 consumer group pending messages
- `XAUTOCLAIM`：恢复超时 pending messages
- `XREVRANGE`：查看 dead-letter stream
- `XLEN`：统计 stream depth
- `ZADD / ZRANGEBYSCORE / ZREM / ZCARD`：延迟重试队列

## 消息格式

Stream entry field：

```text
payload
```

payload JSON：

```json
{
  "jobId": "00000000-0000-4000-8000-000000000000",
  "tenantId": "default"
}
```

Worker 消费后会把 Redis stream message id 放入内部 message 对象，用于 `XACK`。

## Source Of Truth

Redis Stream 负责传递消息。

PostgreSQL `indexing_jobs` 仍是 job 状态 source of truth：

- status
- attempts
- progress
- error
- lease
- dead-letter 状态

## 当前边界

已完成：

- Redis Streams enqueue
- consumer group 初始化
- XREADGROUP 消费
- XACK 确认
- dead-letter stream
- queue depth
- delayed retry
- pending entry recovery
- dead-letter list
- worker metrics endpoint
- recovery action trace
- worker alerts API
- dead-letter replay all / purge
- Prometheus-style metrics endpoint

未完成：

- queue dashboard UI
- OpenTelemetry metrics
- BullMQ migration

## 下一步

建议下一步实现 `Persistent RBAC / Service Token Store`：

1. 增加 roles / permissions / service_tokens 表
2. service token 只存 hash
3. 增加 token enabled / expiresAt / lastUsedAt
4. 用户角色从数据库解析
5. 增加 auth admin API
