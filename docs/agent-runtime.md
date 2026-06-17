# Agent Runtime

## 目标

Agent Runtime 是企业级 Agent 平台的核心执行层。它负责把用户请求、模型调用、工具调用和多步控制串起来，形成可治理、可审计、可扩展的 Agent 执行循环。

该模块解决的问题：

- 将 Model Gateway 与 Tool Registry 串成可执行 Agent
- 支持基础 ReAct loop
- 控制最大步骤数和最大执行时长
- 记录模型步骤、工具步骤、usage 和 stop reason
- 执行前治理 preflight
- 高风险工具 approval-required 中断
- Agent run history / usage trace
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
- execution plan
- preflight trace
- usage trace
- RAG source summary
- structured tool output
- approval-required stop reason

## ReAct 执行流程

```text
1. 构造 messages
2. 获取 Tool Registry 中的工具定义
3. 调用 Model Gateway
4. 如果模型返回最终文本：
   - 结束
5. 如果模型返回 tool calls：
   - 检查工具风险等级
   - high / critical 工具自动创建 approval request，并以 `approval_required` 停止
   - low / medium 工具通过 Tool Registry 顺序执行
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
  "sourceSummary": [],
  "stopReason": "final_answer",
  "plan": {},
  "steps": [],
  "context": {},
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
- `approval_required`：高风险工具调用需要人工审批
- `max_tool_calls`：工具调用总数超过保护阈值
- `empty_model_output`：模型连续返回空输出
- `repeated_tool_call`：相同工具调用重复过多

## 安全边界

当前已有：

- 最大步骤数
- 最大执行时长
- 工具调用统一走 Tool Registry
- 工具参数校验
- 工具权限检查
- 工具超时
- 工具审计事件
- Agent preflight trace
- Request quota 和 token quota
- 高风险工具 approval request

尚未完整接入：

- Security/Governance Web 页面联动
- 审批通过后的 Agent run 恢复执行
- 真实 cost/billing ledger

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
- SSE streaming 包装
- Memory & Context
- RAG context 注入
- Workflow step executor
- Evaluation Agent run
- Observability request timeline
- Tools/RAG structured metadata
- Governance preflight
- approval-required 工具中断
- Agent run history

未完成：

- 对话持久化
- 审批通过后的恢复执行
- Security/Governance Web 联动
- Reflection 策略
- 真实 cost/billing ledger

## 下一步

建议下一步实现 `Security/Governance Web 联动`：

1. Security 页面展示 approval requests
2. Observability Agent Runs 增加详情 drawer
3. approval request 审批后支持恢复 Agent run
4. usage/cost dashboard
5. governance audit 汇总
