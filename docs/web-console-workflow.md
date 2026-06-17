# Web Console Workflow

## 目标

为企业级 Agent 平台 Web 控制台增加 Workflow 工作台，用于本地自测工作流草稿、步骤状态、Agent 单步执行、调度配置和 schedule run 状态。

本阶段覆盖 Phase 7：

- 展示 workflow 列表。
- 支持创建 workflow 草稿。
- 支持查看 workflow steps。
- 支持运行 workflow。
- 展示 schedule 相关状态。
- 新增 Workflow 页面留痕文档。

首版将“运行 workflow”拆成两类能力：

- 执行选中的 workflow step，后端会调用 Agent Runtime 并自动回写 step 状态。
- 创建 workflow schedule。
- 手动 trigger schedule，生成 schedule run。
- 更新 workflow step 状态，推进执行状态。

## 页面入口

- Web 页面：`http://localhost:3001/workflows`
- 侧边栏入口：`Workflows`

## 前端实现

新增文件：

- `apps/web/src/app/workflows/page.tsx`
- `apps/web/src/features/workflows/workflow-workbench.tsx`

更新文件：

- `apps/web/src/lib/api/client.ts`
- `apps/web/src/components/layout/app-shell.tsx`
- `apps/web/src/app/globals.css`
- `docs/web-console-task-checklist.md`

## API 对接

页面对接以下后端接口：

- `GET /api/workflows`
- `POST /api/workflows`
- `PATCH /api/workflows/{workflowId}/steps/{stepId}`
- `POST /api/agent/workflows/{workflowId}/steps/{stepId}/execute`
- `GET /api/workflows/scheduler/status`
- `GET /api/workflows/schedules`
- `POST /api/workflows/schedules`
- `GET /api/workflows/schedule-runs`
- `POST /api/workflows/schedules/{scheduleId}/trigger`

所有接口均为受保护接口，页面支持输入：

- `x-api-key`
- `x-service-token`

本地推荐使用 `.env` 中配置的 admin service token。

## 工作台能力

- 手动刷新 workflow/schedule 状态，避免无凭据时自动触发 401。
- 创建 workflow 草稿，支持多 step 输入。
- 查看 workflow list、goal、status。
- 查看 selected workflow steps。
- 更新 step status、output、error。
- 执行选中 step：将 step 转换为 Agent task，调用 Agent Runtime，按结果自动写回 `completed` / `failed`、`output` 和 `error`。
- 创建 interval/cron schedule。
- 手动 trigger schedule，生成 schedule run。
- 查看 schedule list、runs 和 scheduler capabilities。

## 验证方式

```bash
PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH npm run check:web
PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH npm run check -w @enterprise-agent/api
curl --max-time 10 -fsS http://127.0.0.1:3000/api/workflows -H 'x-service-token: local-admin-service-token'
curl --max-time 10 -fsS http://127.0.0.1:3000/api/workflows/scheduler/status -H 'x-service-token: local-admin-service-token'
curl --max-time 10 -fsS http://localhost:3001/workflows
```

## 后续增强

- 增加执行全部 pending steps。
- 增加 schedule run complete/failed/cancel 操作。
- 增加 workflow 详情页和事件时间线。
- 增加 step 拖拽排序和依赖关系配置。
- 增加审批节点、人机协同和执行日志视图。

## Workflow Run Executor 记录

记录日期：2026-06-17

新增后端：

```text
apps/api/src/agent-runtime/workflow-run-executor.service.ts
apps/api/src/agent-runtime/dto/execute-workflow-step.dto.ts
```

新增接口：

```text
POST /api/agent/workflows/{workflowId}/steps/{stepId}/execute
```

执行流程：

```text
选中 workflow step
  -> step 状态更新为 running
  -> 根据 workflow goal + step title/description 生成 Agent task
  -> 调用 Agent Runtime
  -> stopReason=final_answer 时 step completed
  -> 其他 stopReason 时 step failed，并记录 error
  -> 写入 workflow.step.execution.* trace
  -> Web Workflows 刷新当前 step output/error/status
```

验证：

```text
API check passed
Web check passed
```
