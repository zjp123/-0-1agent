# Local Full Self-Test - 2026-06-17

## 目标

对当前企业级 Agent 平台做一轮本地完整自测和缺陷修复，覆盖：

- 基础依赖服务
- API / Web 类型检查
- API 单元、集成、E2E 测试
- OpenAPI 导出
- 数据库迁移状态
- 核心 API smoke
- Web 页面 smoke
- Agent 闭环 smoke
- Observability / Security 治理联动 smoke

## 自测清单

- [x] 检查 Docker 依赖服务：PostgreSQL、Redis、Qdrant。
- [x] 检查本地端口：API 3000、Web 3001、Postgres 15432。
- [x] API TypeScript check。
- [x] Web TypeScript check。
- [x] API unit tests。
- [x] API integration tests。
- [x] API e2e tests。
- [x] OpenAPI export。
- [x] 数据库迁移 / schema 状态。
- [x] API health / readiness smoke。
- [x] Auth login smoke。
- [x] Agent stream smoke。
- [x] Tools smoke。
- [x] Knowledge/RAG smoke。
- [x] Workflow smoke。
- [x] Evaluation smoke。
- [x] Observability timeline / agent-runs smoke。
- [x] Security governance approval / audit smoke。
- [x] Web route smoke。
- [x] 发现问题修复并复测。

## 环境记录

- 日期：2026-06-17
- API：`http://127.0.0.1:3000/api`
- Web：`http://127.0.0.1:3001`
- PostgreSQL：Docker service `enterprise-agent-postgres`，映射 `15432 -> 5432`
- Redis：Docker service `enterprise-agent-redis`，映射 `6379`
- Qdrant：Docker service `enterprise-agent-qdrant`，映射 `6333-6334`
- 本地 RAG：`QDRANT_ENABLED=false`，`EMBEDDING_PROVIDER=local-hash`
- 鉴权 smoke：使用本地 service token，只记录状态码，不输出 access token / refresh token。

## 执行记录

### 基础依赖

- `docker compose -f infra/docker-compose.yml ps`：PostgreSQL、Redis、Qdrant 均为 `healthy`。
- `GET /api/health/ready`：`200`，database `ok`，vectorStore `disabled`。
- Web `/agent-chat`：`200`。

### 自动化检查

- `npm run check -w @enterprise-agent/api`：通过。
- `npm run check:web`：通过。
- `npm run docs:openapi`：通过。
- `npm run test:unit`：10 passed。
- `npm run test:integration`：2 passed。
- `npm run test:e2e`：4 passed。
- `npm run test:e2e:web`：9 passed。
- `npm run build -w @enterprise-agent/api`：通过。
- `npm run build:web`：通过。
- `npm run db:migrate`：通过，迁移目录解析为 `apps/api/drizzle`。

### API Smoke

- Auth login：`POST /api/auth/console/login` 返回 `201`。
- Agent stream：`POST /api/agent/run/stream` 返回 SSE `started -> delta -> result -> done`，`stopReason=final_answer`。
- Tools：`GET /api/tools` 返回 `current_time`、`calculator`；`POST /api/tools/execute` 计算 `(128 * 2) + 1 = 257`。
- Knowledge/RAG：`POST /api/knowledge/retrieve` 返回本地 runbook chunk。
- Workflow：创建 workflow、读取列表、读取详情、更新 step 为 `completed` 均通过。
- Workflow schedule：创建 disabled interval schedule、读取 schedules / schedule-runs 均通过。
- Evaluation：创建 evaluation case，运行 case，得分 `1`。
- Observability：`GET /api/observability/agent-runs` 可读；`GET /api/observability/traces/agent-smoke-2026-06-17/timeline` 返回 16 个事件。
- Governance：创建 approval request 成功；同一 requester 自审返回 `409 Requester cannot approve their own request`，符合四眼审批预期；approval list / auth audit 可读。

### Web Smoke

以下路由均返回 `200`：

- `/`
- `/login`
- `/agent-chat`
- `/tools`
- `/knowledge`
- `/workflows`
- `/evaluations`
- `/observability`
- `/security`
- `/api-docs`

## 缺陷与修复

### 1. Web E2E mock 与真实 schema 不一致

现象：

- Web E2E 在 tools、security、observability 等页面断言中不稳定或失败。
- mock 数据缺少近期接口 schema 中新增字段，例如 `riskLevel`、`outputSchema`、`source`、`requiredPermissions`、observability timeline / agent-runs、approval requests。

修复：

- 更新 `apps/web/e2e/console.smoke.spec.ts`。
- 补齐 tools mock 的风险等级、输出 schema、权限、audit `riskLevel` 和结构化 `data`。
- 补齐 governance approval、observability failures、agent-runs、timeline mock。
- session seed 改为进入页面后写入 `localStorage`，Agent Chat send 改为 `waitForRequest + click` 并发等待。

复测：

- `npm run test:e2e:web`：9 passed。

### 2. 数据库迁移脚本在 dist 执行时找不到迁移目录 / 未加载根 `.env`

现象：

- `npm run db:migrate` 可能从 `dist` 路径执行，默认迁移目录解析失败。
- 脚本未加载根目录 `.env` 时会回退到 `localhost:5432`，与本地 Docker 的 `15432` 不一致。

修复：

