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
  postgres-knowledge.store.ts
  in-memory-knowledge.store.ts

apps/api/src/vector-store/
  vector-store.types.ts
  qdrant-vector.store.ts
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
  "tenantId": "default",
  "status": "completed",
  "chunkCount": 42,
  "vectorStoreEnabled": true,
  "collection": "enterprise_agent_knowledge_chunks",
  "embeddingModel": "text-embedding-3-small",
  "dimensions": 1536
}
```

如果 `QDRANT_ENABLED=false`：

```json
{
  "tenantId": "default",
  "status": "skipped",
  "chunkCount": 0,
  "vectorStoreEnabled": false,
  "collection": "enterprise_agent_knowledge_chunks",
  "embeddingModel": "local-hash-embedding",
  "dimensions": 384
}
```

## 流程

当前同步流程：

1. 从认证上下文读取当前 tenantId
2. 调用 `KnowledgeStore.listChunks(tenantId)`
3. 调用 `VectorStore.ensureCollection()`
4. 调用 `VectorStore.ensurePayloadIndexes()`
5. 使用当前 `EmbeddingProvider` 为所有 chunks 生成 vectors
6. 调用 `VectorStore.upsert(points)` 写入 Qdrant

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

## 当前边界

已完成：

- tenant 级 re-index API
- `KnowledgeReindexResult`
- `KnowledgeStore.listChunks()`
- PostgreSQL chunks 列表读取
- Qdrant collection ensure
- Qdrant payload index ensure
- 使用当前 EmbeddingProvider 重建 vectors

未完成：

- 异步 indexing job
- job 状态查询
- re-index trace event
- indexing 失败重试
- 按 documentId 局部 re-index
- Qdrant delete/update 同步
- provider/dimension 切换检测

## 运维注意

切换真实 embedding 时需要确保：

```bash
EMBEDDING_DIMENSION=1536
QDRANT_VECTOR_SIZE=1536
```

如果 Qdrant collection 已经用旧 dimension 创建，需要新建 collection 或清空后重建。

## 下一步

建议下一步实现 `异步 Indexing Job`：

1. 定义 indexing job 类型
2. 增加 job 状态存储
3. 将 `/api/knowledge/reindex` 改成创建 job
4. worker 异步执行 embedding/upsert
5. 记录 indexing trace 和失败原因
