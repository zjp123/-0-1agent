# Evaluation Persistence

## 目标

Evaluation Persistence 是第一个从 in-memory store 切换到 PostgreSQL 的模块。

本次迁移验证了后续其他 store 的迁移模式：

1. 保持业务 service / controller 接口不变
2. 抽象 store token
3. 新增 PostgreSQL store 实现
4. 通过 provider 切换底层实现
5. 使用 IdentityService 处理外部租户/用户 ID 到数据库 UUID 的映射

## 当前实现

路径：

```text
apps/api/src/evaluation/
  evaluation.constants.ts
  postgres-evaluation.store.ts
  evaluation.service.ts
  evaluation.module.ts

apps/api/src/db/
  identity.service.ts
```

## Store 抽象

当前 token：

```ts
EVALUATION_STORE
```

绑定：

```ts
{
  provide: EVALUATION_STORE,
  useExisting: PostgresEvaluationStore
}
```

`EvaluationService` 只依赖 `EvaluationStore` 接口，不依赖具体 PostgreSQL 实现。

## IdentityService

Auth 当前使用外部字符串：

- `tenantId`: 例如 `default`
- `userId`: 例如 `dev-user`

PostgreSQL schema 使用 UUID 外键。

因此新增 `IdentityService`：

```ts
resolve({
  tenantExternalId,
  userExternalId
})
```

它会：

1. 根据 tenant name 查找或创建 tenant
2. 根据 tenantId + externalId 查找或创建 user
3. 返回数据库内部 UUID

这个服务后续可以复用于：

- KnowledgeStore
- WorkflowStore
- TraceStore
- SessionStore

## 持久化表

当前 Evaluation 使用：

- `tenants`
- `users`
- `evaluation_cases`
- `evaluation_runs`

## 运行前置条件

启动基础设施：

```bash
npm run infra:up
```

推送 schema：

```bash
npm run db:push
```

启动 API：

```bash
npm run dev:api
```

## 当前边界

已完成：

- EVALUATION_STORE token
- PostgresEvaluationStore
- EvaluationService 依赖接口
- EvaluationModule provider 切换
- IdentityService
- evaluation cases 落库
- evaluation runs 落库

未完成：

- 数据库集成测试
- Evaluation run 自动调用 Agent Runtime
- 批量 evaluation
- 结果统计和趋势
- seed 脚本
- 生产级用户/租户管理

## 下一步

建议下一步迁移 `TraceStore`：

1. 新增 PostgresTraceStore
2. 写入 `trace_events`
3. 保持 ObservabilityService 接口不变
4. 验证 Agent Runtime trace 持久化
