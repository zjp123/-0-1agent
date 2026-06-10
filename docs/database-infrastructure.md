# Database / Infrastructure

## 目标

Database / Infrastructure 基础版负责建立企业级 Agent 平台的生产持久化目标。

当前项目仍有多个 in-memory store，但基础设施已经确定为：

```text
PostgreSQL + Redis + Qdrant
```

本阶段先完成 Docker Compose、Drizzle 配置和数据库 schema 初版。后续再逐步把 in-memory store 替换为持久化实现。

## 技术选型

### PostgreSQL

用途：

- 租户
- 用户
- 会话
- 消息
- 知识文档 metadata
- 知识 chunks metadata
- workflow
- evaluation
- trace events

### Redis

用途：

- 限流
- 活跃会话缓存
- 短期任务状态
- 后续异步任务队列协调

### Qdrant

用途：

- RAG chunk vectors
- 向量相似度检索
- payload filter
- tenant/tag/source metadata filter

Qdrant 是核心 RAG 向量检索引擎，wiki 只是未来的知识来源 connector。

## 文件

```text
infra/
  docker-compose.yml

apps/api/
  drizzle.config.ts
  src/db/schema.ts
```

## Docker Compose

启动：

```bash
npm run infra:up
```

停止：

```bash
npm run infra:down
```

服务：

- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`
- Qdrant HTTP: `localhost:6333`
- Qdrant gRPC: `localhost:6334`

## 环境变量

```bash
DATABASE_URL=postgresql://agent:agent_password@localhost:5432/agent_db
POSTGRES_DB=agent_db
POSTGRES_USER=agent
POSTGRES_PASSWORD=agent_password
POSTGRES_PORT=5432

REDIS_URL=redis://localhost:6379
REDIS_PORT=6379
INDEXING_QUEUE_NAME=enterprise-agent:indexing-jobs
INDEXING_CONSUMER_GROUP=enterprise-agent-indexers
INDEXING_WORKER_ENABLED=true
INDEXING_WORKER_BLOCK_TIMEOUT_SECONDS=5
INDEXING_JOB_MAX_ATTEMPTS=3
INDEXING_WORKER_HEARTBEAT_INTERVAL_MS=10000
INDEXING_WORKER_ID=
INDEXING_WORKER_CONCURRENCY=1
INDEXING_WORKER_LEASE_MS=60000
INDEXING_WORKER_RECOVERY_INTERVAL_MS=30000
INDEXING_RETRY_DELAY_BASE_MS=5000
INDEXING_RETRY_DELAY_MAX_MS=60000
INDEXING_RETRY_PROMOTION_BATCH_SIZE=50
INDEXING_PENDING_CLAIM_MIN_IDLE_MS=60000
INDEXING_PENDING_CLAIM_BATCH_SIZE=10
INDEXING_ALERT_PENDING_THRESHOLD=100
INDEXING_ALERT_DELAYED_THRESHOLD=100
INDEXING_ALERT_DEAD_LETTER_THRESHOLD=1
INDEXING_ALERT_QUEUE_ERRORS_THRESHOLD=10
INDEXING_ALERT_RECOVERY_FAILURES_THRESHOLD=1
INDEXING_ALERT_STALE_RECOVERY_MS=120000
INDEXING_DEAD_LETTER_ADMIN_BATCH_SIZE=100

API_KEY=
JWT_SECRET=
JWT_ISSUER=
JWT_AUDIENCE=
SERVICE_TOKEN=
SERVICE_TOKEN_USER_ID=service-token-user
SERVICE_TOKEN_TENANT_ID=default
SERVICE_TOKEN_ROLES=service
SERVICE_TOKEN_PERMISSIONS=

QDRANT_URL=http://localhost:6333
QDRANT_ENABLED=false
QDRANT_API_KEY=
QDRANT_COLLECTION=enterprise_agent_knowledge_chunks
QDRANT_VECTOR_SIZE=384
QDRANT_DISTANCE=Cosine
QDRANT_TIMEOUT_MS=10000
QDRANT_HTTP_PORT=6333
QDRANT_GRPC_PORT=6334

EMBEDDING_PROVIDER=local-hash
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_BASE_URL=https://api.openai.com/v1
EMBEDDING_API_KEY=
EMBEDDING_DIMENSION=384
EMBEDDING_TIMEOUT_MS=30000
EMBEDDING_MAX_RETRIES=2
```

## Drizzle

生成 migration：

```bash
npm run db:generate
```

推送 schema：

```bash
npm run db:push
```

## Schema 初版

当前定义的表：

- `tenants`
- `users`
- `sessions`
- `messages`
- `knowledge_documents`
- `knowledge_chunks`
- `indexing_jobs`
- `workflows`
- `workflow_steps`
- `evaluation_cases`
- `evaluation_runs`
- `trace_events`

当前定义的枚举：

- `message_role`
- `workflow_status`
- `workflow_step_status`
- `evaluation_case_type`
- `indexing_job_status`

## 当前边界

已完成：

- Docker Compose
- PostgreSQL 服务
- Redis 服务
- Redis indexing queue
- Qdrant 服务
- Drizzle config
- schema 初版
- indexing_jobs migration
- package scripts
- env 示例
- Qdrant HTTP client 基础实现
- Qdrant collection 初始化逻辑
- Qdrant payload index 初始化
- VectorStore health check
- OpenAI-compatible embedding provider
- local-hash embedding fallback

未完成：

- 实际 migrations 生成
- Redis rate limiter
- distributed worker coordination
- 数据迁移脚本

## Database Connection

数据库连接模块文档见 [database-connection.md](./database-connection.md)。

## 下一步

建议下一步先替换 `EvaluationStore`：

1. 新增 PostgresEvaluationStore
2. 复用现有 EvaluationStore 接口
3. 写入 `evaluation_cases`
4. 写入 `evaluation_runs`
5. 保持 controller/service 不变
