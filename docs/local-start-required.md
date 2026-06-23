# 本地启动必备文档

## 目标

本文档用于本地启动企业级 Agent 平台并进行自测，覆盖必备环境、配置文件、启动顺序、登录方式、健康检查和常见问题。

## 1. 必备环境

需要本机具备：

- Node.js `>= 22`
- npm `>= 10`
- Docker Desktop
- PostgreSQL client 可选，用于手动检查数据库

确认版本：

```bash
node -v
npm -v
docker --version
```

## 2. 安装依赖

首次启动或依赖变更后执行：

```bash
npm install
```

## 3. 准备 `.env`

如果根目录没有 `.env`，先复制：

```bash
cp .env.example .env
```

本地自测至少确认这些配置存在：

```text
NODE_ENV=development
PORT=3000
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001

NEXT_PUBLIC_WEB_ENV=local
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3000/api
WEB_PORT=3001

API_KEY=replace-with-local-api-key
JWT_SECRET=development-only-jwt-secret-change-me
JWT_ISSUER=enterprise-agent-api
JWT_AUDIENCE=enterprise-agent-web
SERVICE_TOKEN=local-admin-service-token
SERVICE_TOKEN_ROLES=admin
SERVICE_TOKEN_TENANT_ID=default
AUTH_COOKIE_SECURE=false
AUTH_COOKIE_SAMESITE=lax

DATABASE_URL=postgresql://agent:agent_password@localhost:15432/agent_db
POSTGRES_DB=agent_db
POSTGRES_USER=agent
POSTGRES_PASSWORD=agent_password
POSTGRES_PORT=15432
REDIS_URL=redis://localhost:6379
REDIS_PORT=6379
QDRANT_URL=http://localhost:6333
QDRANT_HTTP_PORT=6333
QDRANT_GRPC_PORT=6334
```

LLM 调用需要真实 key：

```text
LLM_API_KEY=your-api-key-here
```

如果只是测试 Web 页面、登录、Tools、Knowledge、Security 等基础能力，可以先保留 placeholder。

### `API_KEY` 怎么配置

`API_KEY` 是本项目后端自己的访问凭证，也是 Web 登录页选择 `API key` 时要输入的值。它不是大模型 key。

本地可以自己生成一个随机值：

```bash
openssl rand -hex 32
```

然后写入根目录 `.env`：

```text
API_KEY=<上一步生成的随机值>
```

注意：修改 `.env` 后需要重启 `npm run dev:api`，后端才会读取新值。

`LLM_API_KEY` 是后端调用 DeepSeek/OpenAI 兼容模型供应商时使用的 key。`API_KEY` 用来登录/调用本项目 API，`LLM_API_KEY` 用来让 Agent 真正调用大模型。

## 4. 启动基础设施

启动 PostgreSQL、Redis、Qdrant：

```bash
npm run infra:up
```

查看状态：

```bash
docker compose -f infra/docker-compose.yml ps
```

期望：

- `enterprise-agent-postgres` healthy
- `enterprise-agent-redis` healthy
- `enterprise-agent-qdrant` healthy

停止基础设施：

```bash
npm run infra:down
```

## 5. 启动 API

首次启动、重建 Docker volume、切换数据库端口，或看到登录/写库接口 500 时，先执行数据库迁移：

```bash
DATABASE_URL=postgresql://agent:agent_password@localhost:15432/agent_db \
DATABASE_MIGRATIONS_FOLDER=/Users/bjsttlp406/others/-0-1agent/apps/api/drizzle \
npm run db:migrate
```

确认所有表已经迁移到 Docker Postgres：

```bash
docker exec enterprise-agent-postgres psql -U agent -d agent_db -c "select count(*) as public_table_count from information_schema.tables where table_schema='public' and table_type='BASE TABLE';"
```

当前项目应有：

```text
public_table_count >= 31
```

查看完整表列表：

```bash
docker exec enterprise-agent-postgres psql -U agent -d agent_db -c "select table_schema, table_name from information_schema.tables where table_schema in ('public','drizzle') and table_type='BASE TABLE' order by table_schema, table_name;"
```

新开一个终端：

