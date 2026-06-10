# Indexing Operations Runbook / Alerts

## 目标

Indexing Operations Runbook / Alerts 为 RAG indexing worker 增加生产运维入口。

这一步把前面已有的 metrics 和 recovery 能力整理成可执行的排障闭环：

- 告警摘要 API
- dead-letter 批量 replay
- dead-letter 批量 purge
- 告警阈值配置
- 队列排障 runbook

## 当前实现

路径：

```text
apps/api/src/rag/
  rag.controller.ts
  indexing-worker.service.ts
  redis-indexing-queue.ts
  rag.types.ts

apps/api/src/common/config/
  configuration.ts
  validate-env.ts
```

## API

### Worker Alerts

```http
GET /api/knowledge/reindex/worker/alerts
```

权限：

```text
knowledge:read
```

返回内容：

- `status`: `ok` / `warning` / `critical`
- `checkedAt`
- `thresholds`
- `alerts`
- `metrics`

当前 alert code：

- `indexing_worker_disabled`
- `indexing_worker_stopped`
- `indexing_queue_unavailable`
- `indexing_pending_high`
- `indexing_delayed_high`
- `indexing_dead_letter_present`
- `indexing_queue_errors_high`
- `indexing_recovery_failures_high`
- `indexing_recovery_stale`

### Replay All Dead Letters

```http
POST /api/knowledge/reindex/dead-letter/replay-all
```

权限：

```text
knowledge:write
```

行为：

- 只处理当前 tenant 的 dead-letter messages
- 将对应 PostgreSQL job 重置为可重新执行状态
- 将 job 重新写入主 stream
- 删除对应 Redis dead-letter stream message
- 记录 `rag.indexing.admin` action: `replay_dead_letter_all`

### Purge Dead Letters

```http
POST /api/knowledge/reindex/dead-letter/purge
```

权限：

```text
knowledge:write
```

行为：

- 只删除当前 tenant 的 Redis dead-letter stream messages
- 不修改 PostgreSQL `indexing_jobs`
- PostgreSQL 仍保留最终失败状态和错误原因
- 记录 `rag.indexing.admin` action: `purge_dead_letter`

## 配置

```bash
INDEXING_ALERT_PENDING_THRESHOLD=100
INDEXING_ALERT_DELAYED_THRESHOLD=100
INDEXING_ALERT_DEAD_LETTER_THRESHOLD=1
INDEXING_ALERT_QUEUE_ERRORS_THRESHOLD=10
INDEXING_ALERT_RECOVERY_FAILURES_THRESHOLD=1
INDEXING_ALERT_STALE_RECOVERY_MS=120000
INDEXING_DEAD_LETTER_ADMIN_BATCH_SIZE=100
```

## Runbook

### 1. `indexing_queue_unavailable`

检查：

- Redis 是否可连接
- `REDIS_URL` 是否正确
- Redis 内存和连接数
- API / worker 网络访问 Redis 是否正常

处理：

- 恢复 Redis 后观察 `/worker/alerts`
- 查看 `queueErrors`
- 查看 `rag.indexing.recovery` trace 是否恢复为 completed

### 2. `indexing_pending_high`

检查：

- worker 是否 enabled
- `concurrency` 是否过低
- embedding provider / Qdrant 是否慢或失败
- `jobsFailed` 是否持续增加

处理：

- 增加 `INDEXING_WORKER_CONCURRENCY`
- 检查 model / embedding / vector store 错误
- 查看 running jobs 和 stuck jobs

### 3. `indexing_delayed_high`

检查：

- 是否有下游服务持续失败
- `jobsRetried` 是否持续增加
- `lastRecoveryAt` 是否正常更新

处理：

- 优先修复下游依赖
- 暂时提高 retry delay 避免压垮依赖
- 查看失败 job 的 `error`

### 4. `indexing_dead_letter_present`

检查：

- `GET /api/knowledge/reindex/dead-letter`
- 对应 job 的最终 `error`
- 是否是配置、数据、Qdrant collection dimension 等问题

处理：

- 修复根因后调用 `POST /api/knowledge/reindex/dead-letter/replay-all`
- 如果确认无需重放，调用 `POST /api/knowledge/reindex/dead-letter/purge`

### 5. `indexing_recovery_stale`

检查：

- worker 进程是否还在运行
- recovery interval 是否过大
- recovery loop 是否卡在 Redis 或 PostgreSQL 调用
- `lastRecoveryError`

处理：

- 重启 worker
- 检查 Redis / PostgreSQL 延迟
- 查看 `rag.indexing.recovery` trace

## 当前边界

已完成：

- worker alerts API
- alert threshold config
- dead-letter replay all
- dead-letter purge
- tenant-scoped dead-letter operations
- admin audit trace
- operations runbook

未完成：

- Prometheus `/metrics`
- OpenTelemetry metrics
- alert webhook
- dead-letter operation reason/comment
- 多 worker 聚合 dashboard

## 下一步

建议下一步实现 `Prometheus / OpenTelemetry Metrics Export`：

1. 增加 Prometheus-style metrics endpoint
2. 将 worker counters 映射为 metric names
3. 增加 queue depth gauges
4. 增加 alert webhook 或外部告警集成
5. 后续做多 worker 聚合视图
