# Deployment Runbook

## 目标

本文档记录企业 Agent 平台的标准部署流程、迁移步骤、健康检查、回滚策略和故障排查入口。

## 标准部署流程

1. 拉取代码或镜像
2. 确认环境变量 profile
3. 执行测试与构建
4. 执行数据库迁移
5. 启动新版本 API
6. 等待 readiness 通过
7. 执行业务 smoke test
8. 切流量
9. 观察日志、trace、metrics

## 本地生产 compose 部署

构建镜像：

```bash
npm run docker:build
```

检查 compose：

```bash
npm run compose:prod:config
```

启动：

```bash
npm run compose:prod:up
```

停止：

```bash
npm run compose:prod:down
```

## 数据库迁移

先构建：

```bash
npm run build
```

执行迁移：

```bash
npm run db:migrate
```

容器内执行：

```bash
docker run --rm \
  --env DATABASE_URL="$DATABASE_URL" \
  --env DATABASE_MIGRATIONS_FOLDER=apps/api/drizzle \
  enterprise-agent-api:local \
  node apps/api/dist/db/migrate.js
```

迁移安全要求：

- 先在 staging 执行
- 备份生产数据库
- 确认 migration 文件已入库
- 不在高峰期执行破坏性 schema 变更
- 迁移后立即检查 `/api/health/ready`

## 健康检查

Liveness：

```bash
curl -fsS http://localhost:3000/api/health/live
```

Readiness：

```bash
curl -fsS http://localhost:3000/api/health/ready
```

OpenAPI：

```bash
curl -fsS http://localhost:3000/api/docs/openapi.json
```

## 业务 Smoke Test

基础：

```bash
curl -fsS http://localhost:3000/api/health/ready
curl -fsS http://localhost:3000/api/docs
```

认证接口：

```bash
curl -fsS http://localhost:3000/api/tools \
  -H "x-api-key: $API_KEY"
```

Agent 接口：

```bash
curl -fsS -X POST http://localhost:3000/api/agent/run \
  -H "content-type: application/json" \
  -H "x-api-key: $API_KEY" \
  -d '{
    "requestId": "00000000-0000-4000-8000-000000000001",
    "message": "Say deployment smoke test passed.",
    "maxSteps": 1
  }'
```

## 回滚策略

应用回滚：

1. 保留上一版镜像 tag
2. 将服务切回上一版镜像
3. 检查 `/api/health/ready`
4. 检查关键 API smoke test
5. 保留新版本日志用于排查

数据库回滚：

- 优先使用向前修复 migration
- 避免自动 down migration
- 如必须回滚，先从备份恢复到隔离环境验证
- 恢复生产前冻结写流量

## 故障排查

服务无法启动：

- 检查 `NODE_ENV=production` 必填变量
- 检查 `LLM_API_KEY`
- 检查 `SECRETS_MASTER_KEY`
- 检查认证变量：`API_KEY` / `JWT_SECRET` / `SERVICE_TOKEN`

Readiness 失败：

- 检查 PostgreSQL 连接
- 检查 Qdrant health
- 如果 `QDRANT_ENABLED=false`，vector store disabled 不阻塞 readiness

迁移失败：

- 检查 `DATABASE_URL`
- 检查 `DATABASE_MIGRATIONS_FOLDER`
- 检查 `apps/api/drizzle/meta/_journal.json`
- 检查最新 migration 是否已提交

## 发布后观察

建议观察：

- `/api/health/ready`
- trace events
- indexing worker alerts
- quota usage events
- auth audit events
- approval requests
- schedule runs
