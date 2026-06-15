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

## 未完成

- [ ] Test System: unit / integration / e2e
- [ ] OpenAPI / SDK / API Documentation
- [ ] CI/CD / Docker Production Build
- [ ] Deployment Operations: readiness / migrations / environment profiles
- [ ] Security Hardening: audit pagination / break-glass / anomaly detection

## 当前进行中

- [ ] Test System: unit / integration / e2e

## 下一步说明

Test System: unit / integration / e2e 目标：

1. 测试框架与脚本
2. unit tests for core services
3. integration tests for persistence stores
4. API e2e smoke tests
5. CI test command baseline
