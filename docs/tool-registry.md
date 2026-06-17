# Tool Registry

## 目标

Tool Registry 是 Agent 调用外部能力的统一入口。Agent Runtime 后续不直接调用具体函数、MCP server 或第三方 API，而是通过 Tool Registry 完成工具发现、参数校验、权限检查、超时控制、结果截断和审计记录。

该模块解决的问题：

- 避免工具调用散落在 Agent Runtime 内部
- 给所有工具执行加上统一安全边界
- 为 MCP 工具、本地内置工具和未来第三方工具提供统一抽象
- 为审计、排障、评估回放提供结构化数据

## 当前实现

路径：

```text
apps/api/src/tools/
  tool.types.ts
  tool-input.validator.ts
  tool-registry.errors.ts
  tool-registry.service.ts
  tools.controller.ts
  dto/
    execute-tool.dto.ts
  builtin/
    current-time.tool.ts
    calculator.tool.ts
```

## 核心类型

工具定义：

```ts
type ToolDefinition = {
  name: string;
  description: string;
  source: "builtin" | "mcp";
  riskLevel: "low" | "medium" | "high" | "critical";
  inputSchema: ToolInputSchema;
  outputSchema?: ToolInputSchema;
  timeoutMs: number;
  maxResultLength: number;
  requiredPermissions: string[];
};
```

工具执行请求：

```ts
type ToolCallRequest = {
  name: string;
  arguments: Record<string, unknown>;
  context: ToolExecutionContext;
  timeoutMs?: number;
};
```

工具执行响应：

```ts
type ToolCallResponse = {
  toolName: string;
  source: "builtin" | "mcp";
  riskLevel: "low" | "medium" | "high" | "critical";
  requiredPermissions: string[];
  status: ToolStatus;
  content: string;
  data?: JsonObject;
  latencyMs: number;
  audit: ToolAuditEvent;
};
```

说明：

- `content` 是给模型继续推理使用的文本结果。
- `data` 是给 Web、审计、评估、回放使用的结构化结果。
- `riskLevel` 用于后续审批、人机协同和安全策略。
- `outputSchema` 描述结构化结果的契约，便于工具接入方和前端展示。

## 执行链路

一次工具调用会经过以下步骤：

1. 根据工具名查找 handler
2. 检查工具是否存在
3. 检查调用上下文是否具备 required permissions
4. 使用工具 input schema 校验参数
5. 在工具 timeout 内执行 handler
6. 截断超长结果
7. 生成结构化 audit event
8. 返回统一响应

## 当前内置工具

### current_time

返回指定 IANA timezone 的当前服务端时间。

参数：

```json
{
  "timeZone": "Asia/Shanghai"
}
```

### calculator

使用自研基础算术解析器计算表达式。

支持：

- 数字
- `+`
- `-`
- `*`
- `/`
- `%`
- 括号
- 一元正负号

不使用 `eval()`。

参数：

```json
{
  "expression": "(128 * 256) / 2"
}
```

## API

当前提供两个调试/集成接口：

```http
GET /api/tools
```

返回已注册工具定义。

```http
POST /api/tools/execute
```

执行工具。

示例请求：

```json
{
  "name": "calculator",
  "arguments": {
    "expression": "(128 * 256) / 2"
  },
  "requestId": "00000000-0000-4000-8000-000000000000"
}
```

## 审计信息

每次工具调用都会返回 `audit`：

- requestId
- toolName
- source
- riskLevel
- status
- startedAt
- endedAt
- latencyMs
- inputPreview
- resultPreview
- error
- userId
- tenantId
- requiredPermissions

当前 audit 只随响应返回，后续需要接入 Observability 模块持久化。

## Agent Runtime 接入

Agent Runtime 现在会把工具调用的生产级元数据透出到 run result：

- `source`
- `riskLevel`
- `requiredPermissions`
- `status`
- `latencyMs`
- `structuredOutput`
- `audit`

同时 `tool.completed` trace 会记录工具来源、风险等级、是否有结构化输出和 required permission 数量，方便在 Observability timeline 中排查。

Web Agent Chat 的 Run Details 会展示 `Tool Outputs` 卡片：

- 工具名称、来源、状态、耗时
- 风险等级 badge
- 所需权限
- 结构化 JSON 输出；没有结构化结果时 fallback 到文本 preview

## 当前边界

已完成：

- 工具定义接口
- 工具 handler 接口
- JSON Schema 子集参数校验
- 权限检查
- 执行超时
- 结果截断
- 审计事件结构
- 工具风险等级
- 工具 output schema
- 工具 structured output 透传
- Agent Chat 工具输出卡片
- 内置 `current_time`
- 内置 `calculator`
- 工具列表 API
- 工具执行 API

未完成：

- MCP adapter
- 高风险工具 approval-required 中断态
- 审计持久化
- 工具结果脱敏策略
- 工具并行执行编排
- 更完整的工具调用指标

## 下一步

建议下一步实现 `Tool Governance`：

1. 高风险工具执行前返回 `approval-required`
2. Web 展示审批请求
3. 审批通过后恢复 Agent run
4. 对工具结果做字段级脱敏
5. 持久化工具 audit event
