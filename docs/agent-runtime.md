# Agent Runtime

## 目标

Agent Runtime 是企业级 Agent 平台的核心执行层。它负责把用户请求、模型调用、工具调用和多步控制串起来，形成可治理、可审计、可扩展的 Agent 执行循环。

该模块解决的问题：

- 将 Model Gateway 与 Tool Registry 串成可执行 Agent
- 支持基础 ReAct loop
- 控制最大步骤数和最大执行时长
- 记录模型步骤、工具步骤、usage 和 stop reason
- 为后续 Memory、RAG、Workflow、Observability 接入预留边界

## 当前实现

路径：

```text
apps/api/src/agent-runtime/
  agent-runtime.module.ts
  agent-runtime.controller.ts
  agent-runtime.service.ts
  agent-runtime.types.ts
  dto/
    run-agent.dto.ts
```

## 核心能力

当前 Agent Runtime 支持：

- 用户消息输入
- 可选 system prompt
- 可选历史 messages
- 注入已注册工具定义
- 调用 Model Gateway
- 识别模型返回的 tool calls
- 并行执行工具调用
- 将 tool result 回填到模型上下文
- 多步循环直到最终回答
- max steps
- max duration
- usage 聚合
- step trace
- stop reason

## ReAct 执行流程

```text
1. 构造 messages
2. 获取 Tool Registry 中的工具定义
3. 调用 Model Gateway
4. 如果模型返回最终文本：
   - 结束
5. 如果模型返回 tool calls：
   - 通过 Tool Registry 并行执行工具
   - 追加 assistant tool_calls 消息
   - 追加 tool result 消息
   - 进入下一轮
6. 达到 max steps 或 max duration 时停止
```

## API

### 能力快照

```http
GET /api/agent/capabilities
```

返回当前 Agent 平台模块能力快照。

### 执行 Agent

```http
POST /api/agent/run
```

示例请求：

```json
{
  "message": "现在上海时间是几点？",
  "requestId": "00000000-0000-4000-8000-000000000000",
  "maxSteps": 6,
  "maxDurationMs": 60000
}
```

示例响应结构：

```json
{
  "requestId": "00000000-0000-4000-8000-000000000000",
  "answer": "...",
  "stopReason": "final_answer",
  "steps": [],
  "messages": [],
  "usage": {
    "promptTokens": 0,
    "completionTokens": 0,
    "totalTokens": 0
  },
  "durationMs": 1234
}
```

## 停止原因

当前 stop reason：

- `final_answer`：模型返回最终回答，没有继续调用工具
- `max_steps`：达到最大步骤数
- `max_duration`：达到最大执行时长
- `model_error`：模型调用失败

## 安全边界

当前已有：

- 最大步骤数
- 最大执行时长
- 工具调用统一走 Tool Registry
- 工具参数校验
- 工具权限检查
- 工具超时
- 工具审计事件

尚未接入：

- Auth/RBAC 用户真实权限
- Observability trace 持久化
- Memory & Context 上下文压缩
- RAG 检索注入
- Workflow 任务状态持久化

## 当前边界

已完成：

- 基础 ReAct loop
- Model Gateway 调用
- Tool Registry 调用
- 多工具并行执行
- tool call 上下文回填
- usage 聚合
- step trace
- Agent 执行 API

未完成：

- streaming response
- 对话持久化
- 上下文预算管理
- RAG context 注入
- 任务计划模式
- Reflection 策略
- 多 Agent 编排
- 执行 trace 持久化

## 下一步

建议下一步实现 `Memory & Context` 基础版：

1. 定义上下文包结构
2. 支持短期会话 messages
3. 支持 token budget 占位策略
4. 支持上下文裁剪和摘要接口
5. 让 Agent Runtime 通过 MemoryContextService 构造初始 messages
