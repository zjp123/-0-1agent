# Embedding Provider

## 目标

Embedding Provider 负责为 RAG chunks 和 query 生成向量。

这一步将本地 hash embedding 升级为配置驱动的 provider 体系：开发环境默认 `local-hash`，生产环境可以切换到 OpenAI-compatible embeddings。

## 当前实现

路径：

```text
apps/api/src/vector-store/
  vector-store.types.ts
  vector-store.constants.ts
  embedding-provider.factory.ts
  local-hash-embedding.provider.ts
  openai-compatible-embedding.provider.ts
```

## 抽象

接口：

```ts
interface EmbeddingProvider {
  getModel(): string;
  getDimension(): number;
  embedMany(texts: string[]): Promise<number[][]>;
}
```

DI token：

```ts
EMBEDDING_PROVIDER
```

Provider 选择由 `EmbeddingProviderFactory` 根据配置完成。

## Provider 类型

### local-hash

默认 provider：

```bash
EMBEDDING_PROVIDER=local-hash
```

用途：

- 本地开发
- 无外部 API key 的端到端链路验证
- Qdrant upsert/search 基础验证

限制：

- 不具备真实语义检索能力
- 不适合作为生产检索质量基线

### openai-compatible

生产 provider：

```bash
EMBEDDING_PROVIDER=openai-compatible
EMBEDDING_API_KEY=...
EMBEDDING_BASE_URL=https://api.openai.com/v1
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_DIMENSION=1536
QDRANT_VECTOR_SIZE=1536
```

能力：

- OpenAI-compatible embeddings endpoint
- 独立 API key
- 独立 base URL
- 独立 model
- timeout
- retry
- dimensions 参数

## 配置

当前支持：

```bash
EMBEDDING_PROVIDER=local-hash
EMBEDDING_MODEL=text-embedding-3-small
EMBEDDING_BASE_URL=https://api.openai.com/v1
EMBEDDING_API_KEY=
EMBEDDING_DIMENSION=384
EMBEDDING_TIMEOUT_MS=30000
EMBEDDING_MAX_RETRIES=2
```

`EMBEDDING_API_KEY` fallback 顺序：

1. `EMBEDDING_API_KEY`
2. `LLM_API_KEY`
3. `OPENAI_API_KEY`

## 与 Qdrant 的关系

Qdrant collection vector size 必须与 embedding dimension 一致。

示例：

```bash
EMBEDDING_DIMENSION=1536
QDRANT_VECTOR_SIZE=1536
```

如果切换 provider、model 或 dimension，需要重新 indexing 已有 chunks。

## 当前边界

已完成：

- EmbeddingProvider 接口
- LocalHashEmbeddingProvider
- OpenAiCompatibleEmbeddingProvider
- EmbeddingProviderFactory
- provider 配置选择
- timeout
- retry
- env 校验
- 生产环境 openai-compatible API key 校验

未完成：

- embedding usage 统计
- embedding 错误结构化封装
- re-index API
- indexing job
- provider 切换迁移工具
- embedding cache

## 下一步

建议下一步实现 `Qdrant fallback + indexing job`：

1. vector search 失败时 fallback keyword
2. 记录 fallback trace
3. 增加 re-index API
4. 将 indexing 迁移到异步 job
5. 后续接 Redis queue
