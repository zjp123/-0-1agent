# Model Gateway

## 目标

Model Gateway 是企业级 Agent 平台的模型调用边界。业务模块、Agent Runtime、工具循环和 RAG 不直接依赖某个 LLM SDK，而是通过统一的网关类型发起模型请求。

该模块解决的问题：

- 避免业务代码直接耦合 DeepSeek、OpenAI 或其他 Provider
- 统一请求、响应、错误、重试、超时和 usage 数据
- 为后续 fallback、多模型路由、成本统计和评估回放预留入口

## 当前实现

路径：

```text
apps/api/src/model-gateway/
  model-gateway.module.ts
  model-gateway.service.ts
  model-gateway.types.ts
  model-gateway.errors.ts
  providers/
    openai-compatible.provider.ts
```

当前 Provider：

- `OpenAiCompatibleProvider`
- 默认配置为 DeepSeek OpenAI-compatible API
- 后续可增加 OpenAI、Anthropic、本地模型或 fallback router

## 统一类型

核心输入类型：

```ts
type ModelRequest = {
  messages: ModelMessage[];
  model?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: ModelToolDefinition[];
  timeoutMs?: number;
  maxRetries?: number;
  metadata?: Record<string, string>;
};
```

核心输出类型：

```ts
type ModelResponse = {
  id: string;
  provider: string;
  model: string;
  content: string;
  finishReason: string | null;
  toolCalls: ModelToolCall[];
  usage?: ModelUsage;
  latencyMs: number;
  attempts: number;
};
```

## 配置项

环境变量：

```bash
LLM_PROVIDER=deepseek
LLM_DEFAULT_MODEL=deepseek-chat
LLM_BASE_URL=https://api.deepseek.com
LLM_API_KEY=your-api-key-here
LLM_TIMEOUT_MS=30000
LLM_MAX_RETRIES=2
```

兼容旧变量：

```bash
DEEPSEEK_API_KEY=your-api-key-here
```

## 错误策略

所有 Provider 调用失败后统一抛出 `ModelGatewayError`。

错误信息包含：

- provider
- attempts
- cause
- retryable
- statusCode

当前可重试条件：

- HTTP 408
- HTTP 409
- HTTP 429
- HTTP 5xx
- timeout / connection 类错误

当前退避策略：

- 指数退避
- 初始 250ms
- 最大 2000ms

## 超时与重试

SDK 自带 retry 被关闭，统一由 Model Gateway 控制。

原因：

- 避免 SDK 内部重试和业务层重试叠加
- 方便记录 attempts
- 后续可统一接入 trace、metrics、cost 和熔断策略

## 当前边界

已完成：

- Model Provider 接口
- OpenAI-compatible Provider
- DeepSeek 配置支持
- timeout
- retry
- latency 统计
- usage 映射
- tool calls 映射
- 统一错误类型

未完成：

- streaming
- fallback router
- 多 Provider 动态路由
- token/cost 持久化
- request/response trace 持久化
- 模型调用评估回放

## 下一步

建议下一步实现 `Tool Registry`：

1. 定义工具接口和 schema
2. 实现工具权限占位
3. 注册基础内置工具
4. 为 MCP 工具接入预留 Adapter
5. 让 Agent Runtime 后续可以通过统一 registry 执行工具
