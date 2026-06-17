# Web Console Auth / Login Session

## 目标

完成 Web Console Phase 13 正式 Auth / 登录体系，让 Web 从手动输入 API key / service token 的本地调试模式，升级为可治理的浏览器会话模式。

## 实现范围

### API Console Auth

新增接口：

```text
POST /api/auth/console/login
POST /api/auth/console/refresh
POST /api/auth/console/logout
GET  /api/auth/console/me
```

新增文件：

```text
apps/api/src/auth/console-auth.controller.ts
apps/api/src/auth/console-auth.service.ts
apps/api/src/auth/dto/console-login.dto.ts
apps/api/src/auth/dto/console-refresh.dto.ts
```

登录模式：

- `service_token`: 使用现有 service token 换取 Web Console session。
- `api_key`: 使用现有 API key 换取 Web Console session。

签发结果：

- `accessToken`: 15 分钟短期 JWT。
- `refreshToken`: 7 天 refresh token，数据库只保存 hash。
- `sessionId`: 记录到 `auth_sessions`。
- `user`: 当前用户、tenant、roles、permissions、authType。

### Session / Refresh Governance

复用现有表：

```text
auth_sessions
auth_refresh_tokens
```

会话策略：

- 登录时创建 `auth_sessions`。
- 登录时创建 hash-only `auth_refresh_tokens`。
- refresh 时轮换 refresh token。
- logout 时撤销当前 refresh token。
- refresh 后保留登录时的 roles / permissions 快照，避免权限语义漂移。

### Web Session Provider

新增：

```text
apps/web/src/components/auth/session-provider.tsx
apps/web/src/components/auth/local-credential-fields.tsx
```

能力：

- 保存 Web Console session 到 `localStorage`。
- 页面刷新后恢复 session。
- access token 快过期时自动 refresh。
- 提供 `useSession()`。
- 提供 `useEffectiveCredentials(apiKey, serviceToken)`。
- 已登录时优先使用 `Authorization: Bearer <accessToken>`。
- 未登录时保留手动 API key / service token 作为本地开发入口。
- 工作台统一使用 `LocalCredentialFields`：已登录时隐藏手动 `API key` / `Service token` 输入框，未登录时才展示本地调试凭证输入。

### Login Page

新增：

```text
apps/web/src/app/login/page.tsx
apps/web/src/features/auth/login-form.tsx
```

能力：

- 支持 service token 登录。
- 支持 API key 登录。
- 支持 tenant / user / device label。
- 登录成功后跳转 Dashboard。

### 权限视图裁剪

更新：

```text
apps/web/src/components/layout/app-shell.tsx
```

能力：

- 顶部显示当前登录状态、user、tenant、authType。
- 支持退出登录。
- 导航菜单根据权限裁剪。
- 未登录时仍展示基础 Dashboard / API Docs / Login。

权限映射：

```text
Agent Chat     -> agent:run
Knowledge      -> knowledge:read
Tools          -> tools:execute
Workflows      -> workflow:manage
Security       -> auth:manage
Evaluations    -> evaluation:manage
Observability  -> observability:read
```

### 工作台接入

以下页面已优先使用 Web session Bearer token：

- Agent Chat
- Tools
- Knowledge / RAG
- Workflow
- Security / Auth Governance
- Evaluation
- Observability

未登录时仍可手动输入 API key / service token 做本地调试。

## 环境变量

本地建议：

```text
API_KEY=replace-with-local-api-key
JWT_SECRET=development-only-jwt-secret-change-me
JWT_ISSUER=enterprise-agent-api
JWT_AUDIENCE=enterprise-agent-web
SERVICE_TOKEN=local-admin-service-token
SERVICE_TOKEN_ROLES=admin
SERVICE_TOKEN_TENANT_ID=default
```

`API_KEY` 用于登录页选择 `API key` 时的 credential，也用于 curl 调用受保护 API 时的 `x-api-key`。本地可用 `openssl rand -hex 32` 生成后写入根目录 `.env`，修改后需要重启 API 服务。

`LLM_API_KEY` 是 Agent 调用模型供应商的凭证，和 `API_KEY` 不是同一个东西。

生产要求：

- 必须使用强随机 `JWT_SECRET`。
- 不得使用 `development-only-jwt-secret-change-me`。
- 不得使用 `local-admin-service-token`。
- 建议通过正式 IdP / SSO 替换本地 credential exchange。

## 当前边界

已完成：

- Web 登录页。
- Access Token / Refresh Token 会话续期。
- 退出登录。
- 前端 session provider。
- 导航菜单权限裁剪。
- 工作台优先使用 Bearer session。
- 本地手动 API key / service token fallback。
- Agent Chat、Knowledge、Tools、Workflows、Security、Evaluations、Observability 的手动凭证输入行为已统一。
- 与 API JWT / RBAC / Session Governance 联动。

后续增强：

- 正式用户名密码或企业 IdP / SSO。
- HttpOnly cookie session。
- CSRF 策略。
- session 设备列表和主动撤销 UI。
- refresh token 重放检测。
- 更细粒度页面级强制跳转。

## 本地登录 500 排查记录

记录日期：2026-06-17

现象：Login 页面选择 `API key`，输入正确 key 后点击登录，接口返回：

```text
{"statusCode":500,"message":"Unexpected error","path":"/api/auth/console/login"}
```

根因：本地 Docker Postgres 尚未执行数据库迁移，`tenants`、`users`、`auth_sessions`、`auth_refresh_tokens` 等表不存在。API key 校验通过后，后端需要创建 Web Console session 和 refresh token；缺表会导致 session 落库失败并返回 500。

修复：

```bash
DATABASE_URL=postgresql://agent:agent_password@localhost:15432/agent_db \
DATABASE_MIGRATIONS_FOLDER=/Users/bjsttlp406/others/-0-1agent/apps/api/drizzle \
npm run db:migrate
```

验证：

- 正确 API key 登录返回 `201 Created` 和 access/refresh token。
- 错误 API key 返回 `401 Invalid API key`，不再表现为 500。
- Web `fetchJson` 会把 JSON 错误体归一为短文案，登录页不直接展示原始 JSON。

## 验证

API check：

```bash
PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH npm run check -w @enterprise-agent/api
```

结果：

```text
passed
```

API build：

```bash
PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH npm run build -w @enterprise-agent/api
```

结果：

```text
passed
```

Web check：

```bash
PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH npm run check:web
```

结果：

```text
passed
```

接口冒烟：

- `POST /api/auth/console/login`: 通过。
- `GET /api/auth/console/me`: 通过。
- `POST /api/auth/console/refresh`: 通过，refresh 后保持 `admin` / `auth:manage`。
- `POST /api/auth/console/logout`: 通过。
