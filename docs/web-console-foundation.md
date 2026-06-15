# Web Console Foundation

## 目标

建设企业级 Agent 平台 Web 控制台基础工程。该工程使用 Next.js，从零开始实现，不参考 `baseCode/`。

## 技术栈

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- Server Components / Client Components 分层
- Zod
- lucide-react
- react-markdown
- remark-gfm
- rehype-sanitize

## Workspace 脚本

根目录新增脚本：

```bash
npm run dev:web
npm run build:web
npm run start:web
npm run check:web
```

Web workspace 脚本：

```bash
npm run dev -w @enterprise-agent/web
npm run build -w @enterprise-agent/web
npm run start -w @enterprise-agent/web
npm run check -w @enterprise-agent/web
```

默认开发端口：

```text
http://127.0.0.1:3001
```

## 环境变量

Web 默认连接本地 API：

```text
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3000/api
```

示例文件：

```text
apps/web/.env.example
```

## 当前目录结构

```text
apps/web/
  src/
    app/
      globals.css
      layout.tsx
      page.tsx
    components/
      layout/
      markdown/
      ui/
    features/
      dashboard/
    lib/
      api/
      config.ts
```

## 已实现能力

- Next.js App Router 基础工程
- 企业控制台布局
  - 左侧导航
  - 顶部状态栏
  - 主内容区
- Dashboard 首页骨架
- API readiness client
- Zod 响应校验
- Markdown renderer 基础组件
  - GFM
  - HTML sanitization
  - 代码、表格、列表基础样式
- Web workspace 脚本接入

## 验证结果

类型检查：

```bash
PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH npm run check:web
```

结果：

```text
passed
```

## 当前构建限制

在当前 Codex macOS 环境中，`next build` 使用 Codex 自带 Node.js 加载第三方原生 `.node` 模块时会遇到 macOS code signing 限制。

已确认受影响模块：

- `@next/swc-darwin-arm64`
- `lightningcss-darwin-arm64`

典型错误：

```text
code signature ... not valid for use in process: mapping process and mapped file (non-platform) have different Team IDs
```

已做的缓解：

- 安装 `@next/swc-wasm-nodejs`
- `build:web` 使用 `next build --webpack`
- 显式设置 `turbopack.root`
- 显式安装 `lightningcss-darwin-arm64`
- `dev:web` 使用 `next dev --webpack`
- 当前本地开发关闭 Tailwind v4 PostCSS 插件，使用普通 CSS fallback，避免 Codex Node 加载 `lightningcss-darwin-arm64`

当前结论：

- `check:web` 已通过。
- `dev:web` 可在当前环境启动，访问 `http://localhost:3001`。
- `build:web` 需要在系统 Node.js、CI Linux 环境或容器环境中继续验证。
- 该限制属于当前 Codex/macOS Node 原生模块加载环境问题，不是 Web 业务代码类型错误。

## 下一步

继续 Phase 2：

- Dashboard 展示 API readiness。
- 展示 database、vectorStore 状态。
- 增加刷新、加载、错误、空状态。
- 启动 Web dev server 并用浏览器检查页面。
