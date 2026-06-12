# Rate Limiting / Quota Governance

## 目标

本步骤增加生产级限流与配额治理能力，避免高成本接口被单租户、单用户或自动化调用打爆。

核心目标：

- Redis 固定窗口 rate limiter
- PostgreSQL 持久化 quota policy
- PostgreSQL 持久化 quota usage events
- 支持 tenant / user / global 维度
- 支持 request quota
- 支持 LLM token quota
- 管理端 quota policy API
- 高成本接口接入限流

## 新增文件

```text
apps/api/src/governance/
  governance.module.ts
  governance.controller.ts
  quota.service.ts
  redis-rate-limit.store.ts
  governance.types.ts
  dto/create-quota-policy.dto.ts
  dto/update-quota-policy.dto.ts

apps/api/drizzle/0007_unusual_killraven.sql
apps/api/drizzle/meta/0007_snapshot.json
```

## 修改文件

```text
apps/api/src/app.module.ts
apps/api/src/db/schema.ts
apps/api/src/common/config/configuration.ts
apps/api/src/common/config/validate-env.ts
apps/api/src/agent-runtime/agent-runtime.controller.ts
apps/api/src/agent-runtime/agent-runtime.module.ts
apps/api/src/tools/tools.controller.ts
apps/api/src/tools/tools.module.ts
apps/api/src/rag/rag.controller.ts
apps/api/src/rag/rag.module.ts
apps/api/drizzle/meta/_journal.json
```

## 数据库表

### quota_policies

用于保存配额策略。

字段：

- `tenant_id`: 为空表示 global policy
- `name`
- `action`
- `subject_type`: `global` / `tenant` / `user`
- `subject_id`
- `window_seconds`
- `request_limit`
- `token_limit`
- `enabled`
- `created_at`
- `updated_at`

### quota_usage_events

用于保存限流与配额使用事件。

字段：

- `tenant_id`
- `user_id`
- `action`
- `subject_type`
- `subject_id`
- `unit`: `requests` / `tokens`
- `amount`
- `limit`
- `window_key`
- `allowed`
- `reason`
- `metadata`
- `created_at`

## Redis Key

Redis key 默认前缀：

```text
enterprise-agent:rate-limit
```

可通过环境变量覆盖：

```bash
RATE_LIMIT_KEY_PREFIX=
```

计数模型：

```text
INCRBY key amount
EXPIRE key windowSeconds
```

当前采用固定窗口，后续可升级为滑动窗口或 token bucket。

## 默认策略

如果数据库中没有匹配 policy，系统使用默认策略：

```bash
QUOTA_DEFAULT_WINDOW_SECONDS=60
QUOTA_DEFAULT_REQUEST_LIMIT=120
QUOTA_DEFAULT_TOKEN_LIMIT=200000
```

默认会应用：

- tenant request limit
- user request limit
- tenant token limit，仅当调用传入 tokenCost 时应用

## 管理 API

所有接口要求：

```ts
@RequirePermissions("auth:manage")
```

接口：

```http
GET /api/governance/quota/policies
POST /api/governance/quota/policies
PATCH /api/governance/quota/policies/:policyId
GET /api/governance/quota/events
```

创建 policy 示例：

```json
{
  "name": "Agent tenant limit",
  "action": "agent.run",
  "subjectType": "tenant",
  "windowSeconds": 60,
  "requestLimit": 120,
  "tokenLimit": 200000,
  "enabled": true
}
```

## 已接入接口

当前已接入限流：

- `POST /api/agent/run`
- `POST /api/tools/execute`
- `POST /api/knowledge/ingest`
- `POST /api/knowledge/retrieve`
- `POST /api/knowledge/reindex`

`POST /api/agent/run` 在请求前做 request quota，在模型返回后按 `usage.totalTokens` 做 token quota。

`POST /api/knowledge/ingest` 使用内容长度估算 tokenCost：

```text
ceil(content.length / 4)
```

## 当前边界

已完成：

- Redis 固定窗口计数
- quota policy 持久化
- quota usage event 持久化
- 管理端 quota policy API
- 管理端 quota event 查询
- agent/tools/knowledge 高成本接口接入
- 默认 request quota
- 默认 token quota
- Drizzle migration

未完成：

- 滑动窗口 / token bucket
- quota policy 删除接口
- quota event 分页和过滤
- 按 tool name 的精细策略
- 与 billing/cost 系统联动
- 限流指标 Prometheus 导出

## 验证

本步骤完成后需要执行：

```bash
npm run db:generate
npm run check
npm run build
```

## 下一步

建议下一步实现 `Secrets / KMS / Credential Governance`：

1. secret metadata store
2. secret value encryption interface
3. provider credential registry
4. 工具 / 模型凭证按权限读取
5. secret rotation audit
