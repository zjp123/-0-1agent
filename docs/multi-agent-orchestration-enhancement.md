# Multi-agent Orchestration Enhancement

## 目标

本步骤增加多智能体编排基础能力，把单 Agent Runtime 升级为可由多个角色协作完成任务的生产级骨架。

核心目标：

- agent role / participant registry
- coordinator / worker / reviewer 编排模型
- 多智能体任务分解与交接记录
- 多智能体运行 trace
- 编排失败记录与可排查状态

## 新增文件

```text
apps/api/src/orchestration/
  orchestration.module.ts
  orchestration.controller.ts
  orchestration.service.ts
  orchestration.types.ts
  dto/create-participant.dto.ts
  dto/run-orchestration.dto.ts

apps/api/drizzle/0011_lovely_karnak.sql
apps/api/drizzle/meta/0011_snapshot.json
```

## 修改文件

```text
apps/api/src/app.module.ts
apps/api/src/db/schema.ts
apps/api/src/observability/observability.types.ts
apps/api/src/observability/dto/list-traces.dto.ts
apps/api/drizzle/meta/_journal.json
```

## 数据库表

### orchestration_participants

用于保存租户内可参与编排的智能体角色。

字段：

- `tenant_id`
- `name`
- `role`
- `system_prompt`
- `model`
- `enabled`
- `max_steps`
- `max_duration_ms`
- `metadata`
- `created_at`
- `updated_at`

支持角色：

- `coordinator`
- `worker`
- `reviewer`
- `specialist`

### orchestration_runs

用于保存一次多智能体编排运行。

字段：

- `tenant_id`
- `created_by`
- `request_id`
- `objective`
- `strategy`
- `status`
- `participant_ids`
- `final_answer`
- `error`
- `metadata`
- `started_at`
- `completed_at`
- `created_at`
- `updated_at`

当前策略：

```text
sequential_handoff
```

### orchestration_handoffs

用于保存参与者之间的任务交接记录。

字段：

- `tenant_id`
- `run_id`
- `from_participant_id`
- `to_participant_id`
- `step_order`
- `status`
- `input`
- `output`
- `error`
- `agent_request_id`
- `usage`
- `started_at`
- `completed_at`
- `created_at`
- `updated_at`

## 编排模型

当前实现为顺序交接：

```text
participant[0] -> participant[1] -> participant[n]
```

每个 participant 会调用现有 `AgentRuntimeService.run()`，复用已有能力：

- Model Gateway
- Memory / Context
- RAG retrieval
- Tool calling
- max steps
- max duration
- trace events
- quota 外层治理入口

每次交接会构造包含以下内容的输入：

- 原始 objective
- 当前 participant role
- 当前交接序号
- 上一个 participant 的输出

## API

所有接口前缀：

```text
/api/orchestration
```

所有接口要求：

```ts
@RequirePermissions("workflow:manage")
```

### Status

```http
GET /api/orchestration/status
```

### Participants

```http
GET /api/orchestration/participants
POST /api/orchestration/participants
```

创建 participant：

```json
{
  "name": "Review Agent",
  "role": "reviewer",
  "systemPrompt": "Review the previous result for correctness, risk, and completeness.",
  "model": "gpt-4.1",
  "maxSteps": 4,
  "maxDurationMs": 60000,
  "metadata": {
    "team": "platform"
  }
}
```

### Runs

```http
GET /api/orchestration/runs
GET /api/orchestration/runs/:runId
POST /api/orchestration/runs
```

启动多智能体编排：

```json
{
  "requestId": "00000000-0000-4000-8000-000000000001",
  "objective": "Analyze the incident and propose a production remediation plan.",
  "participantIds": [
    "coordinator-participant-id",
    "worker-participant-id",
    "reviewer-participant-id"
  ],
  "metadata": {
    "incident": "INC-1001"
  }
}
```

## Trace Events

本步骤新增 trace 类型：

- `orchestration.run.started`
- `orchestration.handoff.started`
- `orchestration.handoff.completed`
- `orchestration.handoff.failed`
- `orchestration.run.completed`

每个 handoff 还会生成独立的 `agentRequestId`，用于关联内部单 Agent Runtime 的 trace。

## 当前边界

已完成：

- participant registry
- coordinator / worker / reviewer / specialist role model
- persistent orchestration runs
- persistent handoff history
- sequential handoff strategy
- AgentRuntime delegation
- handoff input / output / usage / error recording
- orchestration trace events
- Drizzle migration

未完成：

- DAG / parallel orchestration
- async background execution
- pause / resume / cancel API
- workflow step 自动绑定
- per-participant quota attribution
- approval policy integration for orchestration runs
- retry / timeout recovery worker
- participant update / disable API

## 验证

本步骤完成后需要执行：

```bash
npm run db:generate
npm run check
npm run build
```

## 下一步

建议下一步实现 `Workflow Production Scheduling Enhancement`：

1. workflow schedule store
2. cron / interval scheduling model
3. workflow run history
4. scheduler lease / concurrency control
5. failed scheduled run recovery
