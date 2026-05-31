# 企业级 Agent 升级计划

> 从学习项目 → 企业生产级标准
>
> 每完成一个任务，将 `[ ]` 改为 `[x]`，中断后从未打勾的地方继续。

---

## 最终技术栈

| 层级 | 选型 |
|------|------|
| 语言 | TypeScript |
| HTTP 框架 | Fastify |
| 前端 | Next.js 14 (App Router) |
| 主数据库 | PostgreSQL 16 |
| 向量数据库 | Qdrant |
| 缓存 / 限流 | Redis 7 |
| ORM | Drizzle ORM |
| 认证 | JWT + Refresh Token |
| 日志 | Pino |
| 验证 | Zod |
| 计算器 | mathjs（替换 eval） |
| Embedding | DeepSeek Embedding API |
| 搜索工具 | Brave Search API |
| 天气工具 | OpenWeatherMap API |
| 容器化 | Docker + docker-compose |
| CI/CD | GitHub Actions |
| 监控 | OpenTelemetry + Pino |

---

## 目标架构

```
浏览器 (Next.js)
  ↓ HTTPS / WebSocket
Nginx (反向代理 + SSL + 限流)
  ↓
Fastify 服务器
  ├── Auth 模块 (JWT)
  ├── Chat 模块 (SSE 流式)
  └── 知识库模块 (RAG)
        ↓
    Agent 核心引擎
    ├── ReAct Loop（多步推理）
    ├── Tool Registry（工具注册表）
    └── Memory Manager（分层记忆）
        ↓
┌──────────────────────────┐
│  PostgreSQL  │  Qdrant   │
│  (业务数据)   │  (向量)   │
│         Redis            │
│         (缓存/限流)       │
└──────────────────────────┘
```

---

## Phase 1 — 安全加固（立即）

> 目标：消除所有高危漏洞，不依赖任何外部服务，改动成本最小。

### 1.1 消除 eval() 安全漏洞

- [ ] 安装 mathjs：`npm install mathjs`
- [ ] 替换 `agent-server.js` 中的 `eval(expression)` 为 `mathjs.evaluate(expression)`
- [ ] 删除原有的正则安全过滤（mathjs 自带沙箱）
- [ ] 测试：`128 * 256`、`sqrt(16)`、`sin(PI/2)` 均正常

### 1.2 添加请求验证

- [ ] 安装：`npm install zod`
- [ ] 对 `POST /api/chat` 的 body 做 Zod schema 验证（message 必填、sessionId 格式校验）
- [ ] 对所有 DELETE/GET 路由参数做校验
- [ ] 验证失败返回 400 + 明确错误信息

### 1.3 添加安全响应头

- [ ] 安装：`npm install helmet`
- [ ] 在 Express 中加入 `app.use(helmet())`
- [ ] 配置 CORS：`npm install cors`，只允许指定域名

### 1.4 添加速率限制

- [ ] 安装：`npm install express-rate-limit`
- [ ] `/api/chat` 接口：每 IP 每分钟最多 20 次
- [ ] 其他 API：每 IP 每分钟最多 100 次
- [ ] 超限返回 429 + Retry-After 头

### 1.5 添加请求超时

- [ ] LLM 调用设置 30 秒超时
- [ ] 工具调用（webSearch 等）设置 10 秒超时
- [ ] 超时后向客户端发送友好错误消息

**Phase 1 完成标志**：运行 `npm run web`，用 curl 测试安全头、限流、非法输入均正常处理。

---

## Phase 2 — 数据层升级

> 目标：用 PostgreSQL + Qdrant + Redis 替换 JSON 文件存储。

### 2.1 环境准备

- [ ] 创建 `docker-compose.yml`：
  ```yaml
  services:
    postgres:
      image: postgres:16-alpine
      environment:
        POSTGRES_DB: agent_db
        POSTGRES_USER: agent
        POSTGRES_PASSWORD: ${DB_PASSWORD}
      ports:
        - "5432:5432"
      volumes:
        - pg_data:/var/lib/postgresql/data

    qdrant:
      image: qdrant/qdrant:latest
      ports:
        - "6333:6333"
      volumes:
        - qdrant_data:/qdrant/storage

    redis:
      image: redis:7-alpine
      ports:
        - "6379:6379"
      command: redis-server --appendonly yes
      volumes:
        - redis_data:/data

  volumes:
    pg_data:
    qdrant_data:
    redis_data:
  ```
