# Indexing Worker Lease / Concurrency

## 目标

Indexing Worker Lease / Concurrency 让 RAG indexing worker 支持多实例和并发执行。

这一步引入 `workerId`、`leaseUntil`、stuck job recovery、worker concurrency 和 dead-letter replay API，避免多个 worker 重复执行同一个 job，并让异常退出的 running job 可以恢复。

## 当前实现

路径：

```text
apps/api/src/rag/
  indexing-worker.service.ts
  postgres-indexing-job.store.ts
  rag.service.ts
  rag.controller.ts

apps/api/src/db/
  schema.ts
```

## 配置

```bash
INDEXING_WORKER_ID=
INDEXING_WORKER_CONCURRENCY=1
INDEXING_WORKER_LEASE_MS=60000
INDEXING_WORKER_RECOVERY_INTERVAL_MS=30000
```

如果没有配置 `INDEXING_WORKER_ID`，启动时会生成随机 UUID。

## Lease 字段

`indexing_jobs` 新增：

- `workerId`
- `leaseUntil`

worker 消费 Redis message 后会先尝试 acquire lease。

可 acquire 的 job：

- `pending`
- `failed` 且未 dead-letter
- `running` 且 lease 已过期

只有成功 acquire lease 的 worker 会执行 job。

## Heartbeat

执行期间 worker 会定期：

- 更新 `heartbeatAt`
- 延长 `leaseUntil`

这让其他 worker 能判断 running job 是否已经失去 owner。

## Stuck Job Recovery

worker 启动后会定期扫描：

```text
status = running AND (leaseUntil is null OR leaseUntil <= now)
```

匹配到的 job 会被重新写入 Redis queue。

## Concurrency

`INDEXING_WORKER_CONCURRENCY` 控制当前进程启动几个 worker loop。

每个 loop 都会独立 `XREADGROUP`，但执行前必须 acquire lease，因此多 loop / 多实例下同一个 job 不会被正常重复执行。

## Dead-letter Replay

API：

```http
POST /api/knowledge/reindex/jobs/:jobId/replay
```

当前行为：

1. 只允许 replay dead-letter job
2. 重置 attempts / progress / error / lease 字段
3. 将状态改回 `pending`
4. 写回 Redis queue

## 当前边界

已完成：

- workerId
- leaseUntil
- acquire lease
- heartbeat 延长 lease
- stuck job recovery
- worker concurrency
- dead-letter replay API
- lease migration
- Redis Streams consumer group
- delayed retry
- Redis pending entry recovery

未完成：

- queue dashboard

## 下一步

建议下一步实现 `Queue Metrics / Dashboard`：

1. 增加 queue metrics endpoint
2. 增加 pending / delayed / dead-letter 分布指标
3. 增加 worker active heartbeat 指标
4. 增加 recovery action trace
5. 后续评估 BullMQ 替换
