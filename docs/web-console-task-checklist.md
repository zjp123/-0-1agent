# Web Console Task Checklist

## 目标

建设企业级 Agent 平台 Web 控制台，用于本地自测、生产运维、功能演示和后续企业部署管理。

当前 `apps/web` 为空目录，本阶段从零开始建设，不参考 `baseCode/`。

## 执行规则

- 每完成一个任务，在本文件中将对应条目从 `[ ]` 改为 `[x]`。
- 每完成一个重要功能，新增或更新对应 `docs/` 留痕文档。
- 前端默认连接本地 API：`http://127.0.0.1:3000/api`。
- Web 技术栈采用 Next.js App Router，用于建设企业级生产应用并沉淀 Next.js 实践。
- Web 启动命令完成后应提供本地访问地址。
- 每个阶段至少执行一次构建或类型检查。

## 技术栈决策

- Next.js App Router
- React
- TypeScript
- Tailwind CSS
- Server Components / Client Components 分层
- Route Handlers 或 Server Actions 作为后续 BFF 扩展点
- lucide-react 图标
- Recharts 图表
- Zod 用于 API 响应和表单数据校验
- Markdown 渲染：GitHub Flavored Markdown、代码高亮、表格、任务列表、安全过滤
- Streaming：首版支持 SSE 流式输出，用于 Agent Chat / LLM 调用体验

## Phase 1 - Web 基础工程

- [x] 创建 `apps/web` 前端工程。
- [x] 接入根 workspace 脚本：`dev:web`、`build:web`、`check:web`。
- [x] 配置 Next.js App Router、TypeScript、React 基础结构。
- [x] 配置 Tailwind CSS 和全局样式。
- [x] 配置企业控制台基础布局：侧边导航、顶部状态栏、主内容区。
- [x] 建立 API client，支持配置 `NEXT_PUBLIC_API_BASE_URL`。
- [x] 建立 Server Component 与 Client Component 的使用规范。
- [x] 建立 Markdown renderer 基础组件。
- [x] 新增 Web 工程留痕文档。

## Phase 2 - Dashboard / 系统健康

- [x] Dashboard 展示 API readiness。
- [x] 展示 database、vectorStore 依赖状态。
- [x] 展示本地 API 地址和环境信息。
- [x] 增加刷新按钮和加载、错误、空状态。
- [x] 新增 Dashboard 留痕文档。

## Phase 3 - API Docs / 能力总览

- [x] 拉取 `/docs` 或 `/docs/openapi.json`。
- [x] 展示 API 分组和核心能力。
- [x] 展示安全相关接口入口。
- [x] 新增 API Docs 页面留痕文档。

## Phase 4 - Agent Chat / Streaming / LLM Entry

- [x] 增加 Agent Chat 页面，作为平台 Web 调用大模型的主入口。
- [x] 增加任务输入和多轮消息列表。当前后续请求会携带已有 user/assistant history。
- [x] 调用 `/agent/run`。首版通过 `POST /api/agent/run/stream` 复用 Agent run 链路。
- [x] 增加首版 SSE streaming 接口规划和 API 对接，优先实现 `POST /api/agent/run/stream`。
- [x] Web 支持消费 SSE stream 并增量渲染消息。
- [x] 流式消息支持 Markdown 渲染。
- [x] 展示 agent 执行结果、步骤、工具调用摘要。
- [x] 展示 RAG 引用、工具调用事件和最终答案。当前展示 context sources 和 model/tool timeline，后续可细化引用卡片。
- [x] 支持取消生成、失败重试和错误状态。
- [x] 支持本地 API key 或 service token 配置。
- [x] 新增 Agent Chat / Streaming 留痕文档。

## Phase 5 - Tools

- [x] 展示 `/tools` 工具列表。
- [x] 展示工具 schema、说明和调用入口。
- [x] 支持 calculator/current_time 的简单调用测试。
- [x] 新增 Tools 页面留痕文档。

## Phase 6 - Knowledge / RAG

- [x] 展示知识库文档列表。
- [x] 支持创建或导入知识文档。
- [x] 支持触发索引或重建索引。
- [x] 支持检索测试。
- [x] 展示 indexing job 状态。
- [x] 新增 Knowledge/RAG 页面留痕文档。

## Phase 7 - Workflow

- [x] 展示 workflow 列表。
- [x] 支持创建 workflow 草稿。
- [x] 支持查看 workflow steps。
- [x] 支持运行 workflow。
- [x] 展示 schedule 相关状态。
- [x] 新增 Workflow 页面留痕文档。

## Phase 8 - Security / Auth Governance

- [x] 展示 roles 列表。
- [x] 支持创建 role，并填写 reason/comment。
- [x] 展示 service tokens 列表。
- [x] 展示 audit events。
- [x] 展示 security anomaly events。
- [x] 支持 acknowledge anomaly。
- [x] 对 break-glass 操作显示强提醒。
- [x] 新增 Security 页面留痕文档。

## Phase 9 - Evaluation

- [x] 展示 evaluation cases。
- [x] 支持创建 evaluation case。
- [x] 支持运行 evaluation。
- [x] 展示 evaluation runs 和评分结果。
- [x] 新增 Evaluation 页面留痕文档。

## Phase 10 - Observability

- [x] 展示 trace events。
- [x] 展示关键运行指标入口。
- [x] 展示最近任务、工具调用、索引事件的时间线。
- [x] 新增 Observability 页面留痕文档。

## Phase 11 - 本地联调与自测

- [x] 启动 API、infra、Web 三件套。
- [x] 完成 Dashboard 联调。
- [x] 完成 Security 持久化联调。
- [x] 完成 Tools 调用联调。
- [x] 完成至少一次 build/check。当前 `check:web`、API check、`build:web` 均已通过；`build:web` 使用 `--webpack` 与 WASM SWC 规避本机原生模块签名问题。
- [x] 新增 Web 本地自测留痕文档。

## Phase 12 - 生产化增强

- [x] 增加统一错误边界。
- [x] 增加统一 toast/notification。
- [x] 增加请求超时与重试策略。
- [x] 增加 streaming 断线处理和超时保护。
- [x] 增加前端权限视图控制。
- [x] 增加环境配置说明。
- [x] 增加部署说明。
- [x] 新增 Web 生产化增强留痕文档。

## 当前优先级

首批实现顺序：

1. Phase 1 - Web 基础工程
2. Phase 2 - Dashboard / 系统健康
3. Phase 4 - Agent Chat / Streaming / LLM Entry
4. Phase 5 - Tools
5. Phase 8 - Security / Auth Governance

原因：

- 先让 Web 能启动和访问。
- 先验证本地 API、数据库和基础设施状态。
- 首版就要具备平台 Web 入口和大模型流式调用体验。
- 再覆盖最容易自测的 tools。
- 最后接入刚完成的企业级安全治理能力。
