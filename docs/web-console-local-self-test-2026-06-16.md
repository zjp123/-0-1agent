# Web Console Local Self Test - 2026-06-16

## 目标

完成 Phase 11 本地联调与自测，对当前企业级 Agent 平台的 API、infra、Web 控制台和核心页面做系统性冒烟验证。

## 测试时间

- `2026-06-16 11:31:16 CST`

## 本地服务状态

### Infrastructure

通过 `docker compose -f infra/docker-compose.yml ps` 验证：

- `enterprise-agent-postgres`: `Up` / `healthy` / `15432->5432`
- `enterprise-agent-redis`: `Up` / `healthy` / `6379->6379`
- `enterprise-agent-qdrant`: `Up` / `healthy` / `16333->6333`, `16334->6334`

### API

API 运行地址：

- `http://127.0.0.1:3000/api`

Readiness 验证：

```bash
curl --max-time 10 -fsS http://127.0.0.1:3000/api/health/ready
```

结果：

- `status`: `ok`
- `service`: `enterprise-agent-api`
- `environment`: `development`
- `database.status`: `ok`
- `vectorStore.status`: `disabled`

### Web

Web 运行地址：

- `http://localhost:3001`

所有页面 HTTP 冒烟均返回 `200`：

- `/`
- `/api-docs`
- `/agent-chat`
- `/tools`
- `/security`
- `/knowledge`
- `/workflows`
- `/evaluations`
- `/observability`

## 关键接口冒烟

使用本地 service token：

```http
x-service-token: local-admin-service-token
```

### Tools

```bash
curl --max-time 10 -fsS http://127.0.0.1:3000/api/tools
```

结果：

- 返回 `current_time`
- 返回 `calculator`

```bash
curl --max-time 10 -fsS -X POST http://127.0.0.1:3000/api/tools/execute \
  -H 'content-type: application/json' \
  -H 'x-service-token: local-admin-service-token' \
  -d '{"requestId":"33333333-3333-4333-8333-333333333333","name":"calculator","arguments":{"expression":"(42 + 58) * 3"}}'
```

结果：

- `status`: `success`
- `content`: `(42 + 58) * 3 = 300`

### Security

```bash
curl --max-time 10 -fsS http://127.0.0.1:3000/api/auth/roles \
  -H 'x-service-token: local-admin-service-token'
```

结果：

- 成功返回本地 roles。
- 已验证 Web Security 页面可加载。

### Knowledge / RAG

```bash
curl --max-time 10 -fsS http://127.0.0.1:3000/api/knowledge/documents \
  -H 'x-service-token: local-admin-service-token'
```

结果：

- 成功返回文档列表。

### Workflow

```bash
curl --max-time 10 -fsS http://127.0.0.1:3000/api/workflows/scheduler/status \
  -H 'x-service-token: local-admin-service-token'
```

结果：

- `enabled`: `true`
- `store`: `postgres`
- `triggerModes`: `interval`, `cron`, `manual`, `worker claim`

### Evaluation

```bash
curl --max-time 10 -fsS http://127.0.0.1:3000/api/evaluations/cases \
  -H 'x-service-token: local-admin-service-token'
```

结果：

- 成功返回 evaluation cases。

### Observability

```bash
curl --max-time 10 -fsS 'http://127.0.0.1:3000/api/observability/traces?limit=5' \
  -H 'x-service-token: local-admin-service-token'
```

结果：

- 成功返回 5 条 trace events。
- 验证 `limit` query 参数可用。

## 修复记录

本轮自测发现：

- `GET /api/observability/traces?limit=5` 初始返回 `400`。
- 原因：`ListTracesDto.limit` 缺少 `class-transformer` 的 `@Type(() => Number)`，query string 未转换为 number。

修复文件：

- `apps/api/src/observability/dto/list-traces.dto.ts`

修复后执行：

- `npm run check -w @enterprise-agent/api`
- `npm run build -w @enterprise-agent/api`
- 重启本地 API dist 进程。
- 重新验证 `GET /api/observability/traces?limit=5` 成功。

## Check / Build

### Web Type Check

```bash
PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH npm run check:web
```

结果：

- 通过。

### API Type Check

```bash
PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH npm run check -w @enterprise-agent/api
```

结果：

- 通过。

### Web Build

```bash
PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH \
NEXT_TEST_WASM_DIR=/Users/bjsttlp406/others/-0-1agent/node_modules/@next/swc-wasm-nodejs \
npm run build:web
```

结果：

- 通过。
- Next.js 使用 `--webpack` 和 WASM SWC 规避本机原生模块签名问题。
- 静态页面生成包含：
  - `/`
  - `/agent-chat`
  - `/api-docs`
  - `/evaluations`
  - `/knowledge`
  - `/observability`
  - `/security`
  - `/tools`
  - `/workflows`

## 当前结论

Phase 11 本地联调与自测通过：

- API 可用。
- Web 可用。
- Docker infra 可用。
- Dashboard 可访问。
- Security 持久化接口可访问。
- Tools 可执行。
- 所有 Web 控制台页面返回 `200`。
- `check:web`、API check、`build:web` 均通过。

## 后续事项

- Phase 12 继续补 Web 生产化增强：统一错误边界、toast、请求超时/重试、streaming 断线保护、前端权限视图控制、环境配置说明和部署说明。
