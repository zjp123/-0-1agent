# Web Console Next Phase Roadmap

## 目标

记录 Web Console Phase 12 之后的下一阶段工作，目标是把当前本地运维控制台继续推进到企业生产可上线形态。

## 当前状态

已完成：

- Phase 1 - Web 基础工程
- Phase 2 - Dashboard / 系统健康
- Phase 3 - API Docs / 能力总览
- Phase 4 - Agent Chat / Streaming / LLM Entry
- Phase 5 - Tools
- Phase 6 - Knowledge / RAG
- Phase 7 - Workflow
- Phase 8 - Security / Auth Governance
- Phase 9 - Evaluation
- Phase 10 - Observability
- Phase 11 - 本地联调与自测
- Phase 12 - 生产化增强

当前主要缺口：

- 正式 Web 登录与浏览器会话。
- Web production Docker / CI/CD。
- Web E2E 自动化测试。
- 配置与密钥治理。
- 生产运行手册。

## Phase 13 - 正式 Auth / 登录体系

目标：

- 从手动输入 API key / service token，升级为正式用户登录和会话体系。

范围：

- 登录页。
- Access Token / Refresh Token 会话续期。
- 退出登录。
- 前端 session provider。
- 前端权限裁剪：菜单、页面、按钮。
- 与 API Auth / RBAC / Session Governance 联动。
- 本地开发模式保留 API key / service token 手动入口。

完成标志：

- 用户可登录、刷新页面后保持会话、token 过期可续期、退出后受保护页面不可访问。
- Web 权限视图和 API 服务端权限校验一致。
- 新增对应留痕文档。

## Phase 14 - Web Docker / CI/CD

目标：

- 让 Web 可以被标准化构建、镜像化部署，并纳入 CI。

范围：

- `apps/web/Dockerfile`。
- Web production runtime 配置。
- production compose 接入 Web。
- CI 增加 `check:web`。
- CI 增加 `build:web`。
- Web 镜像构建验证。

完成标志：

- CI 中 Web 类型检查和构建通过。
- 本地或 CI 可构建 Web production image。
- production compose 可同时编排 API、Web、Postgres、Redis、Qdrant。
- 新增对应留痕文档。

## Phase 15 - E2E 自动化测试

目标：

- 用自动化测试覆盖 Web 关键业务路径，降低后续升级回归风险。

范围：

- Playwright E2E 基础设施。
- Dashboard readiness。
- Agent Chat streaming。
- Tools 调用。
- Knowledge / RAG 检索。
- Security / Auth Governance。
- Evaluation / Observability 页面。

完成标志：

- E2E 可本地运行。
- CI 可执行核心 E2E 或 smoke E2E。
- 关键页面和关键用户路径有自动化覆盖。
- 新增对应留痕文档。

## Phase 16 - 配置与密钥治理

目标：

- 建立 Web 环境变量、安全边界和密钥使用规范。

范围：

- 完善 Web `.env.example`。
- 明确 local / staging / production 配置差异。
- 启动前配置校验策略。
- 明确 `NEXT_PUBLIC_` 变量不可放密钥。
- 明确生产禁止使用本地 `local-admin-service-token`。

完成标志：

- 新环境按文档即可配置启动。
- 生产密钥不会进入浏览器 bundle。
- 本地 token 和生产 token 的边界清晰。
- 新增对应留痕文档。

## Phase 17 - 生产运行手册

目标：

- 给 Web Console 建立上线、回滚、健康检查和故障排查手册。

范围：

- Web 上线流程。
- Web 回滚流程。
- Web health / smoke test。
- 常见故障排查。
- 发布后观察项。

完成标志：

- 有可执行的上线 checklist。
- 有可执行的回滚 checklist。
- 有标准 smoke test。
- 有常见故障定位入口。
- 新增对应留痕文档。

## 推荐执行顺序

1. Phase 13 - 正式 Auth / 登录体系
2. Phase 14 - Web Docker / CI/CD
3. Phase 15 - E2E 自动化测试
4. Phase 16 - 配置与密钥治理
5. Phase 17 - 生产运行手册

优先级原因：

- Auth 是生产可用的最大缺口。
- Docker / CI/CD 是标准部署入口。
- E2E 可以保护后续持续迭代。
- 配置治理和运行手册让上线、回滚、排障可重复执行。

