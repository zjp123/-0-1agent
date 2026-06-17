# Policy / Approval / Human-in-the-loop Governance

## 目标

本步骤增加生产级审批治理能力，用于把高风险操作从“直接执行”升级为“按策略要求人工审批后执行”。

核心目标：

- approval policy registry
- approval request store
- approve / reject / cancel API
- approval audit events
- 高风险 secret 操作审批接入
- 高风险 Agent tool execution approval-required 接入

## 新增文件

```text
apps/api/src/governance/
  approval.service.ts
  approval.types.ts
  dto/create-approval-policy.dto.ts
  dto/create-approval-request.dto.ts
  dto/decide-approval-request.dto.ts

apps/api/src/secrets/dto/read-secret-value.dto.ts

apps/api/drizzle/0010_flimsy_madame_hydra.sql
apps/api/drizzle/meta/0010_snapshot.json
```

## 修改文件

```text
apps/api/src/db/schema.ts
apps/api/src/governance/governance.controller.ts
apps/api/src/governance/governance.module.ts
apps/api/src/secrets/dto/rotate-secret.dto.ts
apps/api/src/secrets/secrets.controller.ts
apps/api/src/secrets/secrets.module.ts
apps/api/src/secrets/secrets.service.ts
apps/api/drizzle/meta/_journal.json
```

## 数据库表

### approval_policies

用于保存租户内审批策略。

字段：

- `tenant_id`
- `name`
- `action`
- `resource_type`
- `required_approvals`
- `enabled`
- `metadata`
- `created_at`
- `updated_at`

### approval_requests

用于保存审批请求和审批结果。

字段：

- `tenant_id`
- `policy_id`
- `requested_by`
- `action`
- `resource_type`
- `resource_id`
- `status`
- `required_approvals`
- `approvals`
- `reason`
- `rejection_reason`
- `payload`
- `metadata`
- `expires_at`
- `decided_at`
- `created_at`
- `updated_at`

## 审批模型

审批策略按以下维度匹配：

```text
tenant_id + action + resource_type + enabled
```

当前已接入的高风险动作：

```text
secrets.secret.read_value + secret_value
secrets.secret.rotate + secret_value
tool.execute + tool
```

运行时校验规则：

- 没有匹配到启用的审批策略时，操作直接通过
- 匹配到审批策略时，操作请求必须提供 `approvalId`
- 审批请求必须属于同一租户
- 审批请求的 `action` / `resourceType` / `resourceId` 必须匹配当前操作
- 审批请求的 `requestedBy` 必须匹配当前执行人
- 审批请求状态必须是 `approved`
- 过期审批请求不能继续使用
- 请求人不能审批自己的请求
- 同一审批人不能重复审批同一个请求

## API

所有接口前缀：

```text
/api/governance
```

所有接口要求：

```ts
@RequirePermissions("auth:manage")
```

### Approval Policy

```http
GET /api/governance/approval/policies
POST /api/governance/approval/policies
```

创建审批策略：

```json
{
  "name": "Secret value read approval",
  "action": "secrets.secret.read_value",
  "resourceType": "secret_value",
  "requiredApprovals": 1,
  "enabled": true,
  "metadata": {
    "scope": "production-secrets"
  }
}
```

### Approval Request

```http
GET /api/governance/approval/requests
POST /api/governance/approval/requests
POST /api/governance/approval/requests/:requestId/approve
POST /api/governance/approval/requests/:requestId/reject
POST /api/governance/approval/requests/:requestId/cancel
```

创建审批请求：

```json
{
  "action": "secrets.secret.rotate",
  "resourceType": "secret_value",
  "resourceId": "secret-uuid",
  "reason": "Rotate production provider credential",
  "payload": {
    "changeTicket": "CHG-1001"
  },
  "expiresAt": "2026-06-16T00:00:00.000Z"
}
```

审批 / 拒绝 / 取消：

```json
{
  "comment": "Approved for scheduled rotation window"
}
```

### Secret 操作接入

读取 secret value：

```http
GET /api/secrets/:secretId/value?approvalId=approval-request-id
```

轮换 secret：

```json
{
  "value": "new-secret-value",
  "reason": "Scheduled credential rotation",
  "approvalId": "approval-request-id"
}
```

### Agent Tool 操作接入

Agent Runtime 会检查工具定义中的 `riskLevel`：

```text
low / medium: 直接进入 Tool Registry 执行
high / critical: 自动创建 approval request，并停止当前 Agent run
```

当高风险工具触发审批时：

- Agent run stopReason 为 `approval_required`
- tool step status 为 `denied`
- tool step 带 `approvalRequestId`
- Execution Plan 的 tool step 标记为 `skipped`
- Observability `tool.completed` trace 带 `approvalRequired=true`
- approval request payload 会保存 requestId、toolName、arguments

当前这是“中断并留痕”模式，尚未实现审批通过后的自动恢复执行。

## 审计动作

当前写入的 action：

- `approval.policy.create`
- `approval.request.create`
- `approval.request.approve`
- `approval.request.reject`
- `approval.request.cancel`

Secret 高风险动作仍写入原有审计动作：

- `secrets.secret.read_value`
- `secrets.secret.rotate`

Agent 高风险工具会写入：

- `approval.request.create`

并通过 Observability 记录：

- `tool.completed`，attributes 中包含 `approvalRequired` 和 `approvalRequestId`

## 当前边界

已完成：

- approval policy registry
- approval request store
- approve / reject / cancel API
- 多人审批计数
- 审批请求过期校验
- request/action/resource/requester 匹配校验
- requester self-approval 禁止
- approval audit events
- secret value read 审批接入
- secret rotation 审批接入
- high / critical risk tool approval-required 中断
- 自动创建 tool approval request
- Agent Chat 展示 approvalRequestId
- Drizzle migration

未完成：

- workflow 自动暂停 / 恢复审批节点
- approval 后恢复 Agent run
- approval delegation / escalation
- approval request 分页和筛选
- approval consumption marking
- 按审批角色或审批组约束审批人

## 验证

本步骤已执行：

```bash
npm run db:generate
npm run check
npm run build
```

结果：

- `db:generate` 已生成 `0010_flimsy_madame_hydra.sql`
- `check` 通过
- `build` 通过

## 下一步

建议下一步实现 `Multi-agent Orchestration Enhancement`：

1. agent role / participant registry
2. coordinator / worker / reviewer 编排模型
3. 多智能体任务分解与交接记录
4. 多智能体运行 trace
5. 编排失败恢复与超时治理
