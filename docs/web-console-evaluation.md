# Web Console Evaluation

## 目标

为企业级 Agent 平台 Web 控制台增加 Evaluation 工作台，用于本地自测评估用例、运行评估、查看评分结果和回归测试历史。

本阶段覆盖 Phase 9：

- 展示 evaluation cases。
- 支持创建 evaluation case。
- 支持运行 evaluation。
- 展示 evaluation runs 和评分结果。
- 新增 Evaluation 页面留痕文档。

## 页面入口

- Web 页面：`http://localhost:3001/evaluations`
- 侧边栏入口：`Evaluations`

## 前端实现

新增文件：

- `apps/web/src/app/evaluations/page.tsx`
- `apps/web/src/features/evaluations/evaluation-workbench.tsx`

更新文件：

- `apps/web/src/lib/api/client.ts`
- `apps/web/src/components/layout/app-shell.tsx`
- `apps/web/src/app/globals.css`
- `docs/web-console-task-checklist.md`

## API 对接

页面对接以下后端接口：

- `GET /api/evaluations/cases`
- `POST /api/evaluations/cases`
- `POST /api/evaluations/cases/{caseId}/runs`
- `GET /api/evaluations/runs`

所有接口均为受保护接口，页面支持输入：

- `x-api-key`
- `x-service-token`

本地推荐使用 `.env` 中配置的 admin service token。

## 工作台能力

- 手动刷新 evaluation data，避免无凭据时自动触发 401。
- 创建 evaluation case，支持 `agent_response`、`rag_retrieval`、`tool_execution`。
- 输入 expected output 和 tags。
- 选择 case 后运行 evaluation。
- 选择 case 后可直接运行 Agent evaluation，由 Agent Runtime 生成 actual output 后自动评分。
- 支持对当前 loaded cases 执行 Agent batch evaluation。
- 展示 deterministic `string_contains` evaluator 的 status、score、notes。
- 展示 pass rate、case 数量、run 数量、passed run 数量。

## 验证方式

```bash
PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH npm run check:web
PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH npm run check -w @enterprise-agent/api
curl --max-time 10 -fsS http://127.0.0.1:3000/api/evaluations/cases -H 'x-service-token: local-admin-service-token'
curl --max-time 10 -fsS http://127.0.0.1:3000/api/evaluations/runs -H 'x-service-token: local-admin-service-token'
curl --max-time 10 -fsS http://localhost:3001/evaluations
```

## 后续增强

- 增加从 Agent Chat 结果一键创建 eval run。
- 增加按 case/type/tag 筛选 runs。
- 增加 evaluator 扩展：LLM judge、exact match、JSON schema、tool output assertions。
- 增加趋势图和通过率统计。
- 增加 CI regression suite 入口。

## Agent Evaluation 记录

记录日期：2026-06-17

新增后端：

```text
apps/api/src/agent-runtime/evaluation-agent-runner.service.ts
apps/api/src/agent-runtime/dto/run-agent-evaluation.dto.ts
```

新增接口：

```text
POST /api/agent/evaluations/cases/{caseId}/run
POST /api/agent/evaluations/run-batch
```

执行流程：

```text
选择 evaluation case
  -> 用 case.input 构造 Agent task
  -> 调用 Agent Runtime
  -> 将 Agent answer 作为 actualOutput
  -> 调用 EvaluationService 评分并保存 run
  -> notes 记录 agentRequestId / stopReason / duration / token usage
  -> 写入 evaluation.agent.run.* trace
  -> Web 展示 run status、score 和 actual output
```

批量执行：

```text
点击 Run Agent Batch
  -> Web 传入当前 loaded cases 的 caseIds
  -> 后端逐个调用 Agent Runtime
  -> 每个 case 保存 evaluation run
  -> 返回 total / passed / failed
  -> Web 刷新 runs
```

验证：

```text
API check passed
Web check passed
```
