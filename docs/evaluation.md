# Evaluation

## 目标

Evaluation 模块负责沉淀 Agent 平台的回归评估能力。它用于记录评估用例、执行评估、保存评分结果，为后续模型、工具、RAG 和 Agent Runtime 的质量回归提供基础。

当前阶段先实现 deterministic 的基础评估链路，并已支持通过 Agent Runtime 自动运行 `agent_response` 类 case。评分器仍为 deterministic `string_contains`，暂不接 LLM Judge。

当前 EvaluationStore 已迁移到 PostgreSQL，持久化说明见 [evaluation-persistence.md](./evaluation-persistence.md)。

## 当前实现

路径：

```text
apps/api/src/evaluation/
  evaluation.types.ts
  evaluation.service.ts
  evaluation.controller.ts
  postgres-evaluation.store.ts
  evaluation.module.ts
  dto/
    create-evaluation-case.dto.ts
    run-evaluation.dto.ts

apps/api/src/agent-runtime/
  evaluation-agent-runner.service.ts
  dto/run-agent-evaluation.dto.ts
```

## 核心模型

EvaluationCase：

```ts
type EvaluationCase = {
  id: string;
  tenantId: string;
  createdBy: string;
  name: string;
  type: EvaluationCaseType;
  input: string;
  expectedOutput: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
};
```

EvaluationRun：

```ts
type EvaluationRun = {
  id: string;
  tenantId: string;
  caseId: string;
  status: "passed" | "failed";
  score: number;
  actualOutput: string;
  expectedOutput: string;
  evaluator: "string_contains";
  notes: string[];
  createdAt: string;
};
```

## 用例类型

当前支持：

- `agent_response`
- `rag_retrieval`
- `tool_execution`

## 评分器

当前评分器：

- `string_contains`

规则：

- 将 `actualOutput` 和 `expectedOutput` trim + lowercase
- 如果 actual 包含 expected，则 passed，score = 1
- 否则 failed，score = 0

这是早期回归测试用的确定性评分器，不代表最终质量评估策略。

## API

所有接口需要 `evaluation:manage` 权限。

### 创建评估用例

```http
POST /api/evaluations/cases
```

示例：

```json
{
  "name": "报销制度回答",
  "type": "agent_response",
  "input": "差旅报销需要多久内提交？",
  "expectedOutput": "30 天",
  "tags": ["finance", "rag"]
}
```

### 列出评估用例

```http
GET /api/evaluations/cases
```

### 运行评估

```http
POST /api/evaluations/cases/:caseId/runs
```

示例：

```json
{
  "actualOutput": "根据制度，差旅报销需要在 30 天内提交。"
}
```

### 通过 Agent Runtime 运行评估

```http
POST /api/agent/evaluations/cases/:caseId/run
```

行为：

- 读取 evaluation case 的 `input`。
- 调用 Agent Runtime 生成实际输出。
- 将 Agent answer 保存为 `actualOutput`。
- 使用 `string_contains` 对 `actualOutput` 和 `expectedOutput` 评分。
- 在 notes 中记录 `agentRequestId`、`agentStopReason`、duration 和 token usage。
- 写入 `evaluation.agent.run.started` / `completed` / `failed` trace。

### 列出评估运行

```http
GET /api/evaluations/runs
GET /api/evaluations/runs?caseId=...
```

## 租户隔离

Evaluation 使用认证上下文中的 `tenantId`。

调用方不能通过 body 指定 tenantId。

## 当前边界

已完成：

- EvaluationCase 类型
- EvaluationRun 类型
- InMemoryEvaluationStore
- 创建评估用例
- 列出评估用例
- 运行基础评估
- 通过 Agent Runtime 运行评估
- 列出评估运行
- Auth 权限接入
- 租户隔离

未完成：

- LLM Judge
- 多评分维度
- 数据集批量运行
- 评估报告
- 结果趋势统计
- CI 回归门禁

## 下一步

建议下一步实现批量运行 evaluation cases，并将失败样本结构化为 regression report。
3. 设计 Drizzle schema
4. 将当前 in-memory store 逐步替换为持久化实现
