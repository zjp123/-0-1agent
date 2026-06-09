# RAG / Knowledge

## 技术路线决策

生产级 RAG / Knowledge 模块采用：

```text
PostgreSQL + Qdrant + Embedding Provider
```

当前阶段采用：

```text
InMemoryKnowledgeStore + keyword retrieval
```

原因：

- Qdrant 是生产级向量检索引擎，适合企业私有知识库语义检索
- PostgreSQL 用于存储 documents、chunks、权限、租户、来源等业务元数据
- wiki 不是核心 RAG 存储，而是知识来源 connector 之一
- 当前先用内存实现稳定 API 和架构边界，后续替换为 PostgreSQL + Qdrant

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
  rag.types.ts
  rag.service.ts
  rag.controller.ts
  knowledge-chunker.service.ts
  in-memory-knowledge.store.ts
  dto/
    ingest-knowledge.dto.ts
    retrieve-knowledge.dto.ts
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
- keyword scoring
- source citation message
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
2. 调用 `RagService.retrieveAsContextMessages()`
3. 将检索结果作为 `retrievedKnowledge`
4. 交给 `MemoryContextService.buildContext()`
5. 在上下文预算允许时注入模型消息

这意味着 RAG 检索结果会出现在 Agent 响应的 `context.sources` 中，便于排查是否被纳入上下文。

## 当前检索策略

当前是开发期 keyword retrieval：

- query 分词
- 按 tenantId 过滤 chunks
- 按 tags 过滤
- title 命中加权
- content/tags 命中计分
- 按 score 排序

该策略仅用于早期开发和接口稳定，不代表最终生产检索质量。

## 当前边界

已完成：

- RAG 类型系统
- InMemoryKnowledgeStore
- KnowledgeChunker
- ingestion
- retrieval
- tenant filter
- tags filter
- Agent Runtime 接入
- Memory & Context 注入点

未完成：

- PostgreSQL metadata store
- Qdrant vector store
- embedding provider
- PDF / docx / webpage parser
- wiki connector
- hybrid search
- rerank
- source permission model
- retrieval evaluation

## 下一步

建议下一步实现 `Observability` 基础版：

1. 定义 trace event 类型
2. 记录 model call、tool call、rag retrieval、context build
3. 提供 in-memory trace store
4. 提供 trace 查询 API
5. 后续再接 OpenTelemetry / Pino / metrics
