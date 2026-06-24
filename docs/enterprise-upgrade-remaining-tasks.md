# Enterprise Upgrade Remaining Tasks

## 目的

本文档用于跟踪企业级升级路线中尚未完成的生产级能力。

规则：

- `[ ]` 表示未完成
- `[x]` 表示已完成
- 每完成一项功能，更新本文件并补充对应留痕文档

## 已完成

- [x] Model Gateway
- [x] Tool Registry
- [x] Agent Runtime
- [x] Memory / Context
- [x] RAG / Knowledge
- [x] PostgreSQL database infrastructure
- [x] Knowledge persistence
- [x] Qdrant vector store
- [x] Hybrid retrieval
- [x] Embedding provider
- [x] RAG fallback / re-indexing
- [x] Redis indexing worker
- [x] Indexing queue reliability
- [x] Worker lease / concurrency / admin ops
- [x] Redis Streams migration
- [x] Delayed retry / pending recovery
- [x] Queue metrics / dashboard
- [x] Operations runbook / alerts
- [x] Prometheus-style indexing metrics
- [x] Observability + trace persistence
- [x] Workflow engine + persistence
- [x] Evaluation + persistence
- [x] Auth / RBAC enterprise upgrade
- [x] Persistent RBAC / Service Token Store
- [x] Auth Admin API / Audit Reason
- [x] Refresh Token / Session Governance
- [x] Rate Limiting / Quota Governance
- [x] Secrets / KMS / Credential Governance
- [x] Policy / Approval / Human-in-the-loop Governance
- [x] Multi-agent Orchestration Enhancement
- [x] Workflow Production Scheduling Enhancement
- [x] Test System: unit / integration / e2e
- [x] OpenAPI / SDK / API Documentation
- [x] CI/CD / Docker Production Build
- [x] Deployment Operations: readiness / migrations / environment profiles
- [x] Security Hardening: audit pagination / break-glass / anomaly detection
- [x] Dynamic MCP Management: DB 配置 / Web 管理 / runtime reload / command approval gate
- [x] Remote MCP Transport: Streamable HTTP JSON-RPC POST / URL 配置 / 基础 auth
- [x] Agent Chat 后端持久化对话历史 / 会话列表 / 切页刷新恢复

## 未完成

- [x] Phase 13 - Web 正式 Auth / 登录体系
- [x] Phase 14 - Web Docker / CI/CD
- [x] Phase 15 - Web E2E 自动化测试
- [x] Phase 16 - Web 配置与密钥治理
- [x] Phase 17 - Web 生产运行手册
- [x] MCP tenant-scoped tool visibility / execution isolation
- [ ] MCP env secretRef + Secrets/KMS 注入
- [ ] MCP Streamable HTTP SSE response 兼容
- [ ] MCP OAuth 2.1 remote authorization flow
- [ ] 工具级 approval 恢复执行

## 当前状态

- 企业级 API / Agent 核心升级路线已完成。
- Web Console Phase 1-17 已完成。
- MCP 已从静态 env 配置升级为可动态配置、审批、启停和 reload。

## 下一步说明

当前企业级升级主线已完成，可以进入真实环境交付前增强：

1. Staging 环境完整联调。
2. Web/API 镜像推送 registry。
3. SBOM / vulnerability scan / signed image / provenance。
4. 生产监控告警接入。
5. 灰度发布和真实流量演练。

## 完成说明

Phase 13-17 已补齐 Web 正式登录、生产镜像、CI/CD、E2E、配置密钥治理和生产运行手册。项目已经具备从本地自测到生产部署演练的基础闭环。
