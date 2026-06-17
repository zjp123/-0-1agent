# Web Console E2E 自动化测试

## 目标

Phase 15 为 Web Console 增加 Playwright E2E smoke 测试，覆盖企业级 Agent 平台的核心入口，作为本地自测和 CI/CD 发布前质量门禁。

## 技术栈

- `@playwright/test`
- Next.js App Router 测试服务器
- Chromium headless browser
- API route mocking

## 文件

- `apps/web/playwright.config.ts`
- `apps/web/e2e/console.smoke.spec.ts`
- `apps/web/package.json`
- `package.json`
- `.github/workflows/ci.yml`

## 测试策略

E2E 测试启动独立 Next.js dev server：

```bash
npx next dev --webpack -p 3101 --hostname 127.0.0.1
```

测试默认访问：

```text
http://127.0.0.1:3101
```

测试 API 默认指向：

```text
http://127.0.0.1:3999/api
```

当前 smoke 用例使用 Playwright `page.route()` mock API 响应，因此不依赖真实 API、PostgreSQL、Redis 或 Qdrant。这样可以在 CI 中快速验证 Web 页面、会话、权限裁剪、SSE 消费和核心交互是否回归。

Web smoke 串行执行，避免 Next.js dev server 在首次编译 / Fast Refresh 期间并发页面导航互相干扰。这里验证的是控制台关键路径稳定性，不作为浏览器并发压测。

## 覆盖范围

- Dashboard readiness：API、database、vector store 状态展示
- Login：service token 换取 Web Console session
- Agent Chat：SSE streaming 响应消费、消息渲染、执行 timeline
- Tools：工具列表加载、calculator 执行
- Knowledge / RAG：文档列表、检索结果
- Security / Auth Governance：roles、audit events、security anomalies
- Evaluation：evaluation cases、runs、评分状态
- Observability：trace events、timeline
- Workflow：workflow 列表、scheduler 状态

## 本地运行

首次运行需要安装 Chromium：

```bash
npx playwright install chromium
```

运行 Web E2E：

```bash
npm run test:e2e:web
```

本机 Next 原生 SWC 模块存在签名问题时，Web 构建脚本会自动使用 WASM SWC fallback。E2E 直接执行 `npm run test:e2e:web` 即可。

## CI/CD

CI 在 Web build 后执行：

```bash
npx playwright install --with-deps chromium
npm run test:e2e:web
```

E2E 通过后才继续执行 migration generation check、Docker build 和生产镜像 smoke。

## 验证结果

已完成本地验证：

```text
npm run test:e2e:web
9 passed
```

Phase 15 已完成，后续进入 Phase 16：Web 配置与密钥治理。
