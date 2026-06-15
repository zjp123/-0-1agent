# OpenAPI / SDK / API Documentation

## 目标

本步骤建立 API 文档与 SDK 生成的生产级基线，让企业 Agent 平台具备稳定的机器可读 API 契约和调用示例。

核心目标：

- OpenAPI generation baseline
- API route grouping and tags
- request / response schema documentation
- SDK generation plan
- API usage examples

## 新增文件

```text
apps/api/src/api-docs/
  api-docs.module.ts
  api-docs.controller.ts
  openapi.document.ts

apps/api/scripts/export-openapi.ts
apps/api/test/unit/openapi.document.test.ts

docs/openapi/enterprise-agent.openapi.json
docs/api-usage-examples.md
```

## 修改文件

```text
apps/api/src/app.module.ts
package.json
apps/api/package.json
```

## Runtime API Docs

新增运行时文档端点：

```http
GET /api/docs
GET /api/docs/openapi.json
```

`GET /api/docs` 返回按 tag 分组的 API 摘要。

`GET /api/docs/openapi.json` 返回 OpenAPI 3.1 文档。

## Static OpenAPI Snapshot

静态快照路径：

```text
docs/openapi/enterprise-agent.openapi.json
```

重新导出：

```bash
npm run docs:openapi
```

当前脚本使用：

```bash
node --import tsx scripts/export-openapi.ts
```

这样可以避免 `tsx` CLI 在受限 sandbox 下创建 IPC pipe 的兼容问题。

## API Grouping

当前 OpenAPI tag：

- System
- Documentation
- Agent Runtime
- Tools
- Knowledge
- Knowledge Indexing
- Workflows
- Workflow Scheduling
- Orchestration
- Evaluations
- Observability
- Governance
- Approvals
- Secrets

## Security Schemes

当前 OpenAPI security schemes：

```text
ApiKeyAuth: x-api-key
BearerAuth: Authorization Bearer JWT
```

受保护接口在 operation description 中标注所需 permission。

## SDK 生成计划

当前已具备 SDK 生成输入：

```text
docs/openapi/enterprise-agent.openapi.json
```

建议后续生成 SDK 的优先级：

1. TypeScript SDK
2. Python SDK
3. CLI wrapper

推荐后续工具：

- `openapi-typescript`
- `openapi-fetch`
- `openapi-generator-cli`

本步骤暂不引入 SDK 生成依赖，避免在当前生产升级路线中扩大依赖面。

## API Usage Examples

调用示例文档：

```text
docs/api-usage-examples.md
```

当前覆盖：

- Agent Run
- Knowledge Retrieval
- Workflow Schedule Claim
- Multi-agent Orchestration
- Approval Flow
- Secret Rotation with Approval

## 当前边界

已完成：

- runtime OpenAPI endpoint
- runtime docs summary endpoint
- static OpenAPI snapshot
- docs export script
- OpenAPI unit tests
- core API route grouping
- baseline request schemas
- auth scheme documentation
- API usage examples

未完成：

- `@nestjs/swagger` decorator-driven generation
- full response schema precision
- generated TypeScript SDK package
- generated Python SDK package
- SDK publishing pipeline
- API changelog / versioning policy
- OpenAPI diff check in CI

## 验证

本步骤已执行：

```bash
npm run docs:openapi
npm test
```

结果：

- `docs:openapi` 通过
- `npm test`: 12 passed

## 下一步

建议下一步实现 `Deployment Operations: readiness / migrations / environment profiles`：

1. readiness / liveness endpoint separation
2. migration apply command
3. production env profile documentation
4. deployment runbook
5. rollback and migration safety checklist
