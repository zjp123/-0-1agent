# RAG Re-indexing

## 目标

RAG Re-indexing 提供知识库向量索引重建能力。

当 embedding provider、embedding model、embedding dimension 或 Qdrant collection 配置变化时，已有 PostgreSQL chunks 需要重新生成 embedding 并写入 Qdrant。

## 当前实现

路径：

```text
apps/api/src/rag/
  rag.types.ts
  rag.service.ts
  rag.controller.ts
  postgres-indexing-job.store.ts
  postgres-knowledge.store.ts
  in-memory-knowledge.store.ts

apps/api/src/vector-store/
  vector-store.types.ts
  qdrant-vector.store.ts

apps/api/src/db/
  schema.ts
```

## API

### 重建当前租户知识索引

```http
POST /api/knowledge/reindex
```

权限：

```text
knowledge:write
```

返回示例：

```json
{
  "id": "00000000-0000-4000-8000-000000000000",
  "tenantId": "default",
  "createdBy": "dev-user",
  "type": "tenant_reindex",
  "status": "pending",
  "totalChunks": 0,
  "processedChunks": 0,
  "failedChunks": 0,
  "metadata": {
    "collection": "enterprise_agent_knowledge_chunks",
    "embeddingModel": "text-embedding-3-small",
    "dimensions": 1536,
    "vectorStoreEnabled": true
  },
  "createdAt": "2026-06-10T00:00:00.000Z",
  "updatedAt": "2026-06-10T00:00:00.000Z"
}
```

### 查询 re-index jobs

```http
GET /api/knowledge/reindex/jobs
```

### 查询单个 re-index job

```http
GET /api/knowledge/reindex/jobs/:jobId
```

## 流程

当前异步流程：

1. 从认证上下文读取当前 tenantId
2. 创建 `indexing_jobs` 记录，状态为 `pending`
3. API 立即返回 job
4. 进程内后台 worker 将 job 标记为 `running`
5. 调用 `KnowledgeStore.listChunks(tenantId)`
6. 调用 `VectorStore.ensureCollection()`
7. 调用 `VectorStore.ensurePayloadIndexes()`
8. 按批次生成 embeddings 并 upsert 到 Qdrant
9. 更新 `processedChunks`
10. 成功时标记 `completed`
11. 失败时标记 `failed` 并记录 error

## Payload Index

Qdrant collection 初始化时会确保以下 payload index：

- `tenantId`
- `tags`
- `sourceType`
- `documentId`
- `chunkId`

这些字段对应当前 hybrid retrieval 的 filter 和后续排障/删除场景。

## KnowledgeStore 新增能力

新增接口：

```ts
listChunks(tenantId: string): Promise<KnowledgeChunk[]>
```

用途：

- re-index 当前租户全部 chunks
- 后续支持按 documentId / tags / sourceType 做局部 re-index

## Indexing Job Store

当前使用 PostgreSQL 表：

```text
indexing_jobs
```

状态：

- `pending`
- `running`
- `completed`
- `failed`

当前字段：

- tenantId
- createdBy
- type
- status
- totalChunks
- processedChunks
- failedChunks
- error
- metadata
- startedAt
- completedAt
- createdAt
- updatedAt

## Trace

当前新增 trace event：

- `rag.indexing.completed`
- `rag.indexing.failed`

## 当前边界

已完成：

- tenant 级 re-index API
- `IndexingJob`
- `IndexingJobStore`
- `PostgresIndexingJobStore`
- `indexing_jobs` 表
- indexing job migration
- `KnowledgeStore.listChunks()`
- PostgreSQL chunks 列表读取
- Qdrant collection ensure
- Qdrant payload index ensure
- 使用当前 EmbeddingProvider 重建 vectors
- 后台执行
- job 状态查询
- processed chunks 进度更新
- indexing completed / failed trace

未完成：

- indexing 失败重试
- 按 documentId 局部 re-index
- Qdrant delete/update 同步
- provider/dimension 切换检测
- Redis queue
- 多实例 worker 协调

## 运维注意

切换真实 embedding 时需要确保：

```bash
EMBEDDING_DIMENSION=1536
QDRANT_VECTOR_SIZE=1536
```

如果 Qdrant collection 已经用旧 dimension 创建，需要新建 collection 或清空后重建。

## 下一步

建议下一步实现 `Redis Queue Worker`：

1. 将进程内后台执行迁移到 Redis queue
2. 支持多实例 worker 消费
3. 增加失败重试和 dead-letter
4. 增加 job cancel API
5. 增加 worker heartbeat
