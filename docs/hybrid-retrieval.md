# Hybrid Retrieval

## 目标

Hybrid Retrieval 将 RAG 检索从单一 PostgreSQL keyword search 升级为 keyword + Qdrant vector search 的混合检索。

这一步的目标不是完成最终检索质量，而是建立企业级检索编排边界：多路召回、统一 hydrate、租户过滤、结果合并和可降级路径。

## 当前实现

路径：

```text
apps/api/src/rag/
  rag.types.ts
  rag.service.ts
  postgres-knowledge.store.ts
  in-memory-knowledge.store.ts

apps/api/src/vector-store/
  vector-store.types.ts
  qdrant-vector.store.ts
  local-hash-embedding.provider.ts
```

## 检索流程

当前 `RagService.retrieve()` 流程：

1. 执行 `KnowledgeStore.search()` 获取 keyword results
2. 如果 `VectorStore.isEnabled()` 为 false，返回 keyword results
3. 使用 `EmbeddingProvider.embedMany()` 为 query 生成 vector
4. 调用 `VectorStore.search()`
5. Qdrant 使用 tenant/tag payload filter
6. 使用 Qdrant point id 作为 chunk id
7. 调用 `KnowledgeStore.findChunksByIds()` 回 PostgreSQL hydrate
8. 合并 keyword results 和 vector results
9. 返回统一的 `KnowledgeSearchResult[]`

## KnowledgeStore 新增能力

新增接口：

```ts
findChunksByIds(tenantId: string, chunkIds: string[]): Promise<KnowledgeChunk[]>
```

原因：

- Qdrant 只负责召回 chunk id 和 score
- PostgreSQL 仍是知识内容、source、tags 的权威存储
- 避免向量库 payload 与数据库文档内容长期漂移

## 结果字段

`KnowledgeSearchResult` 新增：

```ts
retrievalMode?: "keyword" | "vector" | "hybrid";
scores?: {
  keyword?: number;
  vector?: number;
};
```

这样后续排查 Agent 回答时，可以知道知识片段来自 keyword、vector 还是两者共同命中。

## 合并策略

当前规则：

- keyword results 先进入结果池
- vector results 按 chunk id 合并
- keyword only -> `retrievalMode=keyword`
- vector only -> `retrievalMode=vector`
- 两者都命中 -> `retrievalMode=hybrid`
- 最终 score = `keywordScore * 1 + vectorScore * 4`

当前权重只是开发期策略，后续需要通过 evaluation 数据校准。

## 降级策略

当前降级：

- `QDRANT_ENABLED=false`：只走 keyword
- Qdrant 无结果：只走 keyword
- Qdrant 命中但 PostgreSQL 查不到 chunk：丢弃该结果

当前还没有实现：

- Qdrant 请求失败自动 fallback
- fallback trace event
- hybrid score evaluation

## 当前边界

已完成：

- Hybrid retrieval 编排
- Vector query embedding
- Qdrant vector search
- tenant/tag payload filter
- chunk hydrate
- keyword/vector result merge
- retrievalMode 标记
- keyword/vector score 明细

未完成：

- 真实 embedding provider
- Qdrant 请求失败 fallback
- Qdrant payload index
- rerank
- retrieval evaluation 自动化
- score 权重调优
- source permission filter

## 下一步

建议下一步实现 `真实 Embedding Provider`：

1. 增加 embedding provider 配置
2. 接入 OpenAI-compatible embeddings endpoint
3. 保留 LocalHashEmbeddingProvider 作为 dev fallback
4. 增加 embedding timeout/retry
5. 制定已入库 chunks 的 re-index 策略
