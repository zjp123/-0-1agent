# Indexing Queue Worker

## 目标

Indexing Queue Worker 将 RAG re-index 从进程内后台执行升级为 Redis queue 消费模式。

当前目标是让 API 只负责创建 job 和 enqueue，worker 负责消费任务并执行 embedding/upsert。这样后续可以支持多实例 worker、失败重试、dead-letter 和 heartbeat。

## 当前实现

路径：

```text
apps/api/src/rag/
  redis-indexing-queue.ts
  indexing-worker.service.ts
  rag.service.ts
  rag.controller.ts
```

## 配置

当前支持：

```bash
REDIS_URL=redis://localhost:6379
INDEXING_QUEUE_NAME=enterprise-agent:indexing-jobs
INDEXING_CONSUMER_GROUP=enterprise-agent-indexers
INDEXING_WORKER_ENABLED=true
INDEXING_WORKER_BLOCK_TIMEOUT_SECONDS=5
INDEXING_JOB_MAX_ATTEMPTS=3
INDEXING_WORKER_HEARTBEAT_INTERVAL_MS=10000
INDEXING_WORKER_ID=
INDEXING_WORKER_CONCURRENCY=1
INDEXING_WORKER_LEASE_MS=60000
INDEXING_WORKER_RECOVERY_INTERVAL_MS=30000
INDEXING_RETRY_DELAY_BASE_MS=5000
INDEXING_RETRY_DELAY_MAX_MS=60000
INDEXING_RETRY_PROMOTION_BATCH_SIZE=50
INDEXING_PENDING_CLAIM_MIN_IDLE_MS=60000
INDEXING_PENDING_CLAIM_BATCH_SIZE=10
```

## Queue 协议

当前使用 Redis Streams：

- enqueue: `XADD`
- consumer group: `XGROUP CREATE`
- consume: `XREADGROUP`
- ack: `XACK`
- pending recovery: `XPENDING` / `XAUTOCLAIM`
- delayed retry: `ZADD` / `ZRANGEBYSCORE` / `ZREM`
- dead-letter: `XADD enterprise-agent:indexing-jobs:dead-letter`

消息格式：

```json
{
  "jobId": "00000000-0000-4000-8000-000000000000",
  "tenantId": "default"
}
```

当前没有额外引入 Redis npm SDK，而是使用 Node `net` 实现最小 RESP client。

原因：

- 不增加依赖安装风险
- 先验证业务边界
- 后续可替换为官方 Redis SDK 或 BullMQ

## 执行流程

1. `POST /api/knowledge/reindex`
2. `RagService.createReindexJob()` 创建 `indexing_jobs` 记录
3. `IndexingWorkerService.enqueueReindexJob()` 写入 Redis queue
4. API 返回 job
5. `IndexingWorkerService` 在模块启动后循环 `XREADGROUP`
6. worker 读取 job
7. worker acquire lease
8. worker 增加 attempts
9. worker 定期写入 heartbeat 并延长 lease
10. worker 调用 `RagService.runReindexJob(job)`
11. job 状态写回 PostgreSQL
12. 失败且未超出 maxAttempts 时写入 retry sorted set
13. 超出 maxAttempts 时标记 dead-letter

worker 启动后会定期执行 recovery loop：

1. 将到期 delayed retry 提升回主 stream
2. 认领超时 pending messages
3. 扫描 lease 过期的 running jobs，并重新入队

如果 Redis enqueue 失败：

- 当前 fallback 到 `void rag.runReindexJob(job)`
- job 仍会继续执行
- 适合开发环境或 Redis 短暂不可用

## Reliability

当前支持：

- attempts
- maxAttempts
- dead-letter queue
- heartbeatAt
- worker status API
- queue depth
- delayed retry
- pending message recovery
- stuck job list
- dead-letter list
- cancel API
- Redis enqueue fallback
- PostgreSQL job 状态作为 source of truth

取消 API：

```http
POST /api/knowledge/reindex/jobs/:jobId/cancel
```

## 当前边界

已完成：

- Redis queue config
- Redis Streams enqueue/dequeue
- Redis consumer group
- XACK
- worker module lifecycle
- job enqueue
- worker consume
- Redis 不可用时进程内 fallback
- job 状态仍由 PostgreSQL 持久化
- retry attempts
- dead-letter queue
- worker heartbeat
- job cancel
- worker lease
- stuck job recovery
- worker concurrency
- dead-letter replay API
- worker status API
- queue depth
- delayed retry sorted set
- retry promotion
- XPENDING / XAUTOCLAIM recovery
- stuck job query
- dead-letter list API
- admin audit trace
- worker metrics endpoint
- recovery action trace
- worker alerts API
- dead-letter replay all / purge
- Prometheus-style metrics endpoint

未完成：

- queue dashboard UI
- OpenTelemetry metrics
- BullMQ

## 下一步

建议下一步实现 `Auth / RBAC Enterprise Upgrade`：

1. JWT / service token 双模式认证
2. RBAC role / permission 持久化
3. tenant isolation 强化
4. admin 操作 reason/comment
5. 审计日志查询增强
