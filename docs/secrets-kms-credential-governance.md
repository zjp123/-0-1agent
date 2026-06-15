# Secrets / KMS / Credential Governance

## 目标

本步骤增加生产级凭证治理能力，避免模型、工具和外部 provider 凭证散落在环境变量或代码中。

核心目标：

- secret metadata store
- secret value encryption interface
- provider credential registry
- secret rotation audit
- secret value read audit
- 生产环境要求 `SECRETS_MASTER_KEY`

## 新增文件

```text
apps/api/src/secrets/
  secrets.module.ts
  secrets.controller.ts
  secrets.service.ts
  secret-crypto.service.ts
  dto/create-secret.dto.ts
  dto/read-secret-value.dto.ts
  dto/update-secret.dto.ts
  dto/rotate-secret.dto.ts
  dto/create-provider-credential.dto.ts

apps/api/drizzle/0008_hard_ulik.sql
apps/api/drizzle/0009_shocking_ender_wiggin.sql
apps/api/drizzle/meta/0008_snapshot.json
apps/api/drizzle/meta/0009_snapshot.json
```

## 修改文件

```text
apps/api/src/app.module.ts
apps/api/src/common/config/configuration.ts
apps/api/src/common/config/validate-env.ts
apps/api/src/db/schema.ts
apps/api/drizzle/meta/_journal.json
```

## 数据库表

### secret_values

用于保存 secret 元数据和密文。

字段：

- `tenant_id`
- `name`
- `provider`
- `purpose`
- `encrypted_value`
- `value_hash`
- `enabled`
- `rotation_required`
- `expires_at`
- `last_rotated_at`
- `last_used_at`
- `metadata`
- `created_at`
- `updated_at`

### provider_credentials

用于把租户内 provider credential alias 绑定到 secret。

字段：

- `tenant_id`
- `provider`
- `credential_type`
- `secret_value_id`
- `alias`
- `enabled`
- `expires_at`
- `metadata`
- `created_at`
- `updated_at`

## 加密模型

当前实现为本地可替换加密接口：

```text
AES-256-GCM
```

master key 来源：

```bash
SECRETS_MASTER_KEY=
SECRETS_MASTER_KEY_ID=
```

生产环境必须配置 `SECRETS_MASTER_KEY`。

开发环境如果未配置，会使用 dev fallback key：

```text
development-only-secret-master-key-change-me
```

该 fallback 只能用于本地开发，不能用于生产。

## API

所有接口前缀：

```text
/api/secrets
```

所有接口要求：

```ts
@RequirePermissions("auth:manage")
```

### Secret 管理

```http
GET /api/secrets
POST /api/secrets
GET /api/secrets/:secretId/value
PATCH /api/secrets/:secretId
POST /api/secrets/:secretId/rotate
```

创建 secret：

```json
{
  "name": "openai-prod",
  "provider": "openai",
  "purpose": "llm-api-key",
  "value": "secret-value",
  "metadata": {
    "env": "production"
  },
  "reason": "Register production OpenAI credential"
}
```

读取 secret value 会更新 `last_used_at` 并写入审计事件。

如果租户配置了审批策略：

```text
action=secrets.secret.read_value
resourceType=secret_value
```

读取 secret value 必须带上已审批通过的 `approvalId`：

```http
GET /api/secrets/:secretId/value?approvalId=approval-request-id
```

轮换 secret：

```json
{
  "value": "new-secret-value",
  "reason": "Scheduled credential rotation",
  "approvalId": "approval-request-id"
}
```

如果租户配置了审批策略：

```text
action=secrets.secret.rotate
resourceType=secret_value
```

轮换 secret 必须带上已审批通过的 `approvalId`。

### Provider Credential 管理

```http
GET /api/secrets/provider-credentials
POST /api/secrets/provider-credentials
```

创建 provider credential：

```json
{
  "provider": "openai",
  "credentialType": "api_key",
  "alias": "default",
  "secretValueId": "secret-uuid",
  "reason": "Bind default OpenAI credential"
}
```

## 审计动作

当前写入的 action：

- `secrets.secret.create`
- `secrets.secret.read_value`
- `secrets.secret.update`
- `secrets.secret.rotate`
- `secrets.provider_credential.create`

## 当前边界

已完成：

- secret metadata store
- AES-256-GCM local encryption interface
- encrypted secret value store
- provider credential registry
- secret create / list / read value / update / rotate
- provider credential create / list
- secret read audit
- secret rotation audit
- secret read approval hook
- secret rotation approval hook
- production `SECRETS_MASTER_KEY` 校验
- Drizzle migration

未完成：

- 外部 KMS / Vault adapter
- secret delete / soft delete
- provider credential disable / rotate API
- 模型和工具运行时自动按 alias 读取 credential
- secret value read 的更细粒度权限
- secret rotation policy scheduler

## 验证

本步骤完成后需要执行：

```bash
npm run db:generate
npm run check
npm run build
```

## 下一步

建议下一步实现 `Multi-agent Orchestration Enhancement`：

1. agent role / participant registry
2. coordinator / worker / reviewer 编排模型
3. 多智能体任务分解与交接记录
4. 多智能体运行 trace
5. 编排失败恢复与超时治理
