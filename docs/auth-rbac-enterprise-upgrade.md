# Auth RBAC Enterprise Upgrade

## 目标

Auth RBAC Enterprise Upgrade 将认证入口从开发期 API key 模式升级为企业级多认证入口。

这一步保留原有 API key / dev fallback 兼容，同时新增：

- JWT Bearer token
- service token
- 集中式 role -> permission 映射
- tenant claim 校验
- 生产环境认证配置校验
- 持久化 RBAC role / permission 解析
- service token hash-only 持久化存储

## 当前实现

路径：

```text
apps/api/src/auth/
  api-key.guard.ts
  auth-rbac.service.ts
  auth.service.ts
  auth.types.ts

apps/api/src/common/config/
  configuration.ts
  validate-env.ts

apps/api/src/db/schema.ts
apps/api/drizzle/0004_eager_wallflower.sql
```

## 认证优先级

`ApiKeyGuard` 当前按以下顺序认证：

1. `Authorization: Bearer <jwt>`
2. DB `x-service-token`
3. env `x-service-token`
4. `x-api-key`
5. development 环境 dev fallback

如果请求带了 Bearer token 但服务端没有配置 `JWT_SECRET`，请求会被拒绝。

## JWT

请求头：

```http
Authorization: Bearer <jwt>
```

当前支持：

- HS256
- `sub`
- `tenantId` 或 `tid`
- `roles`
- `permissions`
- `exp`
- `iss`
- `aud`
- `jti`

配置：

```bash
JWT_SECRET=
JWT_ISSUER=
JWT_AUDIENCE=
```

校验：

- JWT 必须是 HS256
- 签名必须匹配 `JWT_SECRET`
- `exp` 过期后拒绝
- 如果配置 `JWT_ISSUER`，必须匹配 `iss`
- 如果配置 `JWT_AUDIENCE`，必须匹配 `aud`
- 如果请求携带 `x-tenant-id`，必须与 token 中 `tenantId/tid` 一致

## Service Token

请求头：

```http
x-service-token: <token>
x-tenant-id: optional-tenant
```

配置：

```bash
SERVICE_TOKEN=
SERVICE_TOKEN_USER_ID=service-token-user
SERVICE_TOKEN_TENANT_ID=default
SERVICE_TOKEN_ROLES=service
SERVICE_TOKEN_PERMISSIONS=
```

行为：

- 使用 constant-time comparison 校验 token
- 默认角色为 `service`
- 可通过 `SERVICE_TOKEN_ROLES` 和 `SERVICE_TOKEN_PERMISSIONS` 收窄或扩展权限
- `x-tenant-id` 可覆盖默认 service tenant，用于多租户后台任务或运维调用

## API Key

请求头：

```http
x-api-key: <api-key>
x-user-id: optional-user
x-tenant-id: optional-tenant
```

配置：

```bash
API_KEY=
```

行为：

- 保留兼容
- 默认角色为 `developer`
- 适合内部网关、开发、迁移期调用

## Dev Fallback

development 环境如果没有配置 `API_KEY` / `JWT_SECRET` / `SERVICE_TOKEN`，会使用：

```text
userId: dev-user
tenantId: default
roles: admin
authType: dev
```

production 环境必须配置至少一种认证方式：

- `API_KEY`
- `JWT_SECRET`
- `SERVICE_TOKEN`

## Roles

当前角色：

- `viewer`
- `operator`
- `developer`
- `service`
- `admin`

## Permissions

当前权限：

- `agent:run`
- `tools:execute`
- `knowledge:read`
- `knowledge:write`
- `observability:read`
- `workflow:manage`
- `evaluation:manage`
- `auth:manage`

## Role Mapping

`AuthService` 统一维护 role -> permission 映射。

JWT 可携带显式 `permissions`，最终权限为：

```text
permissionsForRoles(roles) + explicitPermissions
```

无效 role / permission 会被忽略。

JWT 通过签名、issuer、audience、tenant 校验后，会叠加数据库授权：

1. 通过 `tenantId + sub` 解析本地 tenant/user
2. 读取 `users.roles`
3. 读取 `auth_user_roles -> auth_roles`
4. 合并 token roles / token permissions / database roles / database permissions

## Persistent RBAC

新增表：

- `auth_roles`
- `auth_user_roles`
- `auth_service_tokens`

service token 明文不入库，只保存：

```text
sha256(token)
```

如果 DB 命中 token hash，但 token 已禁用、已过期或 tenant 不匹配，请求会被拒绝，不会继续回退到 env token。

详细文档见 [auth-persistent-rbac-service-token-store.md](./auth-persistent-rbac-service-token-store.md)。

## Tenant Isolation

当前业务接口继续从 `CurrentUser` 获取：

- `tenantId`
- `userId`
- `permissions`

JWT 模式下，如果 `x-tenant-id` 与 token claim 不一致，请求会被拒绝，避免调用方伪造租户。

## 当前边界

已完成：

- JWT Bearer token 认证
- service token 认证
- API key 兼容
- dev fallback 兼容
- role -> permission 集中映射
- JWT issuer / audience / exp 校验
- tenant header 与 JWT claim 一致性校验
- production 至少一种认证方式校验
- RBAC role / permission 持久化表
- 用户角色从数据库解析
- service token hash 持久化
- service token enabled / expiresAt / lastUsedAt

未完成：

- 用户角色管理 API
- service token 创建 / 吊销 / 轮换 API
- refresh token / session
- admin 操作 reason/comment
- 审计日志查询增强

## 下一步

建议下一步实现 `Auth Admin API / Audit Reason`：

1. 增加 role 管理 API
2. 增加用户 role assignment API
3. 增加 service token 创建、禁用、轮换 API
4. 管理接口要求 `auth:manage`
5. 管理操作记录 reason/comment
