# 企业级 Agent 工程骨架

本文档记录新企业级 Agent 项目的第一版工程结构。

## 目录结构

```text
apps/
  api/                 # NestJS API 服务
    src/
      agent-runtime/   # Agent 推理、规划、执行循环
      auth/            # 认证、RBAC、权限治理
      common/          # 配置、过滤器、通用基础设施
      health/          # 健康检查
      memory-context/  # 记忆与上下文管理
      model-gateway/   # LLM Provider 抽象
      observability/   # 日志、指标、追踪、成本统计
      rag/             # 知识库与检索增强生成
      tools/           # 内置工具与 MCP 工具注册表
      workflow/        # 任务规划、状态机、可恢复工作流
  web/                 # 前端应用预留
packages/
  shared/              # 共享类型与工具预留
infra/                 # Docker、部署、数据库等基础设施预留
baseCode/              # 旧 Demo 代码归档，不作为新架构依赖
```

## 当前 API 能力

当前第一版只提供工程地基和能力边界，不实现完整 Agent 业务。

已具备：

- TypeScript strict mode
- NestJS API 入口
- 全局配置加载
- 环境变量校验
- Helmet 安全响应头
- CORS 配置
- 全局 ValidationPipe
- 全局异常响应格式
- 健康检查接口
- 企业级 Agent 8 个核心模块边界

接口：

- `GET /api/health`
- `GET /api/agent/capabilities`
- `POST /api/agent/run`
- `GET /api/tools`
- `POST /api/tools/execute`
- `POST /api/knowledge/ingest`
- `POST /api/knowledge/retrieve`
- `GET /api/knowledge/documents`
- `GET /api/observability/traces`
- `POST /api/workflows`
- `GET /api/workflows`
- `GET /api/workflows/:workflowId`
- `PATCH /api/workflows/:workflowId/steps/:stepId`
- `POST /api/evaluations/cases`
- `GET /api/evaluations/cases`
- `POST /api/evaluations/cases/:caseId/runs`
- `GET /api/evaluations/runs`

## 命令

```bash
npm install
npm run check
npm run build
npm run dev:api
npm run infra:up
npm run infra:down
npm run db:generate
npm run db:push
```

如果本机 npm 用户配置里有失效 token，可以使用临时 npmrc 安装公开依赖：

```bash
npm install --userconfig /private/tmp/enterprise-agent-empty.npmrc
```

## 基础设施

当前基础设施文档见 [database-infrastructure.md](./database-infrastructure.md)。

## 下一步

下一阶段建议实现 `Database Connection`：

1. 创建 Drizzle database provider
2. 创建 health check 数据库探测
3. 生成 migration
4. 替换一个低风险 store，例如 EvaluationStore
5. 再逐步替换 Knowledge / Workflow / Trace
