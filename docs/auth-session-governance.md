# Refresh Token / Session Governance

## 目标

本步骤把 Auth 治理从 RBAC / service token 管理扩展到认证会话治理。

核心目标：

- 持久化 auth session
- 持久化 refresh token 元数据
- refresh token 只存 hash
- 支持 session revoke
- 支持 refresh token verify / rotate / revoke
- JWT 认证时检查已登记 session 是否被撤销或过期
- 所有管理写操作记录 auth audit events

## 新增文件

```text
apps/api/src/auth/auth-session.service.ts
apps/api/src/auth/dto/create-refresh-token.dto.ts
apps/api/src/auth/dto/register-auth-session.dto.ts
apps/api/src/auth/dto/verify-refresh-token.dto.ts
apps/api/drizzle/0006_whole_the_phantom.sql
apps/api/drizzle/meta/0006_snapshot.json
```

## 修改文件

```text
apps/api/src/auth/api-key.guard.ts
apps/api/src/auth/auth-admin.controller.ts
apps/api/src/auth/auth.module.ts
apps/api/src/db/schema.ts
apps/api/drizzle/meta/_journal.json
```

## 数据库表

### auth_sessions

用于保存平台可治理的认证会话。

字段：

- `tenant_id`
- `user_id`
- `token_id`: 对应 JWT `sid` 或 `jti`
- `status`: 当前为 `active` / `revoked`
- `device_label`
- `ip_address`
- `user_agent`
- `expires_at`
- `revoked_at`
- `revoke_reason`
- `metadata`
- `created_at`
- `updated_at`

### auth_refresh_tokens

用于保存 refresh token 元数据。

字段：

- `tenant_id`
- `user_id`
- `session_id`
- `token_hash`
- `enabled`
- `expires_at`
- `last_used_at`
- `rotated_at`
- `revoked_at`
- `revoke_reason`
- `created_at`
- `updated_at`

## API

所有接口前缀：

```text
/api/auth
```

所有接口要求：

```ts
@RequirePermissions("auth:manage")
```

### Session 管理

```http
GET /api/auth/sessions
POST /api/auth/sessions
POST /api/auth/sessions/:sessionId/revoke
```

登记 session：

```json
{
  "userId": "external-user-id",
  "tokenId": "jwt-jti-or-sid",
  "deviceLabel": "MacBook Pro",
  "expiresAt": "2026-12-31T23:59:59.000Z",
  "metadata": {
    "provider": "enterprise-idp"
  },
  "reason": "Register platform-governed session"
}
```

撤销 session 会同时禁用该 session 下的 refresh tokens。

### Refresh Token 管理

```http
GET /api/auth/refresh-tokens
POST /api/auth/sessions/:sessionId/refresh-tokens
POST /api/auth/refresh-tokens/verify
POST /api/auth/refresh-tokens/:refreshTokenId/rotate
POST /api/auth/refresh-tokens/:refreshTokenId/revoke
```

refresh token 明文只在创建和轮换响应中返回一次，数据库只保存 `sha256(token)`。

## JWT Session Revocation

JWT 认证仍保持兼容外部 IdP。

如果 JWT 没有登记到 `auth_sessions`，系统继续按 JWT 签名、issuer、audience、tenant 和 RBAC 规则认证。

如果 JWT 带 `sid` 或 `jti`，且该 token id 已登记到 `auth_sessions`：

1. 校验 tenant/user 是否匹配
2. 校验 session `status`
3. 校验 `revoked_at`
4. 校验 `expires_at`

任何不匹配、撤销或过期都会拒绝请求。

## 审计动作

当前写入的 action：

- `auth.session.register`
- `auth.session.revoke`
- `auth.refresh_token.create`
- `auth.refresh_token.rotate`
- `auth.refresh_token.revoke`

## 当前边界

已完成：

- auth session 持久化表
- refresh token 持久化表
- refresh token hash-only 存储模型
- session register / list / revoke
- refresh token list / create / verify / rotate / revoke
- JWT session revocation 检查
- session revoke 联动禁用 refresh tokens
- auth audit events 接入
- Drizzle migration

未完成：

- 直接签发 access JWT
- refresh token 换 access token 的完整登录流
- refresh token 重放检测与自动封禁
- session 分页和过滤
- 设备可信度评分
- break-glass / emergency access 流程

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
