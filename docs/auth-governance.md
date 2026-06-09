# Auth & Governance

## 目标

Auth & Governance 模块负责生产级 Agent 平台的身份、租户、权限和治理边界。

当前阶段实现开发期可用的 API Key Guard 和权限框架，为后续 JWT、Refresh Token、RBAC 持久化、多租户隔离和审计系统预留结构。

## 当前实现

路径：

```text
apps/api/src/auth/
  auth.types.ts
  auth.service.ts
  auth.module.ts
  api-key.guard.ts
  permissions.guard.ts
  permissions.decorator.ts
  current-user.decorator.ts
```

## 身份模型

当前请求用户结构：

```ts
type RequestUser = {
  userId: string;
  tenantId: string;
  roles: Role[];
  permissions: Permission[];
  authType: "api_key" | "dev";
};
```

当前权限：

- `agent:run`
- `tools:execute`
- `knowledge:read`
- `knowledge:write`
- `observability:read`

当前角色：

- `developer`
- `operator`
- `admin`

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
- API Key Guard
- Permission Guard
- CurrentUser decorator
- RequirePermissions decorator
- 生产环境 API_KEY 校验
- Agent/Tools/Knowledge/Observability 接口权限接入
- Knowledge tenantId 改由认证上下文注入

未完成：

- JWT 登录
- Refresh Token
- 用户/租户/角色持久化
- 细粒度 RBAC 管理接口
- API key 轮换
- 租户级配额
- 审计持久化
- 与数据库权限模型联动

## 下一步

建议下一步实现 `Workflow Engine` 基础版：

1. 定义 workflow、task、step 状态类型
2. 提供 in-memory workflow store
3. 支持创建任务计划
4. 支持 step 状态更新
5. 为后续 Plan/Execute 和可恢复任务做准备
