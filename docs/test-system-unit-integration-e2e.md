# Test System: unit / integration / e2e

## 目标

本步骤建立企业级测试系统基线，让项目从只有类型检查和构建，升级为具备分层自动化测试入口。

核心目标：

- 测试框架与脚本
- unit tests for core services
- integration tests for persistence-style stores
- API e2e smoke tests
- CI test command baseline

## 技术选型

当前采用：

```text
Node.js built-in test runner + tsx
```

选择原因：

- Node 22 已内置 `node:test`
- 项目已有 `tsx`，不需要新增依赖
- 支持 TypeScript ESM 测试
- 后续可以平滑迁移到 Jest / Vitest / Supertest

## 新增文件

```text
apps/api/test/
  unit/tool-input.validator.test.ts
  unit/calculator.tool.test.ts
  integration/in-memory-workflow.store.test.ts
  e2e/controllers.smoke.test.ts
```

## 修改文件

```text
package.json
apps/api/package.json
```

## 测试脚本

根目录脚本：

```bash
npm test
npm run test:unit
npm run test:integration
npm run test:e2e
```

API workspace 脚本：

```bash
node --test --import tsx "test/**/*.test.ts"
node --test --import tsx "test/unit/**/*.test.ts"
node --test --import tsx "test/integration/**/*.test.ts"
node --test --import tsx "test/e2e/**/*.test.ts"
```

## 覆盖范围

### Unit

当前覆盖：

- `validateToolInput`
- `CalculatorTool`

验证内容：

- nested object / array 输入校验
- required 字段
- additionalProperties 拒绝
- calculator 运算优先级
- calculator 除零错误

### Integration

当前覆盖：

- `InMemoryWorkflowStore`

验证内容：

- create workflow
- list workflow
- update step
- workflow status 自动推导
- event history
- tenant isolation

### E2E Smoke

当前覆盖：

- `AppController`
- `HealthController`

验证内容：

- root metadata shape
- health response shape
- dependency health stub

当前 e2e smoke 是 controller-level smoke test，暂未启动完整 Nest HTTP server。

## 当前边界

已完成：

- test command baseline
- unit test script
- integration test script
- e2e smoke script
- core utility unit tests
- workflow store integration tests
- controller smoke tests
- `npm test` 全量入口

未完成：

- Jest / Vitest 或 Supertest HTTP e2e
- Testcontainers / dockerized PostgreSQL integration tests
- Qdrant / Redis integration tests
- auth / RBAC API e2e tests
- workflow scheduler persistence tests
- orchestration service integration tests
- CI pipeline job definition
- coverage reporting

## 验证

本步骤已执行：

```bash
npm test
npm run test:unit
npm run test:integration
npm run test:e2e
npm run check
npm run build
```

结果：

- `npm test`: 9 passed
- `test:unit`: 5 passed
- `test:integration`: 2 passed
- `test:e2e`: 2 passed
- `check` 通过
- `build` 通过

## 下一步

建议下一步实现 `CI/CD / Docker Production Build`：

1. Dockerfile production build
2. docker compose production profile
3. CI lint / check / test / build baseline
4. migration check step
5. image build and startup smoke test