- 更新 `apps/api/src/db/migrate.ts`。
- 启动时加载根 `.env`。
- 支持从 cwd、workspace、编译后目录多候选解析 `apps/api/drizzle/meta/_journal.json`。

复测：

- `npm run build -w @enterprise-agent/api`：通过。
- `npm run db:migrate`：通过。

### 3. Web production build 需要手动设置 WASM SWC fallback

现象：

- 直接执行 `npm run build:web` 时，Next 在当前 macOS/Codex Node 环境优先加载 `@next/swc-darwin-arm64`，触发 code signing 错误。
- 手动设置 `NEXT_TEST_WASM_DIR=/Users/bjsttlp406/others/-0-1agent/node_modules/@next/swc-wasm-nodejs` 后可构建通过，但容易遗忘。

修复：

- 新增 `apps/web/scripts/build.mjs`。
- Web workspace `build` 脚本改为 `node scripts/build.mjs`。
- 脚本自动解析 `@next/swc-wasm-nodejs` 并注入 `NEXT_TEST_WASM_DIR`，继续使用 `next build --webpack`。

复测：

- 不带额外环境变量直接执行 `npm run build:web`：通过。

### 4. `/api-docs` 首次 route smoke 瞬时返回 500

现象：

- 第一轮 Web route smoke 中 `/api-docs` 返回 `500`。

排查：

- 后端 `GET /api/docs` 返回 `200`。
- 直接读取 `/api-docs` HTML 可正常渲染页面 shell。
- 复测 `/api-docs` 返回 `200`，全量 Web route smoke 全部通过。

结论：

- 判定为 Next dev 首次编译 / 热更新期间的瞬时状态。
- 当前没有发现业务代码缺陷，后续若重复出现再进入页面级错误日志排查。

### 5. Web dev server 误用 E2E mock API 地址

现象：

- 日常访问 `http://localhost:3001/tools` 时，页面请求 `http://127.0.0.1:3999/api/tools`。
- `3999` 是 Web E2E 的 mock API 地址，只应该用于 Playwright 测试，不应该进入日常 3001 开发服务。

修复：

- 新增 `apps/web/scripts/dev.mjs`。
- Web workspace `dev` 脚本改为 `node scripts/dev.mjs`。
- 当 `NEXT_PUBLIC_API_BASE_URL` 缺失或等于 E2E mock 地址 `http://127.0.0.1:3999/api` 时，自动设置为本地真实 API `http://127.0.0.1:3000/api`。
- E2E 仍由 `apps/web/playwright.config.ts` 直接启动独立 `3101` dev server，并继续使用 `3999` mock API，不影响测试隔离。

复测：

- 重启 `npm run dev:web` 后，`http://localhost:3001/tools` 应显示 `local API: http://127.0.0.1:3000/api`，并请求 `/api/tools` 到 3000 后端。

### 6. MCP 外部工具接入

目标：

- `/tools` 不再只展示内置工具。
- Tool Registry 可以接入真实外部 MCP stdio server。
- Agent Runtime 和 Web Tools 页面继续复用统一工具发现、权限、schema、timeout、结果截断和 audit response。

修复：

- 新增 MCP stdio JSON-RPC client，支持 `initialize`、`tools/list`、`tools/call`。
- 新增 MCP tool provider，将外部 MCP 工具转换为现有 `ToolHandler`。
- `ToolRegistryService` 启动时加载 MCP 工具，并在 `agent/capabilities` 暴露 MCP 状态。
- 新增本地示例 MCP server：`tools/mcp/echo-server.mjs`。
- 新增文档：`docs/mcp-external-tools.md`。
- Web E2E mock 增加 `local_mcp.echo`，验证 Tools 页面能展示 `source=mcp`。

安全约束：

- MCP 默认关闭。
- MCP 子进程不继承 API 完整环境变量，只传递 `PATH`、`HOME`、`NODE_ENV` 和显式配置的 server `env`。
- MCP 工具默认需要 `tools:execute`。

复测：

- 临时启动 `PORT=3002 MCP_ENABLED=true` API。
- `GET /api/tools` 返回 `local_mcp.echo`、`local_mcp.word_count`。
- `POST /api/tools/execute` 执行 `local_mcp.echo` 成功，返回 `source=mcp` 和结构化 `data.message`。
- `GET /api/agent/capabilities` 返回 `mcpEnabled=true`、`mcpTools=["local_mcp.echo","local_mcp.word_count"]`。
- 临时 3002 API 和 MCP server 已停止。

## 最终结论

本轮“本地完整自测 + 缺陷修复”完成。

当前可确认：

- 本地 Docker 依赖健康。
- API / Web 类型检查通过。
- API unit / integration / e2e 测试通过。
- Web E2E 测试通过。
- OpenAPI 导出通过。
- 数据库迁移命令可重复执行。
- Agent streaming、Tools、Knowledge、Workflow、Evaluation、Observability、Security governance 核心链路均完成本地 smoke。
- Web 主要路由均可访问。
- API 与 Web production build 均通过。

剩余风险：

- 本轮未执行 Docker production compose 全量上线演练。
- 本轮未验证真实多用户审批人切换后的 approve 成功路径，只验证了 approval 创建、读取、审计，以及 requester 不能自审的安全约束。
- 当前 Qdrant 为健康运行但本地配置 `QDRANT_ENABLED=false`，RAG smoke 覆盖的是 local-hash / 本地检索路径。