```bash
npm run dev:api
```

API 地址：

```text
http://127.0.0.1:3000/api
```

健康检查：

```bash
curl -fsS http://127.0.0.1:3000/api/health/ready
```

OpenAPI：

```text
http://127.0.0.1:3000/api/docs
```

## 6. 启动 Web

再新开一个终端：

```bash
npm run dev:web
```

Web 地址：

```text
http://localhost:3001
```

登录页：

```text
http://localhost:3001/login
```

## 7. 本地登录

登录页面填写：

```text
Credential type: Service token
Credential: local-admin-service-token
Tenant: default
```

也可以选择 API key 登录：

```text
Credential type: API key
Credential: .env 里的 API_KEY
Tenant: default
User: api-key-user
Device label: local-browser
```

登录成功后，顶部栏应显示：

```text
service-token-user / default
service_token
local
```

## 8. 手动自测路径

建议按顺序检查：

1. `/` Dashboard：API、DB、Vector 状态。
2. `/login`：登录、退出、重新登录。
3. `/agent-chat`：输入任务并发送 streaming 请求。
4. `/tools`：执行 calculator。
5. `/knowledge`：刷新文档、执行 retrieve。
6. `/security`：查看 roles、audit events、anomalies。
7. `/evaluations`：查看 cases / runs。
8. `/observability`：查看 traces。
9. `/workflows`：查看 workflow 和 scheduler 状态。

## 9. 常用命令

类型检查：

```bash
npm run check:web
npm run check -w @enterprise-agent/api
```

构建：

```bash
npm run build
npm run build:web
```

Web E2E：

```bash
npm run test:e2e:web
```

API 测试：

```bash
npm test
```

## 10. Playwright 首次准备

如果运行 Web E2E 提示缺少浏览器：

```bash
npx playwright install chromium
```

然后重试：

```bash
npm run test:e2e:web
```

## 11. 常见问题

### API health 失败

检查：

```bash
docker compose -f infra/docker-compose.yml ps
```

确认 PostgreSQL 和 Redis 已启动。

### 后端报 `role "agent" does not exist`

这是 2026-06-16 已记录过的本地端口冲突问题。优先参考：

```text
docs/local-postgres-port-conflict-runbook.md
```

典型错误：

```text
DrizzleQueryError: Failed query ...
cause: error: role "agent" does not exist
```

本项目本地 Postgres 必须使用：

```text
DATABASE_URL=postgresql://agent:agent_password@localhost:15432/agent_db
POSTGRES_PORT=15432
```

原因：

- 本机可能已有 PostgreSQL 监听 `127.0.0.1:5432`。
- 如果 API 连 `localhost:5432`，会连到本机 Postgres，而不是 Docker 容器。
- 本项目 Docker Postgres 应映射为 `15432 -> container 5432`。

检查 Docker 映射：

```bash
docker compose -f infra/docker-compose.yml ps
docker port enterprise-agent-postgres
```

期望：

```text
0.0.0.0:15432->5432/tcp
```

检查是否连到正确数据库：

```bash
node -e "import('pg').then(async ({Pool}) => { const pool = new Pool({ connectionString: 'postgresql://agent:agent_password@127.0.0.1:15432/agent_db' }); try { const r = await pool.query('select current_user, current_database()'); console.log(r.rows); } finally { await pool.end(); } })"
```

期望：

```text
current_user: agent
current_database: agent_db
```

如果 Docker 仍映射到 `5432`，先重启 infra：

```bash
npm run infra:down
npm run infra:up
```

如果 API 仍然连 `5432`，确认 `apps/api/src/app.module.ts` 的 `ConfigModule.forRoot` 包含：

```ts
envFilePath: [".env", "../../.env"]
```

这是为了让 `npm run dev:api` 在 workspace 启动时也能读取根目录 `.env`。

### Web Dashboard 请求 API 失败

检查 `.env`：

```text
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3000/api
```

确认 API 正在运行：

```bash
curl -fsS http://127.0.0.1:3000/api/health/ready
```

### 登录失败

如果登录接口返回：

```text
{"statusCode":500,"message":"Unexpected error","path":"/api/auth/console/login"}
```

