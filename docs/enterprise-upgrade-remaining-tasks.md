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

## 未完成

- [x] Phase 13 - Web 正式 Auth / 登录体系
- [ ] Phase 14 - Web Docker / CI/CD
- [ ] Phase 15 - Web E2E 自动化测试
- [ ] Phase 16 - Web 配置与密钥治理
- [ ] Phase 17 - Web 生产运行手册

## 当前进行中

- Phase 14 - Web Docker / CI/CD

## 下一步说明

企业级 API / Agent 核心升级路线已完成，Web Console 已完成 Phase 1-12。

下一阶段进入 Web 生产可上线闭环：

1. 正式 Auth / 登录体系
2. Web Docker / CI/CD
3. E2E 自动化测试
4. 配置与密钥治理
5. 生产运行手册

优先级说明：

- 当前 Web 仍以本地 API key / service token 输入为主，生产环境需要正式用户身份、会话续期、退出登录和前端权限裁剪。
- Web 需要纳入生产镜像、compose 和 CI，才能形成标准部署闭环。
- E2E、配置治理和运行手册是后续生产联调、发布、回滚、排障的基础。
