# Email Password Auth / Personal Workspace

## 目标

本步骤把 Web Console 的主要登录路径从本地 API key / service token 换取 session，升级为邮箱密码注册登录。

核心目标：

- 邮箱全局唯一。
- 密码只保存 `scrypt` 哈希。
- 注册时自动创建个人 workspace，也就是系统内的 tenant。
- 注册用户自动成为该 workspace 的 `admin`。
- 登录后签发现有 Web Console access token / refresh token。
- API key / service token 保留为本地调试和系统集成入口，但不再作为普通用户主路径。

## 新增与修改

新增：

```text
POST /api/auth/console/register
apps/api/src/auth/dto/console-register.dto.ts
apps/api/drizzle/0016_email_password_auth.sql
apps/api/drizzle/meta/0016_snapshot.json
```

修改：

```text
apps/api/src/auth/console-auth.service.ts
apps/api/src/auth/console-auth.controller.ts
apps/api/src/auth/dto/console-login.dto.ts
apps/api/src/auth/auth.types.ts
apps/api/src/db/schema.ts
apps/web/src/lib/api/client.ts
apps/web/src/components/auth/session-provider.tsx
apps/web/src/features/auth/login-form.tsx
```

## 注册流程

```text
email + password + optional displayName/workspaceName
  -> 校验邮箱唯一
  -> 创建 tenant/workspace
  -> 创建 user，写入 email/password_hash/default_tenant_id
  -> 用户 roles = ["admin"]
  -> 创建 auth session 和 refresh token
  -> 返回 accessToken / refreshToken / user
```

对外返回的 `tenantId` 是 workspace 的外部名称，例如：

```text
alice-workspace-a1b2c3
```

数据库内部仍然使用 UUID 外键隔离数据。

## 登录流程

`POST /api/auth/console/login` 现在支持：

- `email_password`: 邮箱密码登录。
- `service_token`: 服务凭证换取 Web Console session。
- `api_key`: 本地 API key 换取 Web Console session。

普通用户应优先使用 `email_password`。

## 数据库变更

`users` 新增字段：

- `email`
- `password_hash`
- `email_verified`
- `default_tenant_id`

新增唯一索引：

```text
users_email_idx
```

## 当前边界

已完成：

- 邮箱密码注册。
- 邮箱密码登录。
- 注册时创建个人 workspace。
- 用户默认 workspace 记录到 `users.default_tenant_id`。
- 注册用户拥有 `admin` 权限。
- Web 登录页支持登录 / 注册切换。
- API key / service token 兼容入口保留。

后续增强：

- 邮箱验证。
- 忘记密码 / 重置密码。
- 团队 workspace 邀请和成员管理。
- 多 workspace 切换。
- HttpOnly cookie session 与 CSRF 策略。
