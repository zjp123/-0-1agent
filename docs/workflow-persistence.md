# Workflow Persistence

## 目标

Workflow Persistence 将 WorkflowStore 从 in-memory 切换到 PostgreSQL。

这一步验证了复杂状态对象的持久化模式，包括 workflow 主记录、step 列表、step 状态更新和 workflow status 自动推导。

## 当前实现

路径：

```text
apps/api/src/workflow/
  workflow.constants.ts
  postgres-workflow.store.ts
  workflow.service.ts
  workflow.module.ts
```

## Store 抽象

当前 token：

```ts
WORKFLOW_STORE
```

绑定：

```ts
{
  provide: WORKFLOW_STORE,
  useExisting: PostgresWorkflowStore
}
```

`WorkflowService` 只依赖 `WorkflowStore` 接口，不依赖具体 PostgreSQL 实现。

## 持久化表

当前使用：

- `tenants`
- `users`
- `workflows`
- `workflow_steps`
- `workflow_schedules`
- `workflow_schedule_runs`

当前还没有单独的 `workflow_events` 表。

API 返回的 `events` 暂时由 workflow 创建时间和 step 状态推导生成。

## IdentityService

Workflow 使用认证上下文中的外部字符串：

- `tenantId`
- `userId`

`PostgresWorkflowStore` 通过 `IdentityService` 映射到数据库 UUID：

1. 查找或创建 tenant
2. 查找或创建 user
3. 写入 workflows / workflow_steps

## 状态推导

更新 step 后，store 会重新读取该 workflow 的所有 steps，并推导 workflow status：

- 任一步骤 `failed` -> workflow `failed`
- 所有步骤 `completed` 或 `skipped` -> workflow `completed`
- 任一步骤 `running` -> workflow `running`
- 任一步骤 `waiting_for_approval` -> workflow `paused`
- 其他情况 -> workflow `draft`

## 当前边界

已完成：

- WORKFLOW_STORE token
- PostgresWorkflowStore
- WorkflowService 依赖接口
- WorkflowModule provider 切换
- workflows 落库
- workflow_steps 落库
- step 状态更新落库
- workflow status 自动推导并落库
- workflow_schedules 落库
- workflow_schedule_runs 落库
- schedule lease / claim 状态落库

未完成：

- workflow_events 持久化表
- transaction 包裹 create workflow + steps
- step dependency
- pause/resume/cancel API
- Agent 自动执行 workflow
- Workflow 与 Observability trace 关联
- 内置后台 scheduler loop
- schedule update / disable API

## 下一步

建议下一步实现 `OpenAPI / SDK / API Documentation`：

1. OpenAPI generation baseline
2. API route grouping and tags
3. request / response schema documentation
4. SDK generation plan
5. API usage examples
