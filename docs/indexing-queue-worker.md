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
INDEXING_WORKER_ENABLED=true
INDEXING_WORKER_BRPOP_TIMEOUT_SECONDS=5
INDEXING_JOB_MAX_ATTEMPTS=3
INDEXING_WORKER_HEARTBEAT_INTERVAL_MS=10000
```

## Queue 协议

当前使用 Redis List：

- enqueue: `LPUSH`
- consume: `BRPOP`
- dead-letter: `LPUSH enterprise-agent:indexing-jobs:dead-letter`

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
- 后续可替换为 Redis Streams / BullMQ

## 执行流程

1. `POST /api/knowledge/reindex`
2. `RagService.createReindexJob()` 创建 `indexing_jobs` 记录
3. `IndexingWorkerService.enqueueReindexJob()` 写入 Redis queue
4. API 返回 job
5. `IndexingWorkerService` 在模块启动后循环 `BRPOP`
6. worker 读取 job
7. worker 增加 attempts
8. worker 定期写入 heartbeat
9. worker 调用 `RagService.runReindexJob(job)`
10. job 状态写回 PostgreSQL
11. 失败且未超出 maxAttempts 时重新入队
12. 超出 maxAttempts 时标记 dead-letter

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
- Redis List enqueue/dequeue
- worker module lifecycle
- job enqueue
- worker consume
- Redis 不可用时进程内 fallback
- job 状态仍由 PostgreSQL 持久化
- retry attempts
- dead-letter queue
- worker heartbeat
- job cancel

未完成：

- job lease / visibility timeout
- 多 worker 并发控制
- Redis Streams / BullMQ

## 下一步

建议下一步实现 `Worker Lease / Concurrency`：

1. 增加 workerId
2. 增加 job lease / visibility timeout
3. 增加并发控制
4. 增加 stuck job recovery
5. 后续迁移到 Redis Streams 或 BullMQ
