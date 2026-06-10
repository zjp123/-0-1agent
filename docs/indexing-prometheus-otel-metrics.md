# Indexing Prometheus / OpenTelemetry Metrics

## 目标

Indexing Prometheus / OpenTelemetry Metrics 为 RAG indexing worker 提供标准化监控出口。

这一步先落地 Prometheus text exposition endpoint，后续可以把同一组指标接到 OpenTelemetry meter。

## 当前实现

路径：

```text
apps/api/src/rag/
  rag.controller.ts
  indexing-worker.service.ts
```

## API

```http
GET /api/knowledge/reindex/worker/prometheus
```

权限：

```text
knowledge:read
```

响应类型：

```text
text/plain; version=0.0.4; charset=utf-8
```

## Metrics

### Worker State

```text
enterprise_agent_indexing_worker_up
enterprise_agent_indexing_queue_available
enterprise_agent_indexing_recovery_running
enterprise_agent_indexing_worker_uptime_ms
```

类型：

- gauge

### Queue Depth

```text
enterprise_agent_indexing_queue_depth{kind="stream"}
enterprise_agent_indexing_queue_depth{kind="consumer_pending"}
enterprise_agent_indexing_queue_depth{kind="delayed"}
enterprise_agent_indexing_queue_depth{kind="dead_letter"}
```

类型：

- gauge

### Worker Counters

```text
enterprise_agent_indexing_worker_counter_total{counter="jobsStarted"}
enterprise_agent_indexing_worker_counter_total{counter="jobsCompleted"}
enterprise_agent_indexing_worker_counter_total{counter="jobsFailed"}
enterprise_agent_indexing_worker_counter_total{counter="jobsSkipped"}
enterprise_agent_indexing_worker_counter_total{counter="jobsDeadLettered"}
enterprise_agent_indexing_worker_counter_total{counter="jobsRetried"}
enterprise_agent_indexing_worker_counter_total{counter="messagesDequeued"}
enterprise_agent_indexing_worker_counter_total{counter="messagesAcked"}
enterprise_agent_indexing_worker_counter_total{counter="delayedPromoted"}
enterprise_agent_indexing_worker_counter_total{counter="pendingClaimed"}
enterprise_agent_indexing_worker_counter_total{counter="expiredJobsRequeued"}
enterprise_agent_indexing_worker_counter_total{counter="recoveryRuns"}
enterprise_agent_indexing_worker_counter_total{counter="recoveryFailures"}
enterprise_agent_indexing_worker_counter_total{counter="queueErrors"}
```

类型：

- counter

### Alert Counts

```text
enterprise_agent_indexing_alerts{severity="warning"}
enterprise_agent_indexing_alerts{severity="critical"}
```

类型：

- gauge

## Labels

默认 labels：

- `worker_id`
- `queue`
- `consumer_group`

部分 metrics 增加：

- `kind`
- `counter`
- `severity`

## 示例

```text
# HELP enterprise_agent_indexing_worker_up Worker process is enabled and not stopped.
# TYPE enterprise_agent_indexing_worker_up gauge
enterprise_agent_indexing_worker_up{worker_id="...",queue="enterprise-agent:indexing-jobs",consumer_group="enterprise-agent-indexers"} 1
```

## 当前边界

已完成：

- Prometheus-style text endpoint
- worker state gauges
- queue depth gauges
- process-level counters
- alert count gauges
- label escaping

未完成：

- OpenTelemetry meter provider
- Prometheus unauthenticated scrape profile
- 多 worker 聚合指标
- histogram / summary latency metrics
- alert webhook

## 下一步

建议下一步实现 `Persistent RBAC / Service Token Store`：

1. 增加 roles / permissions / service_tokens 表
2. service token 只存 hash
3. 增加 token enabled / expiresAt / lastUsedAt
4. 用户角色从数据库解析
5. 增加 auth admin API
