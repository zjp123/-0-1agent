# Environment Profiles

## 目标

本文档记录企业 Agent 平台在不同部署环境下的环境变量 profile。

## Development

用途：

- 本地开发
- 单机调试
- 可允许 dev fallback

关键配置：

```bash
NODE_ENV=development
PORT=3000
API_KEY=replace-with-local-api-key
DATABASE_URL=postgresql://agent:agent_password@localhost:15432/agent_db
REDIS_URL=redis://localhost:6379
QDRANT_URL=http://localhost:6333
QDRANT_ENABLED=false
SECRETS_MASTER_KEY=
SECRETS_MASTER_KEY_ID=local-dev
LLM_API_KEY=your-api-key-here
```

说明：

- `SECRETS_MASTER_KEY` 可为空，开发环境会使用 fallback key
- 如果没有 `API_KEY` / `JWT_SECRET` / `SERVICE_TOKEN`，开发环境会启用 dev auth
- `API_KEY` 是本项目 API / Web Console 的登录凭证；`LLM_API_KEY` 是模型供应商凭证，两者不要混用

## Staging

用途：

- 预发验证
- migration rehearsal
- 灰度前 API / workflow / RAG 验证

关键配置：

```bash
NODE_ENV=production
PORT=3000
API_KEY=<staging-api-key>
DATABASE_URL=<staging-postgres-url>
DATABASE_MIGRATIONS_FOLDER=apps/api/drizzle
REDIS_URL=<staging-redis-url>
QDRANT_URL=<staging-qdrant-url>
QDRANT_ENABLED=true
SECRETS_MASTER_KEY=<32-byte-minimum-secret>
SECRETS_MASTER_KEY_ID=staging
LLM_API_KEY=<staging-llm-key>
EMBEDDING_PROVIDER=local-hash
```

建议：

- staging 使用独立数据库
- staging 先执行 `npm run db:migrate`
- staging 通过 `/api/health/ready` 后再执行业务 smoke

## Production

用途：

- 正式服务
- 生产数据
- 生产凭证

关键配置：

```bash
NODE_ENV=production
PORT=3000
API_KEY=<production-api-key>
JWT_SECRET=<production-jwt-secret>
SERVICE_TOKEN=<production-service-token>
DATABASE_URL=<production-postgres-url>
DATABASE_POOL_MAX=10
DATABASE_MIGRATIONS_FOLDER=apps/api/drizzle
REDIS_URL=<production-redis-url>
QDRANT_URL=<production-qdrant-url>
QDRANT_ENABLED=true
QDRANT_API_KEY=<production-qdrant-api-key>
SECRETS_MASTER_KEY=<32-byte-minimum-secret>
SECRETS_MASTER_KEY_ID=prod
LLM_API_KEY=<production-llm-key>
EMBEDDING_PROVIDER=local-hash
ALLOWED_ORIGINS=<comma-separated-origins>
```

生产强制要求：

- `LLM_API_KEY`
- `SECRETS_MASTER_KEY`
- 至少一个认证方式：`API_KEY` / `JWT_SECRET` / `SERVICE_TOKEN`

## Health Endpoints

Liveness：

```http
GET /api/health/live
```

Readiness：

```http
GET /api/health/ready
```

综合 health：

```http
GET /api/health
```

建议：

- 容器 liveness probe 使用 `/api/health/live`
- 负载均衡 readiness probe 使用 `/api/health/ready`
