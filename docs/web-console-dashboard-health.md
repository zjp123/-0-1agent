# Web Console Dashboard Health

## 目标

完成 Web 控制台 Dashboard 系统健康页，用于本地自测和后续生产运维入口。

## 已实现能力

- Dashboard 展示 API readiness。
- 展示 API、database、vectorStore 状态。
- 展示本地 API 地址。
- 展示环境、服务名、uptime、服务端 timestamp。
- 增加手动刷新按钮。
- 增加加载状态。
- 增加错误状态。
- 增加 dependency details 表格。
- 保留 Markdown renderer 预览，用于后续 Agent streaming 消息渲染。
- Web dev server 可在本地启动并返回 Dashboard 页面。

## 关键文件

```text
apps/web/src/features/dashboard/dashboard-overview.tsx
apps/web/src/features/dashboard/dashboard-health-panel.tsx
apps/web/src/lib/api/client.ts
```

## 设计说明

Dashboard 使用 Next.js App Router 分层：

- `dashboard-overview.tsx`：Server Component shell，负责页面结构。
- `dashboard-health-panel.tsx`：Client Component，负责刷新、加载、错误和浏览器侧状态。

API client 使用 `fetch` 和 `zod` 校验 readiness 响应，默认 API 地址来自：

```text
NEXT_PUBLIC_API_BASE_URL
```

默认值：

```text
http://127.0.0.1:3000/api
```

## 验证

类型检查：

```bash
PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH npm run check:web
```

结果：

```text
passed
```

本地 Web 启动：

```bash
PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH \
NEXT_TEST_WASM_DIR=/Users/bjsttlp406/others/-0-1agent/node_modules/@next/swc-wasm-nodejs \
npm run dev:web
```

访问地址：

```text
http://localhost:3001
```

HTTP 验证：

```text
GET / -> 200 OK
```

API readiness 验证：

```text
GET http://127.0.0.1:3000/api/health/ready -> 200 OK
```

注意：

- API CORS 当前允许 `http://localhost:3001`。
- 因此浏览器测试建议使用 `http://localhost:3001`，不要使用 `http://127.0.0.1:3001`，除非后续将该 origin 加入 `ALLOWED_ORIGINS`。
- 当前 Codex macOS Node 环境无法加载部分第三方原生 `.node` 模块，Web 已使用 webpack dev/build 脚本，并暂时关闭 Tailwind v4 PostCSS 原生编译链，改用普通 CSS fallback 保证本地页面可运行。

## 后续

下一阶段进入 Agent Chat / Streaming / LLM Entry：

- 后端新增 `POST /api/agent/run/stream`。
- Web 新增 Agent Chat 页面。
- Web 消费 SSE 并增量渲染 Markdown。
