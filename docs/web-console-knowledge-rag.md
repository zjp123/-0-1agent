# Web Console Knowledge / RAG

## 目标

为企业级 Agent 平台 Web 控制台增加 Knowledge / RAG 工作台，用于本地自测知识库导入、检索、索引任务和 worker 运行状态。

本阶段覆盖 Phase 6：

- 展示知识库文档列表。
- 支持创建或导入知识文档。
- 支持触发索引或重建索引。
- 支持检索测试。
- 展示 indexing job 状态。
- 展示 indexing worker 状态和 alerts。

## 页面入口

- Web 页面：`http://localhost:3001/knowledge`
- 侧边栏入口：`Knowledge`

## 前端实现

新增文件：

- `apps/web/src/app/knowledge/page.tsx`
- `apps/web/src/features/knowledge/knowledge-workbench.tsx`

更新文件：

- `apps/web/src/lib/api/client.ts`
- `apps/web/src/components/layout/app-shell.tsx`
- `apps/web/src/app/globals.css`
- `docs/web-console-task-checklist.md`

## API 对接

页面对接以下后端接口：

- `GET /api/knowledge/documents`
- `POST /api/knowledge/ingest`
- `POST /api/knowledge/retrieve`
- `POST /api/knowledge/reindex`
- `GET /api/knowledge/reindex/jobs`
- `GET /api/knowledge/reindex/worker/status`
- `GET /api/knowledge/reindex/worker/alerts`

所有接口均为受保护接口，页面支持输入：

- `x-api-key`
- `x-service-token`

本地推荐使用 `.env` 中配置的 admin service token。

## 工作台能力

- 手动刷新 Knowledge/RAG 状态，避免无凭据时自动触发 401。
- 导入文档时支持 `title`、`content`、`sourceType`、`sourceUri`、`tags`。
- 检索测试支持 `query`、`limit`、`tags` filter。
- 检索结果展示 matched terms、score、retrieval mode、chunk content 和 hybrid scores。
- 文档列表展示 title、source、tags、createdAt。
- 索引任务展示 status、progress、attempts、updatedAt。
- worker 状态展示 queue depth、concurrency、alerts。

## 验证方式

```bash
PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH npm run check:web
PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH npm run check -w @enterprise-agent/api
curl --max-time 10 -fsS http://127.0.0.1:3000/api/knowledge/documents -H 'x-service-token: local-admin-service-token'
curl --max-time 10 -fsS http://127.0.0.1:3000/api/knowledge/reindex/jobs -H 'x-service-token: local-admin-service-token'
curl --max-time 10 -fsS http://localhost:3001/knowledge
```

## 后续增强

- 增加文档详情和 chunk 展开视图。
- 增加文档删除、更新和标签管理。
- 增加 indexing job cancel/replay 操作。
- 增加 dead-letter 列表和 replay/purge 操作。
- 增加检索结果引用到 Agent Chat 的跳转。
