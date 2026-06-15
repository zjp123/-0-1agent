# Deployment Operations: readiness / migrations / environment profiles

## 目标

本步骤补齐生产部署运维基础能力，让平台具备可用于容器编排和生产发布的健康检查、迁移入口、环境 profile、部署 runbook 和回滚清单。

核心目标：

- readiness / liveness endpoint separation
- migration apply command
- production env profile documentation
- deployment runbook
- rollback and migration safety checklist

## 新增文件

```text
apps/api/src/db/migrate.ts
docs/environment-profiles.md
docs/deployment-runbook.md
```

## 修改文件

```text
apps/api/src/health/health.controller.ts
apps/api/test/e2e/controllers.smoke.test.ts
apps/api/package.json
package.json
apps/api/Dockerfile
infra/docker-compose.prod.yml
.github/workflows/ci.yml
apps/api/src/api-docs/openapi.document.ts
docs/openapi/enterprise-agent.openapi.json
```

## Health Endpoints

综合 health：

```http
GET /api/health
```

Liveness：

```http
GET /api/health/live
```

Readiness：

```http
GET /api/health/ready
```

语义：

- `/health/live` 只表示进程仍可响应
- `/health/ready` 检查数据库和 vector store readiness
- vector store disabled 不阻塞 readiness
- readiness 失败返回 `503 Service Unavailable`

建议：

- Kubernetes liveness probe 使用 `/api/health/live`
- Kubernetes readiness probe 使用 `/api/health/ready`
- Docker healthcheck 使用 `/api/health/ready`

## Migration Apply

新增迁移入口：

```bash
npm run db:migrate
```

API workspace：

```bash
npm run db:migrate -w @enterprise-agent/api
```

运行脚本：

```text
apps/api/src/db/migrate.ts
```

生产镜像内执行：

```bash
node apps/api/dist/db/migrate.js
```

环境变量：

```bash
DATABASE_URL=
DATABASE_MIGRATIONS_FOLDER=apps/api/drizzle
```

## Environment Profiles

新增文档：

```text
docs/environment-profiles.md
```

覆盖：

- development
- staging
- production
- health endpoints

生产必填：

- `LLM_API_KEY`
- `SECRETS_MASTER_KEY`
- 至少一个认证方式：`API_KEY` / `JWT_SECRET` / `SERVICE_TOKEN`

## Deployment Runbook

新增文档：

```text
docs/deployment-runbook.md
```

覆盖：

- 标准部署流程
- 本地生产 compose 部署
- 数据库迁移
- 健康检查
- 业务 smoke test
- 回滚策略
- 故障排查
- 发布后观察

## CI / Docker 更新

本步骤同步更新：

- Docker healthcheck 改为 `/api/health/ready`
- CI startup smoke 改为 `/api/health/ready`
- CI API container 增加 `DATABASE_MIGRATIONS_FOLDER`
- Docker runtime 镜像包含 compiled migration script 和 drizzle migrations

## 当前边界

已完成：

- liveness endpoint
- readiness endpoint
- readiness 503 behavior
- database migration apply script
- root `db:migrate` script
- Docker healthcheck readiness endpoint
- CI startup smoke readiness endpoint
- environment profile documentation
- deployment runbook
- rollback and migration safety checklist
- OpenAPI health endpoint update

未完成：

- automated migration job in compose / Kubernetes
- migration lock / advisory lock
- blue-green deployment automation
- canary deployment automation
- structured deployment events
- automated rollback controller

## 验证

本步骤已执行：

```bash
npm run docs:openapi
npm test
npm run ci
```

结果：

- `docs:openapi` 通过
- `test` 通过，14 passed
- `ci` 通过

Docker 本地验证仍受当前环境限制：

```text
docker: command not found
```

## 下一步

建议下一步实现 `Security Hardening: audit pagination / break-glass / anomaly detection`：

1. audit pagination / filtering
2. break-glass role and reason enforcement
3. anomaly event model
4. security alert surfaces
5. security hardening runbook
