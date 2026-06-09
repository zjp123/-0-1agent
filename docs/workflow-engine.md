# Workflow Engine

## 目标

Workflow Engine 负责承载复杂任务的计划、状态和执行历史。它是后续 Plan/Execute、可恢复任务、人工确认节点、多步任务循环和多智能体编排的基础。

当前阶段先实现 in-memory workflow store 和基础 API，稳定数据模型和状态流转。

## 当前实现

路径：

```text
apps/api/src/workflow/
  workflow.types.ts
  workflow.service.ts
  workflow.controller.ts
  in-memory-workflow.store.ts
  dto/
    create-workflow.dto.ts
    update-workflow-step.dto.ts
```

## 核心模型

Workflow：

```ts
type Workflow = {
  id: string;
  tenantId: string;
  createdBy: string;
  title: string;
  goal: string;
  status: WorkflowStatusValue;
  steps: WorkflowStep[];
  events: WorkflowEvent[];
  createdAt: string;
  updatedAt: string;
};
```

Step：

```ts
type WorkflowStep = {
  id: string;
  title: string;
  description?: string;
  status: WorkflowStepStatus;
  order: number;
  output?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
};
```

## 状态

Workflow 状态：

- `draft`
- `running`
- `completed`
- `failed`
- `paused`
- `cancelled`

Step 状态：

- `pending`
- `running`
- `completed`
- `failed`
- `skipped`
- `waiting_for_approval`

## 状态推导

当前 workflow status 根据 steps 自动推导：

- 任一步骤 `failed` -> workflow `failed`
- 所有步骤 `completed` 或 `skipped` -> workflow `completed`
- 任一步骤 `running` -> workflow `running`
- 任一步骤 `waiting_for_approval` -> workflow `paused`
- 其他情况 -> workflow `draft`

## API

所有接口需要 `workflow:manage` 权限。

### 创建 workflow

```http
POST /api/workflows
```

示例：

```json
{
  "title": "处理客户退款请求",
  "goal": "核实订单、判断退款资格并生成处理建议",
  "steps": [
    {
      "title": "读取订单信息",
      "description": "根据订单号查询订单和支付状态"
    },
    {
      "title": "核对退款规则"
    },
    {
      "title": "生成处理建议"
    }
  ]
}
```

### 列表

```http
GET /api/workflows
```

### 详情

```http
GET /api/workflows/:workflowId
```

### 更新 step

```http
PATCH /api/workflows/:workflowId/steps/:stepId
```

示例：

```json
{
  "status": "completed",
  "output": "订单已支付，仍在退款窗口内。"
}
```

## 租户隔离

Workflow 使用认证上下文中的 `tenantId`，不从 body 接收 tenantId。

这与 Knowledge 模块一致，避免调用方伪造租户。

## 当前边界

已完成：

- Workflow 类型
- Step 类型
- Event 类型
- InMemoryWorkflowStore
- 创建 workflow
- 查询 workflow
- 列表 workflow
- 更新 step 状态
- workflow status 自动推导
- workflow event history
- Auth 权限接入

未完成：

- 持久化数据库
- Agent 自动生成 plan
- Agent 执行 workflow step
- step 依赖关系
- 人工确认 API
- 暂停/恢复 API
- 取消 API
- workflow trace 联动

## 下一步

建议下一步实现 `Evaluation` 基础版：

1. 定义 evaluation case 类型
2. 定义 run result 评分结构
3. 提供 in-memory eval case store
4. 支持运行基础回归评估
5. 为后续模型/工具/RAG 质量回归做准备
