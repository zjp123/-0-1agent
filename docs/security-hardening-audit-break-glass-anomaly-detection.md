# Security Hardening: Audit Pagination / Break-glass / Anomaly Detection

## 目标

本步骤完成企业级安全加固路线的最后一项，把 auth 管理面从基础审计升级为可检索、可应急、可告警的生产级安全控制。

核心目标：

- auth admin audit events 支持分页和过滤
- 增加 break-glass 紧急角色
- break-glass 操作强制 reason/comment 约束
- 增加 security anomaly event 持久化模型
- 暴露安全异常查询与确认 API
- 更新 OpenAPI 静态快照和剩余任务清单

## 新增文件

```text
apps/api/src/auth/dto/list-audit-events.dto.ts
apps/api/src/auth/dto/list-security-anomalies.dto.ts
apps/api/src/auth/dto/acknowledge-security-anomaly.dto.ts
apps/api/test/unit/auth.service.test.ts
apps/api/drizzle/0013_unknown_doctor_faustus.sql
apps/api/drizzle/meta/0013_snapshot.json
docs/security-hardening-audit-break-glass-anomaly-detection.md
```

## 修改文件

```text
apps/api/src/auth/auth-admin.controller.ts
apps/api/src/auth/auth-admin.service.ts
apps/api/src/auth/auth.service.ts
apps/api/src/auth/auth.types.ts
apps/api/src/auth/dto/create-service-token.dto.ts
apps/api/src/auth/dto/update-service-token.dto.ts
apps/api/src/db/schema.ts
apps/api/src/api-docs/openapi.document.ts
apps/api/test/unit/openapi.document.test.ts
docs/openapi/enterprise-agent.openapi.json
docs/enterprise-upgrade-remaining-tasks.md
```

## Audit Pagination / Filtering

接口：

```http
GET /api/auth/audit-events
```

新增 query：

- `limit`: 默认 100，范围 1-500
- `offset`: 默认 0
- `action`
- `targetType`
- `targetId`
- `actorUserId`
- `from`: ISO8601
- `to`: ISO8601

响应格式：

```json
{
  "items": [],
  "limit": 100,
  "offset": 0,
  "nextOffset": 100
}
```

`nextOffset` 仅在还有下一页时返回。

## Break-glass Role

新增角色：

```text
break_glass
```

权限：

```text
ALL_PERMISSIONS
```

用途：

- 生产事故和紧急恢复场景
- 临时突破常规分权边界
- 所有操作必须留下强审计证据

约束：

- 操作者 roles 包含 `break_glass` 时，所有通过 `AuthAdminService.recordAudit()` 记录的管理操作都会触发强校验。
- `reason` 必须以 `BREAK-GLASS:` 开头。
- `comment` 必填且不能为空。
- 审计 metadata 自动追加 `breakGlass: true`。
- break-glass 操作自动生成 `critical` 安全异常事件。

## Security Anomaly Events

新增表：

```text
security_anomaly_events
```

主要字段：

- `tenant_id`
- `severity`: `info` / `warning` / `critical`
- `category`
- `action`
- `actor_user_id`
- `actor_auth_type`
- `target_type`
- `target_id`
- `message`
- `metadata`
- `acknowledged`
- `acknowledged_by`
- `acknowledged_at`
- `created_at`

索引：

- `security_anomaly_events_tenant_created_idx`
- `security_anomaly_events_tenant_severity_idx`
- `security_anomaly_events_tenant_category_idx`
- `security_anomaly_events_tenant_acknowledged_idx`

当前自动检测规则：

- `break_glass`: break-glass actor 执行 auth 管理操作，severity 为 `critical`
- `credential_admin`: service token 创建、更新、禁用、轮换，severity 为 `warning`
- `privilege_escalation`: 创建/更新含 `auth:manage` 权限的 role，或给用户绑定含 `auth:manage` 的 role，severity 为 `critical`

## Security Alert API

查询异常：

```http
GET /api/auth/security/anomalies
```

query：

- `limit`: 默认 100，范围 1-500
- `offset`: 默认 0
- `severity`: `info` / `warning` / `critical`
- `category`
- `acknowledged`

确认异常：

```http
POST /api/auth/security/anomalies/:eventId/acknowledge
```

请求：

```json
{
  "comment": "Reviewed by security owner"
}
```

确认动作会：

- 标记 `acknowledged=true`
- 写入 `acknowledgedBy`
- 写入 `acknowledgedAt`
- 追加一条 `auth.security_anomaly.acknowledge` 审计事件

## OpenAPI

新增 OpenAPI tag：

```text
Security
```

新增 operation：

- `listAuthAuditEvents`
- `listSecurityAnomalies`
- `acknowledgeSecurityAnomaly`

静态快照已重新导出：

```text
docs/openapi/enterprise-agent.openapi.json
```

## 运行手册

### 日常审计

1. 使用 `GET /api/auth/audit-events?limit=100&offset=0` 拉取审计。
2. 按 `action`、`actorUserId`、`targetType`、`targetId` 或时间窗口过滤。
3. 对涉及 service token、role 权限变更、用户授权的事件做人工复核。

### Break-glass 使用

1. 仅在生产事故、权限恢复、紧急封禁等场景授予或启用 `break_glass`。
2. 所有操作 reason 必须使用 `BREAK-GLASS:` 前缀。
3. comment 写清事故编号、审批人、预期恢复动作。
4. 事故结束后撤销 break-glass 授权。
5. 查询 `category=break_glass&acknowledged=false` 的异常事件并逐条确认。

### 异常响应

1. 查询 `GET /api/auth/security/anomalies?acknowledged=false`。
2. 优先处理 `severity=critical`。
3. 对 privilege escalation 事件核对审批记录。
4. 对 credential admin 事件核对 token 创建/轮换原因。
5. 处理完成后调用 acknowledge API 留痕。

## 当前边界

已完成：

- audit pagination / filtering
- break-glass role
- break-glass reason/comment enforcement
- security anomaly persistence
- security anomaly list / acknowledge API
- OpenAPI route and schema baseline
- Drizzle migration
- unit tests
- remaining task checklist closed

后续可增强：

- 异常事件推送到 Slack/PagerDuty/SIEM
- 更细粒度 auth admin 权限分权
- anomaly detection 接入 rate limit、approval、secret 事件
- break-glass 角色自动过期和双人审批
- OpenAPI query parameter 精细化描述

## 验证

本步骤已执行：

```bash
PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH npm run db:generate
PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH npm run docs:openapi
PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH npm run check
PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH npm test
```

结果：

- `db:generate` 通过，生成 `apps/api/drizzle/0013_unknown_doctor_faustus.sql`
- `docs:openapi` 通过
- `check` 通过
- `npm test`: 16 passed
