# CI/CD / Docker Production Build

## 目标

本步骤建立企业级生产构建与 CI/CD 基线，让 API 可以被 Docker 构建、被 compose 生产 profile 启动，并在 CI 中执行检查、测试、构建、migration 校验和镜像启动 smoke test。

核心目标：

- Dockerfile production build
- docker compose production profile
- CI check / test / build baseline
- migration check step
- image build and startup smoke test

## 新增文件

```text
.dockerignore
.github/workflows/ci.yml
apps/api/Dockerfile
infra/docker-compose.prod.yml
```

## 修改文件

```text
package.json
```

## Dockerfile

路径：

```text
apps/api/Dockerfile
```

构建模型：

1. `deps`: 安装 workspace dev dependencies
2. `build`: 编译 API TypeScript 到 `apps/api/dist`
3. `prod-deps`: 安装 production dependencies
4. `runtime`: 非 root 用户运行 `node apps/api/dist/main.js`

运行镜像包含：

- production `node_modules`
- `apps/api/dist`
- `apps/api/drizzle`
- `apps/api/drizzle.config.ts`

## Docker Compose Production

路径：

```text
infra/docker-compose.prod.yml
```

服务：

- `api`
- `postgres`
- `redis`
- `qdrant`

生产 compose 要求：

```text
POSTGRES_PASSWORD
SECRETS_MASTER_KEY
LLM_API_KEY
API_KEY or JWT_SECRET or SERVICE_TOKEN
```

启动：

```bash
npm run compose:prod:up
```

停止：

```bash
npm run compose:prod:down
```

配置检查：

```bash
npm run compose:prod:config
```

本地镜像构建：

```bash
npm run docker:build
```

## CI Workflow

路径：

```text
.github/workflows/ci.yml
```

触发：

- pull request
- push to `main`
- push to `master`

CI 步骤：

1. checkout
2. setup Node 22
3. `npm ci`
4. `npm run check`
5. `npm test`
6. `npm run docs:openapi`
7. `npm run build`
8. `npm run db:generate`
9. `git diff --exit-code`
10. Docker image build
11. Postgres / Redis startup
12. API container startup
13. `/api/health` smoke test

## 根脚本

新增脚本：

```bash
npm run ci
npm run docker:build
npm run compose:prod:config
npm run compose:prod:up
npm run compose:prod:down
```

`npm run ci` 当前包含：

```bash
npm run check
npm test
npm run docs:openapi
npm run build
```

## 当前边界

已完成：

- multi-stage production Dockerfile
- non-root runtime user
- production compose profile
- API healthcheck
- GitHub Actions CI workflow
- check / test / OpenAPI export / build CI baseline
- migration generation drift check
- Docker image build step
- API startup smoke test definition

未完成：

- Docker daemon 本地验证
- image push registry
- SBOM / vulnerability scan
- signed images / provenance
- multi-arch build
- deployment environment promotion
- database migration apply job

## 验证

本步骤已执行：

```bash
npm run ci
```

结果：

- `check` 通过
- `test` 通过，12 passed
- `docs:openapi` 通过
- `build` 通过

Docker 本地验证：

```bash
docker compose -f infra/docker-compose.prod.yml config
```

当前环境结果：

```text
docker: command not found
```

因此 Docker build / compose / startup smoke 已在 CI workflow 中定义，但未能在当前本机环境实际执行。

## 下一步

建议下一步实现 `Security Hardening: audit pagination / break-glass / anomaly detection`：

1. audit pagination / filtering
2. break-glass role and reason enforcement
3. anomaly event model
4. security alert surfaces
5. security hardening runbook