- [ ] `docker-compose up -d` 启动三个服务
- [ ] 验证：`psql -h localhost -U agent -d agent_db` 能连接

### 2.2 PostgreSQL 建表

- [ ] 安装：`npm install pg drizzle-orm` + `npm install -D drizzle-kit`
- [ ] 创建 `src/db/schema.js`，定义以下表：

  ```
  users         (id, name, role, created_at)
  sessions      (id, user_id, title, created_at, updated_at)
  messages      (id, session_id, role, content, tool_calls, created_at)
  knowledge     (id, user_id, title, content, tags, source_file, created_at)
  ```

- [ ] 执行迁移：`drizzle-kit push`
- [ ] 数据迁移：写脚本把 `.agent-memory/` 下的 JSON 数据导入 PostgreSQL

### 2.3 Redis 集成

- [ ] 安装：`npm install ioredis`
- [ ] 用 Redis 替换内存中的速率限制计数器
- [ ] 用 Redis 缓存活跃会话的最近 20 条消息（TTL 30分钟）
- [ ] 测试：重启服务后缓存正常恢复

### 2.4 切换 API 路由到数据库

- [ ] `POST /api/chat` 从 PostgreSQL 读写消息，而不是 JSON 文件
- [ ] `GET /api/sessions` 从 PostgreSQL 查询
- [ ] `DELETE /api/sessions/:id` 删除 PostgreSQL 记录
- [ ] 删除所有 `fs.readFileSync` / `fs.writeFileSync` 调用
- [ ] 测试：完整的聊天流程、历史记录加载、删除均正常

**Phase 2 完成标志**：`.agent-memory/` 目录可以删除，系统完全运行在数据库上。

---

## Phase 3 — Agent 核心重构

> 目标：修复双倍 LLM 调用问题，实现真正的 ReAct 循环。

### 3.1 修复双倍调用

**当前问题**：先发非流式请求判断是否用工具，再发流式请求获取回答，每次对话调用 LLM 2-3 次。

- [ ] 重构为**单次流式请求**，在流中处理工具调用
- [ ] 使用 DeepSeek 的流式 tool_calls 支持
- [ ] 验证：调用 LLM 次数从 2-3 次降为 1-2 次（工具调用必须第 2 轮）

### 3.2 实现标准 ReAct 循环

- [ ] 创建 `src/agent/loop.js`，实现以下逻辑：
  ```
  while (轮次 < MAX_STEPS):
    response = LLM(messages + tools)
    if response.tool_calls:
      results = 并行执行所有工具()
      messages += [assistant_msg, ...tool_results]
      continue
    else:
      return response.content  // 最终回答
  ```
- [ ] 支持最多 **10 轮**工具调用（防止死循环）
- [ ] 工具调用失败时，把错误信息作为 tool result 继续，让 LLM 自己决定下一步
- [ ] 多个工具调用时**并行执行**（`Promise.all`），而不是顺序等待

### 3.3 工具注册表模块化

- [ ] 创建 `src/agent/tools/` 目录
- [ ] 每个工具独立一个文件（`time.js`、`weather.js`、`calculator.js` 等）
- [ ] 每个工具文件导出 `{ definition, execute }` 两个对象
- [ ] 创建 `src/agent/tools/registry.js` 统一注册和调用
- [ ] 新增工具只需新建文件 + 注册，不改其他代码

### 3.4 接入真实天气 API

- [ ] 注册 OpenWeatherMap（免费额度够用）
- [ ] 替换模拟天气数据为真实 API 调用
- [ ] `.env` 中增加 `OPENWEATHER_API_KEY`
- [ ] 返回：温度、天气描述、湿度、风速

### 3.5 升级搜索工具

- [ ] 注册 Brave Search API（每月 2000 次免费）
- [ ] 替换 DuckDuckGo Instant Answer（结果质量差）
- [ ] 返回结构化的搜索结果（标题 + 摘要 + URL）
- [ ] `.env` 中增加 `BRAVE_SEARCH_API_KEY`

**Phase 3 完成标志**：问一个需要搜索的复杂问题（"今天北京天气 + 适合去哪里玩"），Agent 能自动调用天气 + 搜索两个工具并综合回答。

---

## Phase 4 — 真正的 RAG

> 目标：用向量语义搜索替换关键词 includes() 匹配。

### 4.1 Qdrant 初始化

