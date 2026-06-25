# Workflow Production Scheduling Enhancement

## 目标

本步骤增加生产级 workflow 调度能力，把 workflow 从“手动创建和更新步骤状态”升级为可被外部 scheduler / worker 周期性领取并记录运行历史的基础设施。

核心目标：

- workflow schedule store
- cron / interval scheduling model
- workflow run history
- scheduler lease / concurrency control
- failed scheduled run recovery foundation

## 新增文件

```text
apps/api/src/workflow/
  workflow-schedule.types.ts
  workflow-scheduler.service.ts
  dto/create-workflow-schedule.dto.ts
  dto/claim-workflow-schedules.dto.ts
  dto/complete-workflow-schedule-run.dto.ts

apps/api/drizzle/0012_ordinary_doomsday.sql
apps/api/drizzle/meta/0012_snapshot.json
```

## 修改文件

```text
apps/api/src/db/schema.ts
apps/api/src/workflow/workflow.controller.ts
apps/api/src/workflow/workflow.module.ts
apps/api/src/observability/observability.types.ts
apps/api/src/observability/dto/list-traces.dto.ts
apps/api/drizzle/meta/_journal.json
```

## 数据库表

### workflow_schedules

用于保存 workflow 的生产调度计划。

字段：

- `tenant_id`
- `workflow_id`
- `created_by`
- `name`
- `schedule_type`
- `cron_expression`
- `interval_seconds`
- `timezone`
- `enabled`
- `max_concurrent_runs`
- `next_run_at`
- `last_run_at`
- `lease_owner`
- `lease_until`
- `metadata`
- `created_at`
- `updated_at`

### workflow_schedule_runs

用于保存每次 schedule 触发产生的运行记录。

字段：

- `tenant_id`
- `schedule_id`
- `workflow_id`
- `triggered_by`
- `worker_id`
- `status`
- `due_at`
- `started_at`
- `completed_at`
- `error`
- `output`
- `metadata`
- `created_at`
- `updated_at`

## 调度模型

当前支持两类 schedule：

```text
interval
cron
```

Interval 使用 `intervalSeconds` 计算下一次执行时间。

Cron 使用 5 字段表达式：

```text
minute hour day-of-month month day-of-week
```

当前 cron 支持：

- `*`
- `*/n`
- 单值
- 逗号列表
- 范围
- 范围步进

当前 cron 计算按 UTC 处理，`timezone` 字段已持久化，为后续 timezone-aware 调度预留。

## Lease / Concurrency

worker 通过 claim API 领取到期 schedule：

```text
next_run_at <= now
enabled = true
lease_until is null or lease_until <= now
```

领取成功后：

- 设置 `lease_owner`
- 设置 `lease_until`
- 更新 `last_run_at`
- 计算下一次 `next_run_at`
- 创建一条 `workflow_schedule_runs`

并发控制：

- 每个 schedule 支持 `maxConcurrentRuns`
- 当前 `pending` / `running` run 数量达到上限时，本轮 claim 跳过该 schedule

## API

所有接口前缀：

```text
/api/workflows
```

所有接口要求：

```ts
@RequirePermissions("workflow:manage")
```

### Scheduler Status

```http
GET /api/workflows/scheduler/status
```

### Schedules

```http
GET /api/workflows/schedules
POST /api/workflows/schedules
POST /api/workflows/schedules/claim-due
POST /api/workflows/schedules/:scheduleId/trigger
GET /api/workflows/schedules/:scheduleId/runs
```

创建 interval schedule：

```json
{
  "workflowId": "workflow-uuid",
  "name": "Every 15 minutes",
  "scheduleType": "interval",
  "intervalSeconds": 900,
  "nextRunAt": "2026-06-15T10:00:00.000Z",
  "maxConcurrentRuns": 1
}
```

创建 cron schedule：

```json
{
  "workflowId": "workflow-uuid",
  "name": "Weekday morning run",
  "scheduleType": "cron",
  "cronExpression": "0 9 * * 1-5",
  "timezone": "UTC",
  "nextRunAt": "2026-06-16T09:00:00.000Z"
}
```

worker 领取到期 schedule：

```json
{
  "workerId": "workflow-scheduler-1",
  "limit": 10,
  "leaseMs": 60000
}
```

### Schedule Runs

```http
GET /api/workflows/schedule-runs
POST /api/workflows/schedule-runs/:runId/complete
```

完成 run：

```json
{
  "status": "completed",
  "output": "Workflow run completed"
}
```

失败 run：

```json
{
  "status": "failed",
  "error": "Workflow executor timed out"
}
```

## Trace Events

本步骤新增 trace 类型：

- `workflow.schedule.created`
- `workflow.schedule.run.created`
- `workflow.schedule.run.failed`

## 当前边界

已完成：

- workflow schedule store
- workflow schedule run history
- interval scheduling
- basic 5-field cron scheduling
- schedule claim API
- lease owner / lease until
- max concurrent runs control
- manual trigger API
- run completion API
- scheduler trace events
- Drizzle migration

未完成：

- [x] 内置后台 scheduler loop
- [x] workflow step executor
- run retry policy
- [x] stuck run recovery worker
- timezone-aware cron calculation
- schedule update / disable API
- schedule deletion / archival API
- schedule metrics dashboard

## 验证

本步骤完成后需要执行：

```bash
npm run db:generate
npm run check
npm run build
```

## 下一步

建议下一步实现 `OpenAPI / SDK / API Documentation`：

1. OpenAPI generation baseline
2. API route grouping and tags
3. request / response schema documentation
4. SDK generation plan
5. API usage examples
