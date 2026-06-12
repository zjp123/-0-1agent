# Auth Admin API / Audit Reason

## 目标

本步骤把持久化 RBAC 从“底层表和认证解析”升级为可运维的管理面。

核心目标：

- 提供租户内 role 管理 API
- 提供用户 role assignment API
- 提供 service token 创建、禁用、轮换 API
- 提供 auth session / refresh token 管理 API
- 管理接口统一要求 `auth:manage`
- 所有写操作必须携带 `reason`
- 管理操作写入 PostgreSQL 审计表

## 新增文件

```text
apps/api/src/auth/auth-admin.controller.ts
apps/api/src/auth/auth-admin.service.ts
apps/api/src/auth/dto/
apps/api/drizzle/0005_shiny_snowbird.sql
apps/api/drizzle/meta/0005_snapshot.json
```

## 修改文件

```text
apps/api/src/auth/auth.module.ts
apps/api/src/db/schema.ts
apps/api/drizzle/meta/_journal.json
```

## 数据库表

### auth_admin_audit_events

用于记录 auth 管理操作。

字段：

- `tenant_id`: 操作所属租户
- `actor_user_id`: 操作者外部 user id
- `actor_auth_type`: `jwt` / `service_token` / `api_key` / `dev`
- `actor_token_id`: 可选 token id
- `action`: 操作类型
- `target_type`: 目标类型
- `target_id`: 目标 id
- `reason`: 必填原因
- `comment`: 可选补充说明
- `metadata`: 操作上下文
- `created_at`

索引：

- `auth_admin_audit_events_tenant_created_idx`
- `auth_admin_audit_events_target_idx`

## API

所有接口前缀：

```text
/api/auth
```

所有接口要求：

```ts
@RequirePermissions("auth:manage")
```

### Role 管理

```http
GET /api/auth/roles
POST /api/auth/roles
PATCH /api/auth/roles/:roleId
DELETE /api/auth/roles/:roleId
```

创建 role：

```json
{
  "name": "support-operator",
  "permissions": ["knowledge:read", "observability:read"],
  "description": "Support read-only operations",
  "reason": "Create support operator role",
  "comment": "Initial production RBAC setup"
}
```

更新 role：

```json
{
  "permissions": ["knowledge:read", "observability:read", "workflow:manage"],
  "reason": "Grant workflow management for support escalation"
}
```

删除 role 会先删除该租户下的 user role assignments，再删除 role。

### 用户角色绑定

```http
GET /api/auth/users/:userId/roles
POST /api/auth/users/:userId/roles
DELETE /api/auth/users/:userId/roles/:roleId
```

绑定 role：

```json
{
  "roleId": "role-uuid",
  "reason": "Grant production support access",
  "comment": "Approved by platform owner"
}
```

`userId` 是外部用户 id。系统会通过当前 `tenantId + userId` 解析或创建本地 user 记录。

### Service Token 管理

```http
GET /api/auth/service-tokens
POST /api/auth/service-tokens
PATCH /api/auth/service-tokens/:tokenId
POST /api/auth/service-tokens/:tokenId/disable
POST /api/auth/service-tokens/:tokenId/rotate
```

创建 service token：

```json
{
  "name": "indexing-worker",
  "roles": ["service"],
  "permissions": ["knowledge:read", "knowledge:write"],
  "expiresAt": "2026-12-31T23:59:59.000Z",
  "reason": "Create token for production indexing worker"
}
```

响应只在创建和轮换时返回明文 token 一次：

```json
{
  "id": "token-uuid",
  "name": "indexing-worker",
  "token": "plain-token-returned-once"
}
```

数据库只保存：

```text
sha256(token)
```

### 审计查询

```http
GET /api/auth/audit-events
```

当前返回当前租户最近 100 条 auth 管理审计事件。

## 租户边界

本步骤开放的是租户内管理面：

- 当前用户只能管理自己 `tenantId` 下的 roles
- 当前用户只能绑定自己 `tenantId` 下的用户角色
- 当前用户只能管理自己 `tenantId` 下的 service tokens
- global roles 表结构保留，但当前 API 不开放跨租户/global 管理

## 审计动作

当前写入的 action：

- `auth.role.create`
- `auth.role.update`
- `auth.role.delete`
- `auth.user_role.assign`
- `auth.user_role.revoke`
- `auth.service_token.create`
- `auth.service_token.update`
- `auth.service_token.disable`
- `auth.service_token.rotate`
- `auth.session.register`
- `auth.session.revoke`
- `auth.refresh_token.create`
- `auth.refresh_token.rotate`
- `auth.refresh_token.revoke`

## 当前边界

已完成：

- Auth Admin Controller
- Auth Admin Service
- role 创建 / 查询 / 更新 / 删除
- 用户 role 查询 / 绑定 / 撤销
- service token 查询 / 创建 / 更新 / 禁用 / 轮换
- service token 明文只返回一次
- 管理接口 `auth:manage` 权限保护
- 写操作 `reason` 必填
- auth 管理审计表
- auth 审计查询
- Drizzle migration
- refresh token / session 管理

未完成：

- 更细粒度的 auth admin 分权
- 审计事件分页和过滤
- 审计事件导出
- break-glass / emergency access 流程
- service token 创建后的外部密钥库托管

## 验证

本步骤完成后需要执行：

```bash
npm run db:generate
npm run check
npm run build
```

## 下一步

建议下一步实现 `Rate Limiting / Quota Governance`：

1. Redis rate limiter
2. tenant/user/tool 维度限流
3. LLM token / request quota
4. 限流事件审计
5. 管理端 quota 配置