- [ ] 安装：`npm install @qdrant/js-client-rest`
- [ ] 创建 `src/db/qdrant.js`，初始化连接
- [ ] 创建 collection：`knowledge_base`，向量维度 1536（对应 embedding 模型）
- [ ] 设置 payload 索引：`user_id`、`tags`、`created_at`

### 4.2 接入 Embedding 模型

- [ ] 确认 DeepSeek 提供 embedding API（或使用 OpenAI `text-embedding-3-small`）
- [ ] 创建 `src/lib/embeddings.js`：
  - `embedText(text)` → 返回向量数组
  - 加入缓存（相同文本不重复调用 API）
- [ ] 测试：`embedText("苹果手机")` 返回 1536 维数组

### 4.3 知识库写入流程

- [ ] 用户保存知识时：
  1. 将内容存入 PostgreSQL（metadata）
  2. 对内容做 embedding → 向量
  3. 将向量 + PostgreSQL ID 存入 Qdrant
- [ ] 大文档自动分块（每块 500 tokens，50 tokens 重叠）
- [ ] 测试：保存一篇文章，Qdrant dashboard 能看到对应向量

### 4.4 知识库搜索流程

- [ ] 查询时：
  1. 对用户问题做 embedding
  2. Qdrant 向量相似度搜索（top 5）
  3. 用返回的 PostgreSQL ID 查完整内容
  4. 拼装成 context 传给 LLM
- [ ] 支持混合过滤：相似度 + 用户 ID + 标签
- [ ] 测试：搜"iPhone 价格"能找到包含"苹果手机"的文档

### 4.5 本地文件知识库

- [ ] 启动时扫描 `knowledge/` 目录下的 `.md` / `.txt` 文件
- [ ] 自动向量化并存入 Qdrant（已存在的跳过）
- [ ] 文件有更新时重新向量化

**Phase 4 完成标志**：保存"iPhone 16 Pro 发布了，价格 8999 元"，然后问"苹果最新手机多少钱"，能正确检索到。

---

## Phase 5 — 前端升级

> 目标：现代化 UI，支持 Markdown、代码高亮、完整的对话体验。

### 5.1 初始化 Next.js 项目

- [ ] `npx create-next-app@latest apps/web --typescript --tailwind --app`
- [ ] 配置代理：Next.js 请求转发到 Fastify 后端

### 5.2 核心组件

- [ ] 安装：`npm install react-markdown react-syntax-highlighter`
- [ ] `MessageBubble` 组件：渲染 Markdown、代码高亮、复制按钮
- [ ] `ToolCallCard` 组件：展示工具调用过程（折叠/展开）
- [ ] `ChatInput` 组件：多行输入、Shift+Enter 换行、Enter 发送
- [ ] `SessionSidebar` 组件：左侧会话列表，支持搜索

### 5.3 流式渲染

- [ ] 使用 `useChat`（Vercel AI SDK）或手写 SSE 消费
- [ ] 流式打字效果
- [ ] 工具调用期间显示 loading 状态和工具名称
- [ ] 回答完成后显示 token 用量

### 5.4 功能补全

- [ ] 消息复制按钮
- [ ] 重新生成按钮（Regenerate）
- [ ] 停止生成按钮（Stop）
- [ ] 加载历史会话时展示完整消息记录（而不是只显示 ID）
- [ ] 移动端响应式布局

**Phase 5 完成标志**：发送含代码的问题，回答中代码块正确高亮；在手机浏览器上界面正常显示。

---

## Phase 6 — 认证系统

> 目标：多用户隔离，每个用户只能访问自己的数据。

### 6.1 用户表和认证接口

- [ ] `POST /api/auth/register`：用户名 + 密码注册（bcrypt 加密）
- [ ] `POST /api/auth/login`：登录返回 Access Token（15分钟）+ Refresh Token（7天）
- [ ] `POST /api/auth/refresh`：用 Refresh Token 换新 Access Token
- [ ] `POST /api/auth/logout`：使 Refresh Token 失效

### 6.2 JWT 中间件

- [ ] 创建 `authMiddleware`：验证请求头中的 Bearer Token
- [ ] 所有 `/api/chat`、`/api/sessions`、`/api/knowledge` 路由加上中间件
- [ ] Token 过期返回 401，前端自动用 Refresh Token 续期

### 6.3 数据隔离

