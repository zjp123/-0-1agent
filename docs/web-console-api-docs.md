# Web Console API Docs

## 目标

为企业级 Agent 平台 Web 控制台增加 API Docs / 能力总览页面，用于快速理解当前后端已经暴露的能力边界、接口分组、权限要求和 OpenAPI 合约状态。

本阶段覆盖 Phase 3：

- 拉取 `/api/docs` 文档摘要。
- 拉取 `/api/docs/openapi.json` OpenAPI 合约。
- 展示 API 分组和核心能力。
- 展示安全相关接口入口。
- 展示每个 operation 的 HTTP method、path、summary、operationId 和 required permission。

## 页面入口

- Web 页面：`http://localhost:3001/api-docs`
- 侧边栏入口：`API Docs`

## 前端实现

新增文件：

- `apps/web/src/app/api-docs/page.tsx`
- `apps/web/src/features/api-docs/api-docs-explorer.tsx`

更新文件：

- `apps/web/src/lib/api/client.ts`
- `apps/web/src/components/layout/app-shell.tsx`
- `apps/web/src/app/globals.css`
- `docs/web-console-task-checklist.md`

## API 对接

页面对接以下后端接口：

- `GET /api/docs`
- `GET /api/docs/openapi.json`

该页面是只读能力地图，不需要输入 API key 或 service token。

## 展示内容

- API title/version。
- capability group 数量。
- operation 总数。
- RBAC-gated operation 数量。
- OpenAPI schema 数量。
- 按 tag 分组的 operation 表。
- Security/Governance/Approvals/Secrets 等敏感接口分组快捷视图。
- OpenAPI 合约摘要预览。

## 验证方式

```bash
PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH npm run check:web
PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH npm run check -w @enterprise-agent/api
curl --max-time 10 -fsS http://127.0.0.1:3000/api/docs
curl --max-time 10 -fsS http://127.0.0.1:3000/api/docs/openapi.json
curl --max-time 10 -fsS http://localhost:3001/api-docs
```

## 后续增强

- 增加 operation 搜索。
- 增加 permission 过滤。
- 增加 request/response schema 展开视图。
- 增加 OpenAPI 下载按钮。
- 增加接口到具体控制台页面的深链跳转。