优先检查是否还没有执行数据库迁移。登录成功会写入：

```text
auth_sessions
auth_refresh_tokens
tenants
users
```

如果这些表不存在，API key / service token 校验通过后也会在创建 Web Console session 时失败。

检查表是否存在：

```bash
docker exec enterprise-agent-postgres psql -U agent -d agent_db -c "select table_name from information_schema.tables where table_schema='public' and table_name in ('tenants','users','auth_sessions','auth_refresh_tokens') order by table_name;"
```

缺表时重新执行：

```bash
DATABASE_URL=postgresql://agent:agent_password@localhost:15432/agent_db \
DATABASE_MIGRATIONS_FOLDER=/Users/bjsttlp406/others/-0-1agent/apps/api/drizzle \
npm run db:migrate
```

确认 `.env`：

```text
SERVICE_TOKEN=local-admin-service-token
SERVICE_TOKEN_ROLES=admin
SERVICE_TOKEN_TENANT_ID=default
JWT_SECRET=development-only-jwt-secret-change-me
```

然后重启 API。

### 端口被占用

默认端口：

```text
API: 3000
Web: 3001
Postgres: 15432 -> container 5432
Redis: 6379
Qdrant: 6333 / 6334
```

查看端口：

```bash
lsof -nP -iTCP:3000 -sTCP:LISTEN
lsof -nP -iTCP:3001 -sTCP:LISTEN
lsof -nP -iTCP:15432 -sTCP:LISTEN
```

如果本机已有 PostgreSQL 监听 `127.0.0.1:5432`，本项目应保持 `POSTGRES_PORT=15432`，并让 `DATABASE_URL` 指向 `localhost:15432`。

### Web 启动报 `EADDRINUSE :::3001`

典型错误：

```text
Failed to start server
Error: listen EADDRINUSE: address already in use :::3001
```

含义：`3001` 已经被旧的 Web dev 服务或其他进程占用。

先查看占用进程：

```bash
lsof -nP -iTCP:3001 -sTCP:LISTEN
```

如果看到类似：

```text
node ... TCP *:3001 (LISTEN)
next-server
```

说明之前的 `npm run dev:web` 还在运行。停止旧终端里的进程，或确认 PID 后再停止旧进程，然后重新执行：

```bash
npm run dev:web
```

### Web 日志出现 hydration mismatch

典型日志：

```text
Hydration failed because the server rendered HTML didn't match the client.
It can also happen if the client has a browser extension installed which messes with the HTML before React loaded.
...
<html
  lang="zh-CN"
- data-immersive-translate-page-theme="light"
>
```

原因：浏览器插件在 React 加载前修改了页面 HTML，例如沉浸式翻译插件给 `<html>` 注入 `data-immersive-translate-page-theme` 属性。

处理方式：

- Web 根布局 `apps/web/src/app/layout.tsx` 在 `<html>` 上保留 `suppressHydrationWarning`。
- 如果只有该插件属性差异，属于开发期可忽略警告，不代表 Web 业务代码渲染失败。
- 如果日志中出现业务组件内容、表格、按钮、时间戳等不一致，再按真实 hydration 问题排查。

### Web build 遇到本机 SWC 签名问题

当前已由 `apps/web/scripts/build.mjs` 自动处理 WASM SWC fallback，直接执行：

```bash
npm run build:web
```

## 12. 推荐日常启动顺序

终端 1：

```bash
npm run infra:up
```

终端 2：

```bash
npm run dev:api
```

终端 3：

```bash
npm run dev:web
```

本地 Web 启动脚本会默认使用：

```text
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3000/api
```

如果终端环境里残留了 Web E2E 使用的 mock 地址 `http://127.0.0.1:3999/api`，`npm run dev:web` 会自动改回本地真实 API，避免日常访问 `/tools`、`/agent-chat` 等页面误连 E2E mock 端口。

浏览器打开：

```text
http://localhost:3001
```

## 13. 推荐日常停止顺序

停止 Web：在 Web 终端按 `Ctrl+C`。

停止 API：在 API 终端按 `Ctrl+C`。

停止 infra：

```bash
npm run infra:down
```