- [ ] 所有数据库查询加 `WHERE user_id = ?` 过滤
- [ ] Qdrant 查询加 `user_id` payload filter
- [ ] 确保用户 A 无法访问用户 B 的任何数据

**Phase 6 完成标志**：注册两个账号，分别保存不同知识，互相无法看到对方数据。

---

## Phase 7 — 可观测性

> 目标：生产环境出问题能快速定位。

### 7.1 结构化日志

- [ ] 安装：`npm install pino pino-pretty`
- [ ] 替换所有 `console.log` 为 Pino logger
- [ ] 每个请求记录：request_id、user_id、路由、耗时、状态码
- [ ] 每次 LLM 调用记录：model、input_tokens、output_tokens、耗时、工具调用列表
- [ ] 错误日志包含完整 stack trace

### 7.2 健康检查

- [ ] `GET /health`：返回服务状态
  ```json
  {
    "status": "ok",
    "postgres": "ok",
    "qdrant": "ok",
    "redis": "ok",
    "uptime": 3600
  }
  ```
- [ ] 任意依赖不健康时返回 503

### 7.3 请求追踪

- [ ] 每个请求生成唯一 `request_id`（UUID）
- [ ] 所有日志带上 `request_id`，可以串联一次请求的完整链路
- [ ] SSE 响应中带上 `request_id`，前端出错时可以告知

**Phase 7 完成标志**：发送一条触发工具调用的消息，在日志中能看到完整链路：请求进来 → LLM 调用 → 工具执行 → 二次 LLM → 响应结束，含所有耗时。

---

## Phase 8 — 容器化和部署

> 目标：一条命令在任何机器上启动，可以部署到生产环境。

### 8.1 Dockerfile

- [ ] 创建多阶段 `Dockerfile`（builder + runner）
- [ ] 最终镜像不包含 devDependencies
- [ ] 使用非 root 用户运行
- [ ] 镜像大小 < 300MB

### 8.2 docker-compose 完善

- [ ] 所有服务加上 `healthcheck`
- [ ] 服务依赖顺序：postgres/qdrant/redis → server → web
- [ ] 敏感配置通过 `.env` 文件注入，不 hardcode
- [ ] 加上 `restart: unless-stopped`

### 8.3 GitHub Actions CI

- [ ] 创建 `.github/workflows/ci.yml`
- [ ] 每次 push 触发：
  - [ ] `npm run lint`（ESLint）
  - [ ] `npm run type-check`（tsc）
  - [ ] `npm test`（单元测试）
  - [ ] `docker build` 验证镜像能构建

### 8.4 环境配置

- [ ] 完善 `.env.example`，列出所有必填和可选的环境变量
- [ ] 启动时检查必填环境变量是否存在，缺少则报错退出（不要运行到一半才报错）

**Phase 8 完成标志**：在一台全新机器上，只需 `git clone` + 填写 `.env` + `docker-compose up`，服务完整运行。

---

## 环境变量清单

```bash
# 数据库
DATABASE_URL=postgresql://agent:secret@localhost:5432/agent_db
REDIS_URL=redis://localhost:6379
QDRANT_URL=http://localhost:6333

# LLM
DEEPSEEK_API_KEY=sk-xxx
DEEPSEEK_BASE_URL=https://api.deepseek.com

# Embedding（选其一）
OPENAI_API_KEY=sk-xxx          # 用 text-embedding-3-small
# 或使用 DeepSeek embedding API

# 工具
BRAVE_SEARCH_API_KEY=xxx
OPENWEATHER_API_KEY=xxx

# 认证
JWT_SECRET=your-super-secret-key-min-32-chars
JWT_REFRESH_SECRET=another-super-secret-key

# 服务
PORT=3000
NODE_ENV=production
LOG_LEVEL=info
```

---

## 进度总览

| Phase | 内容 | 状态 |
|-------|------|------|
| Phase 1 | 安全加固 | ⬜ 未开始 |
| Phase 2 | 数据层升级 | ⬜ 未开始 |
| Phase 3 | Agent 核心重构 | ⬜ 未开始 |
| Phase 4 | 真正的 RAG | ⬜ 未开始 |
| Phase 5 | 前端升级 | ⬜ 未开始 |
| Phase 6 | 认证系统 | ⬜ 未开始 |
| Phase 7 | 可观测性 | ⬜ 未开始 |
| Phase 8 | 容器化和部署 | ⬜ 未开始 |

---

*最后更新：2026-05-31*
