# Auth & Governance

## 目标

Auth & Governance 模块负责生产级 Agent 平台的身份、租户、权限和治理边界。

当前阶段已经从开发期 API Key Guard 升级为多认证入口，支持 JWT、持久化 service token、API key 和 development fallback。

## 当前实现

路径：

```text
apps/api/src/auth/
  auth.types.ts
  auth.service.ts
  auth-rbac.service.ts
  auth.module.ts
  api-key.guard.ts
  permissions.guard.ts
  permissions.decorator.ts
  current-user.decorator.ts

apps/api/src/db/schema.ts
apps/api/drizzle/0004_eager_wallflower.sql
```

## 身份模型

当前请求用户结构：

```ts
type RequestUser = {
  userId: string;
  tenantId: string;
  roles: Role[];
  permissions: Permission[];
  authType: "api_key" | "dev" | "jwt" | "service_token";
  tokenId?: string;
};
```

当前权限：

- `agent:run`
- `tools:execute`
- `knowledge:read`
- `knowledge:write`
- `observability:read`
- `workflow:manage`
- `evaluation:manage`
- `auth:manage`

当前角色：

- `viewer`
- `developer`
- `operator`
- `admin`
- `service`

## JWT

请求头：

```http
Authorization: Bearer <jwt>
```

配置项：

```bash
JWT_SECRET=
JWT_ISSUER=
JWT_AUDIENCE=
```

当前支持 HS256，并校验 `sub`、`tenantId/tid`、`exp`、`iss`、`aud`。

如果请求同时携带 `x-tenant-id`，必须与 JWT 中的 tenant claim 一致。

JWT 校验通过后，会叠加数据库 RBAC：

- `users.roles`
- `auth_user_roles`
- `auth_roles.permissions`

## Service Token

请求头：

```http
x-service-token: token
x-tenant-id: optional-tenant
```

配置项：

```bash
SERVICE_TOKEN=
SERVICE_TOKEN_USER_ID=service-token-user
SERVICE_TOKEN_TENANT_ID=default
SERVICE_TOKEN_ROLES=service
SERVICE_TOKEN_PERMISSIONS=
```

service token 优先查询 PostgreSQL 中的 `auth_service_tokens`：

- 明文 token 不入库
- 入库字段为 `sha256(token)`
- 支持 `enabled`
- 支持 `expires_at`
- 每次使用更新 `last_used_at`

数据库没有命中 token hash 时，才回退到 env `SERVICE_TOKEN` 兼容模式。

## API Key Guard

请求头：

```http
x-api-key: dev-api-key
x-user-id: optional-user-id
x-tenant-id: optional-tenant-id
```

配置项：

```bash
API_KEY=dev-api-key
```

行为：

- 开发环境如果未配置 `API_KEY`，自动使用 `dev-user/default`。
- 生产环境必须配置 `API_KEY`。
- 配置 `API_KEY` 后，请求必须携带匹配的 `x-api-key`。
- `tenantId` 从 `x-tenant-id` 或默认 `default` 注入，不再信任业务 body。

## 权限 Guard

通过装饰器声明接口所需权限：

```ts
@RequirePermissions("agent:run")
```

当前已保护接口：

- `POST /api/agent/run`
- `POST /api/tools/execute`
- `POST /api/knowledge/ingest`
- `POST /api/knowledge/retrieve`
- `GET /api/knowledge/documents`
- `GET /api/observability/traces`
- `POST /api/workflows`
- `GET /api/workflows`
- `GET /api/workflows/:workflowId`
- `PATCH /api/workflows/:workflowId/steps/:stepId`
- `POST /api/evaluations/cases`
- `GET /api/evaluations/cases`
- `POST /api/evaluations/cases/:caseId/runs`
- `GET /api/evaluations/runs`

当前保持公开接口：

- `GET /api/health`
- `GET /api/agent/capabilities`
- `GET /api/tools`

## 租户隔离

当前 RAG / Knowledge 不再从 body 读取 `tenantId`，而是从认证上下文读取。

这避免了调用方伪造 tenantId 访问其他租户知识。

当前 Agent Runtime 也从认证上下文获取：

- `userId`
- `tenantId`
- `permissions`

Tool Registry 执行上下文同样使用认证上下文里的权限。

## 当前边界

已完成：

- RequestUser 类型
- Permission 类型
- Role 类型
- JWT Bearer token 认证
- service token 认证
- API Key Guard 兼容
- development fallback
- Permission Guard
- CurrentUser decorator
- RequirePermissions decorator
- 生产环境至少一种认证方式校验
- role -> permission 集中映射
- RBAC role / permission 持久化表
- JWT 用户数据库授权叠加
- service token hash-only 持久化存储
- DB service token enabled / expiresAt / lastUsedAt
- JWT issuer / audience / exp 校验
- tenant header 与 JWT claim 一致性校验
- Agent/Tools/Knowledge/Observability 接口权限接入
- Knowledge tenantId 改由认证上下文注入

未完成：

- Refresh Token / session
- 细粒度 RBAC 管理接口
- service token 创建 / 吊销 / 轮换接口
- 租户级配额
- 审计持久化
- auth 操作 reason/comment

## 下一步

建议下一步实现 `Auth Admin API / Audit Reason`：

1. 增加 role 管理接口
2. 增加用户角色绑定接口
3. 增加 service token 创建、禁用、轮换接口
4. 管理操作要求 `auth:manage`
5. 管理操作记录 reason/comment
