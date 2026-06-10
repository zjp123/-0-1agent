# Vector Store / Qdrant

## 目标

Vector Store / Qdrant 基础版负责建立企业 RAG 的向量检索底座。

这一步完成抽象、配置、健康检查、collection 初始化、knowledge ingestion 向量写入，以及 retrieval 的 vector / keyword hybrid search。

## 当前实现

路径：

```text
apps/api/src/vector-store/
  vector-store.constants.ts
  vector-store.types.ts
  vector-store.module.ts
  qdrant-vector.store.ts
  embedding-provider.factory.ts
  openai-compatible-embedding.provider.ts
  local-hash-embedding.provider.ts

apps/api/src/rag/
  rag.service.ts
  rag.module.ts

apps/api/src/health/
  health.controller.ts
  health.module.ts
```

## 抽象

当前 DI token：

```ts
EMBEDDING_PROVIDER
VECTOR_STORE
```

当前绑定：

```ts
{
  provide: EMBEDDING_PROVIDER,
  useFactory: EmbeddingProviderFactory
}

{
  provide: VECTOR_STORE,
  useExisting: QdrantVectorStore
}
```

`RagService` 只依赖 `EmbeddingProvider` 和 `VectorStore` 接口，不依赖 Qdrant HTTP 细节。

## 配置

当前支持：

```bash
QDRANT_URL=http://localhost:6333
QDRANT_ENABLED=false
QDRANT_API_KEY=
QDRANT_COLLECTION=enterprise_agent_knowledge_chunks
QDRANT_VECTOR_SIZE=384
QDRANT_DISTANCE=Cosine
QDRANT_TIMEOUT_MS=10000

EMBEDDING_PROVIDER=local-hash
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_BASE_URL=https://api.openai.com/v1
EMBEDDING_API_KEY=
EMBEDDING_DIMENSION=384
EMBEDDING_TIMEOUT_MS=30000
EMBEDDING_MAX_RETRIES=2
```

`QDRANT_ENABLED` 默认关闭。

原因：

- 本地没有启动 Qdrant 时，不影响 PostgreSQL knowledge ingestion
- 生产或集成测试环境可以显式开启
- 默认使用 local-hash 便于本地开发
- 生产可设置 `EMBEDDING_PROVIDER=openai-compatible`

## QdrantVectorStore

当前能力：

- `health()`
- `ensureCollection()`
- `ensurePayloadIndexes()`
- `upsert(points)`
- `search(input)`

实现方式：

- 使用 Qdrant HTTP API
- 不额外引入 npm SDK
- 请求支持 timeout
- 支持 api-key header
- collection 不存在时自动创建
- tenantId / tags / sourceType / documentId / chunkId payload index 初始化

## LocalHashEmbeddingProvider

当前 embedding provider 是确定性的本地 hash embedding。

它的用途是：

- 固定接口边界
- 支持本地开发和端到端链路验证
- 允许 ingestion 写入 Qdrant point
- 为真实 embedding provider 替换预留位置

它不是最终生产语义检索模型。

## OpenAiCompatibleEmbeddingProvider

当前已经支持 OpenAI-compatible embeddings。

启用方式：

```bash
EMBEDDING_PROVIDER=openai-compatible
EMBEDDING_API_KEY=...
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSION=1536
QDRANT_VECTOR_SIZE=1536
```

能力：

- 独立 embedding base URL
- 独立 embedding API key
- 独立 embedding model
- timeout
- retry
- dimensions 参数

注意：Qdrant collection 的 vector size 必须与 embedding dimension 一致。

## Knowledge Ingestion 接入

当前流程：

1. `RagService.ingest()` 创建 document
2. `KnowledgeChunkerService` 生成 chunks
3. `PostgresKnowledgeStore` 写入 PostgreSQL
4. 如果 `QDRANT_ENABLED=true`
5. `EmbeddingProvider.embedMany()` 为 chunks 生成 vectors
6. `VectorStore.upsert()` 写入 Qdrant

Qdrant payload 当前包含：

- tenantId
- documentId
- chunkId
- title
- sourceType
- sourceUri
- tags
- chunkIndex
- tokenEstimate

## Hybrid Retrieval 接入

当前 retrieval 流程：

1. `RagService.retrieve()` 先执行 PostgreSQL keyword search
2. 如果 `QDRANT_ENABLED=false`，直接返回 keyword results
3. 如果 `QDRANT_ENABLED=true`，为 query 生成 embedding
4. 调用 Qdrant vector search
5. 使用 tenant/tag payload filter
6. 将 Qdrant 返回的 point id 作为 chunk id
7. 回 PostgreSQL 查询完整 chunk/document 内容
8. 按 chunk id 合并 keyword 与 vector 结果
9. 输出统一的 `KnowledgeSearchResult`

合并策略：

- keyword 命中保留 `matchedTerms`
- vector 命中写入 `scores.vector`
- keyword 命中写入 `scores.keyword`
- 同一 chunk 同时命中时 `retrievalMode=hybrid`
- 最终 score 当前采用 `keyword * 1 + vector * 4`

当前降级策略：

- Qdrant 未开启时：keyword only
- Qdrant 无结果时：keyword only
- Qdrant 命中但 PostgreSQL hydrate 不到 chunk：丢弃该 vector result

## Health Check

`GET /api/health` 当前返回：

```json
{
  "dependencies": {
    "database": {
      "status": "ok"
    },
    "vectorStore": {
      "status": "disabled",
      "collection": "enterprise_agent_knowledge_chunks"
    }
  }
}
```

当 `QDRANT_ENABLED=true` 时，health 会请求 Qdrant `/healthz`。

## 当前边界

已完成：

- VectorStore 类型抽象
- EmbeddingProvider 类型抽象
- QdrantVectorStore
- LocalHashEmbeddingProvider
- OpenAiCompatibleEmbeddingProvider
- EmbeddingProviderFactory
- Qdrant 配置项
- embedding 配置项
- Qdrant env 校验
- embedding env 校验
- collection 自动创建
- payload index 初始化
- vector upsert
- vector search
- hybrid retrieval
- health check 接入
- Knowledge ingestion vector indexing 扩展点

未完成：

- Qdrant delete/update 同步
- 异步 indexing job / outbox
- indexing 失败重试和告警

## 运维前置

启动本地基础设施：

```bash
npm run infra:up
```

开启 Qdrant indexing：

```bash
QDRANT_ENABLED=true npm run start:dev -w @enterprise-agent/api
```

## 下一步

建议下一步实现 `异步 Indexing Job`：

1. 将 re-index 从同步请求迁移为异步 job
2. 增加 Redis queue
3. 增加 indexing 失败重试
4. 记录 indexing trace event
5. 暴露 job 状态查询 API
