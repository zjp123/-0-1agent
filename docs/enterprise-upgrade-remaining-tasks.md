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
- [x] Phase 14 - Web Docker / CI/CD
- [x] Phase 15 - Web E2E 自动化测试
- [ ] Phase 16 - Web 配置与密钥治理
- [ ] Phase 17 - Web 生产运行手册

## 当前进行中

- Phase 16 - Web 配置与密钥治理

## 下一步说明

企业级 API / Agent 核心升级路线已完成，Web Console 已完成 Phase 1-15。

下一阶段继续补齐 Web 生产可上线闭环：

1. 配置与密钥治理
2. 生产运行手册

优先级说明：

- 当前 Web 已具备正式登录会话、生产镜像、CI 构建和 E2E smoke 覆盖。
- 配置治理和运行手册是后续生产联调、发布、回滚、排障的基础。
