# RAG / Knowledge

## 技术路线决策

生产级 RAG / Knowledge 模块采用：

```text
PostgreSQL + Qdrant + Embedding Provider
```

当前阶段采用：

```text
PostgresKnowledgeStore + Qdrant vector search + hybrid retrieval
```

原因：

- Qdrant 是生产级向量检索引擎，适合企业私有知识库语义检索
- PostgreSQL 用于存储 documents、chunks、权限、租户、来源等业务元数据
- wiki 不是核心 RAG 存储，而是知识来源 connector 之一
- 当前已经将 knowledge documents / chunks 持久化到 PostgreSQL
- 当前已经建立 Qdrant VectorStore 与 EmbeddingProvider 抽象
- 当前已经支持 OpenAI-compatible EmbeddingProvider
- 当前已经支持 keyword + vector hybrid retrieval

## 目标架构

```text
Document Sources
  ├── manual
  ├── upload
  ├── wiki
  ├── webpage
  └── api
      ↓
Ingestion Pipeline
  ├── parse
  ├── normalize
  ├── chunk
  └── embed
      ↓
Storage
  ├── PostgreSQL: metadata / permissions / chunks
  └── Qdrant: vectors / payload filters
      ↓
Retrieval
  ├── tenant filter
  ├── metadata filter
  ├── vector search
  ├── rerank
  └── source citation
      ↓
Memory & Context
```

## 当前实现

路径：

```text
apps/api/src/rag/
  knowledge.constants.ts
  rag.types.ts
  rag.service.ts
  rag.controller.ts
  knowledge-chunker.service.ts
  postgres-knowledge.store.ts
  dto/
    ingest-knowledge.dto.ts
    retrieve-knowledge.dto.ts

apps/api/src/vector-store/
  vector-store.constants.ts
  vector-store.types.ts
  vector-store.module.ts
  qdrant-vector.store.ts
  embedding-provider.factory.ts
  openai-compatible-embedding.provider.ts
  local-hash-embedding.provider.ts
```

当前实现能力：

- 知识文档类型
- chunk 类型
- 检索结果类型
- ingestion API
- retrieval API
- documents list API
- 文档分块
- tenantId 隔离
- tags filter
- PostgreSQL documents 持久化
- PostgreSQL chunks 持久化
- Qdrant collection ensure
- Qdrant vector upsert
- EmbeddingProvider 抽象
- OpenAI-compatible embeddings
- local-hash dev fallback
- vector search
- keyword scoring
- hybrid scoring
- source citation message
- structured source metadata
- Agent answer source summary
- Agent Runtime 自动检索接入

## API

### 写入知识

```http
POST /api/knowledge/ingest
```

示例：

```json
{
  "title": "企业报销制度",
  "content": "差旅报销需要在 30 天内提交发票和审批单。",
  "sourceType": "manual",
  "tags": ["finance", "policy"]
}
```

### 检索知识

```http
POST /api/knowledge/retrieve
```

示例：

```json
{
  "query": "差旅报销多久内提交",
  "limit": 5,
  "tags": ["finance"]
}
```

### 文档列表

```http
GET /api/knowledge/documents
```

## Agent Runtime 接入

`POST /api/agent/run` 会从认证上下文读取 `tenantId`，然后：

1. 使用用户消息作为 query
2. 调用 `RagService.retrieveAsContext()`
3. 将检索结果拆成模型可读的 `messages` 和系统可读的 `sources`
4. 将 `retrievedKnowledge` 和 `retrievedKnowledgeSources` 交给 `MemoryContextService.buildContext()`
5. 在上下文预算允许时注入模型消息
6. 在 Agent run result 中返回 `context.sources` 和 `sourceSummary`

这意味着 RAG 检索结果会出现在 Agent 响应的 `context.sources` 中，便于排查是否被纳入上下文。

`context.sources` 中的 retrieved knowledge 会包含结构化 metadata：

```text
documentId
chunkId
chunkIndex
title
sourceType
sourceUri
score
retrievalMode
matchedTerms
citationIndex
tags
```

`sourceSummary` 是面向最终答案的引用摘要，只保留已进入上下文的知识来源：

```text
id
title
sourceType
sourceUri
documentId
chunkId
score
retrievalMode
```

Web Agent Chat 会展示：

- `Context Sources`：所有上下文层的纳入/丢弃情况。
- `Answer Source Summary`：最终答案保留的引用摘要。
- `Knowledge Sources`：RAG 文档/chunk/source metadata 卡片。

## 当前检索策略

当前是 PostgreSQL 持久化 + Qdrant vector search + hybrid retrieval：

- ingestion 时保存 PostgreSQL document/chunks
- `QDRANT_ENABLED=true` 时同步生成 embedding 并写入 Qdrant
- retrieval 时先执行 PostgreSQL keyword search
- `QDRANT_ENABLED=true` 时额外执行 Qdrant vector search
- vector search 使用 tenant/tag payload filter
- vector 命中后按 chunk id 回 PostgreSQL hydrate 完整内容
- keyword 与 vector 结果按 chunk id 合并
- Qdrant 关闭时自动降级为 keyword retrieval
- Qdrant 或 embedding 请求失败时记录 trace 并降级为 keyword retrieval

当前默认 embedding 仍是本地 hash embedding，生产可设置 `EMBEDDING_PROVIDER=openai-compatible` 切换真实 embedding。

## 当前边界

已完成：

- RAG 类型系统
- KNOWLEDGE_STORE token
- PostgresKnowledgeStore
- KnowledgeChunker
- ingestion
- retrieval
- tenant filter
- tags filter
- knowledge_documents 落库
- knowledge_chunks 落库
- VectorStore 抽象
- QdrantVectorStore
- Qdrant payload index 初始化
- EmbeddingProvider 抽象
- LocalHashEmbeddingProvider
- OpenAiCompatibleEmbeddingProvider
- EmbeddingProviderFactory
- ingestion vector indexing 扩展点
- vector retrieval
- hybrid retrieval
- vector failure fallback
- `rag.vector.failed` trace
- tenant re-index API
- async indexing job
- Redis queue worker
- indexing job status query
- `rag.indexing.completed` trace
- `rag.indexing.failed` trace
- Agent Runtime 接入
- Memory & Context 注入点
- retrieved knowledge source metadata
- Agent run `sourceSummary`
- Web Agent Chat 引用卡片

未完成：

- PDF / docx / webpage parser
- wiki connector
- rerank
- source permission model
- retrieval evaluation

## 下一步

建议下一步实现 `Source Governance / Evaluation`：

1. source-level permission model
2. rerank
3. retrieval evaluation cases
4. source freshness / stale detection
5. 引用可点击跳转到 Knowledge document detail
