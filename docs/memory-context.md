# Memory & Context

## 目标

Memory & Context 模块负责为 Agent Runtime 构造模型上下文。它不直接调用模型，也不执行工具，而是统一管理 system prompt、历史消息、用户当前输入、RAG 检索内容和 token budget。

该模块解决的问题：

- 避免 Agent Runtime 自己拼接 messages
- 统一上下文预算和裁剪策略
- 记录每个上下文来源是否被纳入
- 为后续长期记忆、RAG 注入、摘要压缩和持久化预留边界

## 当前实现

路径：

```text
apps/api/src/memory-context/
  memory-context.module.ts
  memory-context.service.ts
  memory-context.types.ts
```

## 上下文层

当前定义的上下文层：

- `system`
- `history`
- `retrieved_knowledge`
- `user_input`

当前 Agent Runtime 已经通过 `MemoryContextService.buildContext()` 构造初始 messages。

## 核心输入

```ts
type BuildContextRequest = {
  systemPrompt?: string;
  history?: ModelMessage[];
  userMessage: string;
  retrievedKnowledge?: ModelMessage[];
  maxTokens?: number;
  reservedResponseTokens?: number;
};
```

## 核心输出

```ts
type BuildContextResult = {
  messages: ModelMessage[];
  budget: ContextBudget;
  estimatedInputTokens: number;
  sources: ContextSource[];
  droppedMessages: number;
};
```

## Token Budget

默认值：

- `maxTokens`: `8000`
- `reservedResponseTokens`: `1000`
- `availableInputTokens`: `maxTokens - reservedResponseTokens`

当前 token 计算是估算器，不依赖具体模型 tokenizer。

估算策略：

- 英文/数字词按约 `1.3 tokens`
- 中文字符按约 `1 token`
- 标点按约 `0.5 tokens`
- tool call 名称与参数也计入消息估算

后续接入具体模型 tokenizer 后，可替换估算逻辑。

## 裁剪策略

当前策略：

1. system prompt 永远保留
2. 当前 user message 永远保留
3. retrieved knowledge 按传入顺序尝试放入
4. history 从最近消息开始倒序选择
5. 超出预算的历史消息丢弃
6. 每个来源都会记录 included 和 reason

这个策略先保证行为可解释，不追求最优上下文压缩。

## Agent Runtime 接入

`POST /api/agent/run` 当前支持额外上下文参数：

```json
{
  "message": "继续刚才的话题",
  "requestId": "00000000-0000-4000-8000-000000000000",
  "messages": [],
  "contextMaxTokens": 8000,
  "reservedResponseTokens": 1000
}
```

响应中会返回：

```json
{
  "context": {
    "budget": {},
    "estimatedInputTokens": 0,
    "sources": [],
    "droppedMessages": 0
  }
}
```

这可以用于排查：

- 为什么某些历史消息没有进入上下文
- 当前请求大概用了多少输入 tokens
- 哪些层被纳入或被丢弃

## 当前边界

已完成：

- 上下文包类型
- 默认 system prompt
- token budget
- token 估算
- retrieved knowledge 注入点
- history 最近优先裁剪
- context sources 追踪
- Agent Runtime 接入

未完成：

- 会话持久化
- 用户长期记忆
- 摘要压缩
- RAG 自动检索
- 具体模型 tokenizer
- 上下文重要性排序
- 敏感信息过滤

## 下一步

建议下一步实现 `RAG / Knowledge` 基础架构：

1. 定义知识文档、chunk、检索结果类型
2. 实现本地内存知识库接口
3. 提供 knowledge ingestion API
4. 提供 retrieval API
5. 将检索结果转换为 retrieved knowledge messages
6. 接入 Agent Runtime 的 MemoryContextService
