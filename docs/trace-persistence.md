# Trace Persistence

## 目标

Trace Persistence 将 Observability 的 trace store 从 in-memory 切换到 PostgreSQL。

这样 Agent Runtime 产生的运行轨迹可以跨进程、跨重启保留，便于排障、回放和后续评估分析。

## 当前实现

路径：

```text
apps/api/src/observability/
  observability.constants.ts
  postgres-trace.store.ts
  observability.service.ts
  observability.module.ts
```

## Store 抽象

当前 token：

```ts
TRACE_STORE
```

绑定：

```ts
{
  provide: TRACE_STORE,
  useExisting: PostgresTraceStore
}
```

`ObservabilityService` 只依赖 `TraceStore` 接口，不依赖具体 PostgreSQL 实现。

## 持久化表

当前使用：

- `trace_events`
- `tenants`

`trace_events.attributes` 会保留：

- 原始 trace attributes
- `externalTenantId`
- `userId`

这样返回 API 时仍能展示外部租户 ID，而数据库内部使用 UUID 外键。

## 租户隔离

`GET /api/observability/traces` 当前会从认证上下文读取 tenantId，并默认只返回当前租户 traces。

调用方不能通过 query 参数查询其他 tenant。

## 写入策略

`ObservabilityService.record()` 当前采用 fire-and-forget：

```ts
void Promise.resolve(traceStore.append(traceEvent));
```

原因：

- 不让 trace 写入阻塞 Agent 主流程
- 避免数据库短暂异常直接影响 Agent 回答

后续生产级需要改进：

- 错误日志
- retry / buffer
- 批量写入
- OpenTelemetry exporter

## 当前边界

已完成：

- TRACE_STORE token
- PostgresTraceStore
- ObservabilityService 依赖接口
- ObservabilityModule provider 切换
- trace_events 落库
- trace 查询按租户过滤

未完成：

- trace 写入失败日志
- 批量写入
- OpenTelemetry span
- trace retention policy
- trace viewer
- trace 与 evaluation 自动关联

## 下一步

建议下一步迁移 `WorkflowStore`：

1. 新增 PostgresWorkflowStore
2. 写入 `workflows`
3. 写入 `workflow_steps`
4. 保持 WorkflowService / Controller 不变
5. 验证复杂状态数据持久化
