# Knowledge Persistence

## 目标

Knowledge Persistence 将 RAG / Knowledge 的知识文档和分块从 in-memory store 切换到 PostgreSQL。

这一步的目标是让企业知识库具备可持久化、可恢复、可按租户隔离查询的基础能力，并为后续 Qdrant 向量检索接入准备稳定的数据边界。

## 当前实现

路径：

```text
apps/api/src/rag/
  knowledge.constants.ts
  postgres-knowledge.store.ts
  rag.service.ts
  rag.module.ts
```

## Store 抽象

当前 token：

```ts
KNOWLEDGE_STORE
```

绑定：

```ts
{
  provide: KNOWLEDGE_STORE,
  useExisting: PostgresKnowledgeStore
}
```

`RagService` 只依赖 `KnowledgeStore` 接口，不依赖具体 PostgreSQL 实现。

## 持久化表

当前使用：

- `tenants`
- `knowledge_documents`
- `knowledge_chunks`

`knowledge_documents` 保存文档级信息：

- title
- content
- sourceType
- sourceUri
- tags
- tenantId

`knowledge_chunks` 保存检索分块：

- documentId
- chunkIndex
- content
- tokenEstimate
- metadata

## IdentityService

Knowledge API 仍然使用认证上下文中的外部字符串：

- `tenantId`

`PostgresKnowledgeStore` 通过 `IdentityService.ensureTenant()` 将外部 tenantId 映射到数据库 UUID。

API 返回值继续使用外部 tenantId，避免把内部数据库 UUID 泄露给调用方。

## 当前检索策略

当前检索仍然是 keyword retrieval：

1. 按 tenantId 查询 PostgreSQL chunks
2. join documents 获取 title、source、tags
3. 对 query 做简单分词
4. 使用 tags 过滤
5. 使用 title / content / tags 命中情况计分
6. 按 score 排序后返回 topK

这只是为了保持 RAG API 和 Agent Runtime 接入稳定，不是最终生产检索质量。

## 当前边界

已完成：

- KNOWLEDGE_STORE token
- PostgresKnowledgeStore
- RagService 依赖接口
- RagModule provider 切换
- knowledge_documents 落库
- knowledge_chunks 落库
- documents list 按租户过滤
- retrieval 按租户过滤
- tags filter 保留
- Agent Runtime RAG 注入链路保留

未完成：

- 真实 embedding provider
- hybrid search
- rerank
- document/chunk update API
- document delete API
- parser pipeline
- source permission model
- ingestion transaction

## 运维前置

本模块依赖 PostgreSQL schema 已经创建。

本地开发启动基础设施：

```bash
npm run infra:up
```

同步数据库 schema：

```bash
npm run db:push
```

## 下一步

下一步已经进入 `Qdrant / Vector Store` 基础版。

当前后续建议：

1. 将 retrieval 升级为 vector / keyword hybrid search
2. 接入真实 embedding provider
3. 增加 document update/delete 时的 Qdrant 同步删除
4. 增加 ingestion transaction / outbox
