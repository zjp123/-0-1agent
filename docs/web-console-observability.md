# Web Console Observability

## 目标

为企业级 Agent 平台 Web 控制台增加 Observability 页面，用于本地自测 trace events、关键运行指标入口和最近任务/工具/RAG/索引/Workflow 时间线。

本阶段覆盖 Phase 10：

- 展示 trace events。
- 展示关键运行指标入口。
- 展示最近任务、工具调用、索引事件的时间线。
- 新增 Observability 页面留痕文档。

## 页面入口

- Web 页面：`http://localhost:3001/observability`
- 侧边栏入口：`Observability`

## 前端实现

新增文件：

- `apps/web/src/app/observability/page.tsx`
- `apps/web/src/features/observability/observability-dashboard.tsx`

更新文件：

- `apps/web/src/lib/api/client.ts`
- `apps/web/src/components/layout/app-shell.tsx`
- `apps/web/src/app/globals.css`
- `docs/web-console-task-checklist.md`

## API 对接

页面对接以下后端接口：

- `GET /api/observability/traces`

支持查询参数：

- `requestId`
- `type`
- `limit`

接口为受保护接口，页面支持输入：

- `x-api-key`
- `x-service-token`

本地推荐使用 `.env` 中配置的 admin service token。

## 工作台能力

- 手动刷新 trace events，避免无凭据时自动触发 401。
- 按 requestId、event type、limit 过滤 trace events。
- 展示 trace event 数量、request 数量、失败数量、平均 duration。
- 派生展示 agent/tool/rag/model/workflow event mix。
- 展示最近时间线。
- 展示 selected trace event 的原始 attributes。

## 说明

当前后端尚未提供独立 metrics endpoint，因此页面的关键运行指标来自 trace events 的派生统计。

## 验证方式

```bash
PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH npm run check:web
PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH npm run check -w @enterprise-agent/api
curl --max-time 10 -fsS http://127.0.0.1:3000/api/observability/traces -H 'x-service-token: local-admin-service-token'
curl --max-time 10 -fsS http://localhost:3001/observability
```

## 后续增强

- 增加 metrics endpoint 后接入真实指标。
- 增加图表：event type trend、duration p95、failure rate。
- 增加按 userId、tenantId、时间范围过滤。
- 增加 trace detail drawer。
- 增加任务 replay 和 incident annotation 入口。
