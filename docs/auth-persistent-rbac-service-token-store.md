# Persistent RBAC / Service Token Store

## 目标

本步骤把 Auth 从纯配置型认证升级为可持久化治理能力。

核心目标：

- 角色和权限可以落 PostgreSQL
- JWT 用户可以叠加数据库角色授权
- service token 只存 hash，不保存明文 token
- service token 支持启停、过期、最后使用时间
- 保留 env `SERVICE_TOKEN` 作为兼容 fallback

## 新增文件

```text
apps/api/src/auth/auth-rbac.service.ts
apps/api/drizzle/0004_eager_wallflower.sql
apps/api/drizzle/meta/0004_snapshot.json
```

## 修改文件

```text
apps/api/src/auth/api-key.guard.ts
apps/api/src/auth/auth.module.ts
apps/api/src/db/schema.ts
apps/api/drizzle/meta/_journal.json
```

## 数据库表

### auth_roles

用于保存全局或租户级角色。

字段：

- `tenant_id`: 为空表示全局角色，非空表示租户角色
- `name`: 角色名
- `permissions`: 权限列表
- `description`: 说明
- `created_at`
- `updated_at`

索引：

- `auth_roles_tenant_name_idx`

### auth_user_roles

用于保存用户和角色的绑定关系。

字段：

- `tenant_id`
- `user_id`
- `role_id`
- `created_at`

索引：

- `auth_user_roles_user_role_idx`
- `auth_user_roles_tenant_user_idx`

### auth_service_tokens

用于保存 service token 的安全元数据。

字段：

- `tenant_id`
- `name`
- `token_hash`
- `roles`
- `permissions`
- `enabled`
- `expires_at`
- `last_used_at`
- `created_at`
- `updated_at`

索引：

- `auth_service_tokens_hash_idx`
- `auth_service_tokens_tenant_idx`

## Token Hash

service token 明文不入库。

认证时使用：

```text
sha256(token)
```

数据库只保存 hash：

```text
auth_service_tokens.token_hash
```

如果数据库命中 hash，但 token 已禁用、已过期或 tenant 不匹配，请求会被拒绝，不会继续回退到 env token。

## 认证顺序

`ApiKeyGuard` 当前认证顺序：

1. JWT Bearer token
2. DB service token
3. env `SERVICE_TOKEN`
4. API key
5. development fallback

## JWT 授权解析

JWT 仍负责身份声明和签名校验：

- `sub`
- `tenantId` 或 `tid`
- `roles`
- `permissions`
- `exp`
- `iss`
- `aud`
- `jti`

JWT 通过校验后，系统会调用 `AuthRbacService.resolveUserAuthorization`：

1. 通过 `tenantId + sub` 解析或创建本地 tenant/user
2. 读取 `users.roles`
3. 读取 `auth_user_roles -> auth_roles`
4. 合并 token roles、token permissions 和数据库授权
5. 通过 `AuthService` 统一过滤无效 role / permission

最终权限计算：

```text
permissionsForRoles(mergedRoles) + explicitPermissions
```

## Service Token 授权解析

请求头：

```http
x-service-token: <token>
x-tenant-id: optional-tenant
```

处理流程：

1. 计算 `sha256(token)`
2. 查询 `auth_service_tokens.token_hash`
3. 校验 `enabled`
4. 校验 `expires_at`
5. 如果请求携带 `x-tenant-id`，校验 token 所属 tenant
6. 更新 `last_used_at`
7. 注入 `RequestUser`

DB service token 返回的 `userId` 格式：

```text
service-token:<name>
```

## 兼容策略

为了兼容旧部署，数据库没有命中 service token hash 时，仍会继续检查 env `SERVICE_TOKEN`。

env fallback 配置：

```bash
SERVICE_TOKEN=
SERVICE_TOKEN_USER_ID=service-token-user
SERVICE_TOKEN_TENANT_ID=default
SERVICE_TOKEN_ROLES=service
SERVICE_TOKEN_PERMISSIONS=
```

## 当前边界

已完成：

- RBAC 持久化表
- service token 持久化表
- service token hash-only 存储模型
- JWT 用户数据库授权叠加
- DB service token 优先认证
- env service token fallback
- token `enabled` / `expires_at` / `last_used_at`
- Drizzle migration

未完成：

- Auth Admin API
- role 创建 / 更新 / 删除接口
- 用户角色绑定接口
- service token 创建 / 吊销 / 轮换接口
- auth 操作 reason/comment
- auth 审计查询接口
- refresh token / session 管理

## 验证

本步骤完成后需要执行：

```bash
npm run db:generate
npm run check
npm run build
```

## 下一步

建议下一步实现 `Auth Admin API / Audit Reason`：

1. 增加 role 管理接口
2. 增加用户 role assignment 接口
3. 增加 service token 创建、禁用、轮换接口
4. 所有管理操作要求 `auth:manage`
5. 管理操作记录 reason/comment，后续接入审计查询
