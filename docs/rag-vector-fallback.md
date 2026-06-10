# RAG Vector Fallback

## 目标

RAG Vector Fallback 让 hybrid retrieval 在 Qdrant 或 embedding provider 短暂异常时继续可用。

当前策略是：vector path 失败时记录 trace，然后自动返回 PostgreSQL keyword results，不让向量检索异常直接打断 Agent 主流程。

## 当前实现

路径：

```text
apps/api/src/rag/
  rag.service.ts
  rag.types.ts
  rag.module.ts

apps/api/src/observability/
  observability.types.ts
  observability.service.ts
```

## 触发条件

以下情况会触发 fallback：

- query embedding 失败
- Qdrant search 失败
- Qdrant HTTP timeout
- Qdrant 返回非 2xx
- vector hydrate 过程抛出异常

以下情况不会记录失败 trace：

- `QDRANT_ENABLED=false`
- Qdrant 正常返回 0 条结果
- Qdrant 命中但 PostgreSQL 找不到对应 chunk

## 行为

`RagService.retrieve()` 当前流程：

1. 先执行 PostgreSQL keyword search
2. 如果 Qdrant 未开启，直接返回 keyword results
3. 如果 Qdrant 开启，执行 vector retrieval
4. vector retrieval 抛错时记录 `rag.vector.failed`
5. 返回 keyword results

这样保证 Agent Runtime 至少还能使用基础知识检索。

## Trace

新增事件类型：

```ts
rag.vector.failed
```

当前 attributes：

```ts
{
  queryLength: number;
  requestedLimit: number;
  tagCount: number;
  vectorStore: string;
  embeddingModel: string;
  errorName: string;
  errorMessage: string;
  fallbackMode: "keyword";
}
```

Agent Runtime 调用 RAG 时会传入 requestId 和 userId，因此 fallback trace 可以与同一次 Agent run 串联。

普通 Knowledge API 调用如果没有 requestId，RAG 会生成内部 `rag-*` requestId。

## 当前边界

已完成：

- vector retrieval try/catch
- keyword fallback
- `rag.vector.failed` trace type
- fallback trace attributes
- Agent Runtime requestId 透传
- Agent Runtime userId 透传

未完成：

- fallback 计数 metrics
- fallback 告警
- trace 写入失败日志
- vector indexing fallback / retry
- 用户可见的 degraded mode 标识

## 下一步

建议下一步实现 `Qdrant payload index + re-index job`：

1. 为 tenantId / tags 建 payload index
2. 增加 chunk re-index API
3. provider/dimension 切换后全量重建
4. indexing 失败重试
5. 记录 indexing trace
