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

QDRANT_URL=http://localhost:6333
QDRANT_ENABLED=false
QDRANT_API_KEY=
QDRANT_COLLECTION=enterprise_agent_knowledge_chunks
QDRANT_VECTOR_SIZE=384
QDRANT_DISTANCE=Cosine
QDRANT_TIMEOUT_MS=10000
QDRANT_HTTP_PORT=6333
QDRANT_GRPC_PORT=6334
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

## 当前边界

已完成：

- Docker Compose
- PostgreSQL 服务
- Redis 服务
- Qdrant 服务
- Drizzle config
- schema 初版
- package scripts
- env 示例
- Qdrant HTTP client 基础实现
- Qdrant collection 初始化逻辑
- VectorStore health check

未完成：

- 实际 migrations 生成
- Redis rate limiter
- 真实 embedding provider
- Qdrant payload index
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
