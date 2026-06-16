# Web Console Security / Auth Governance

## 目标

为企业级 Agent 平台 Web 控制台增加安全与权限治理入口，用于本地自测和后续生产运维。

本阶段覆盖 Phase 8 的首版能力：

- 展示 RBAC roles 列表。
- 支持创建 role，并强制填写 reason/comment 留痕字段。
- 展示 service tokens 列表。
- 展示 auth audit events。
- 展示 security anomaly events。
- 支持 acknowledge anomaly。
- 对 break-glass role/token 显示强提醒。

## 页面入口

- Web 页面：`http://localhost:3001/security`
- 侧边栏入口：`Security`

## 前端实现

新增文件：

- `apps/web/src/app/security/page.tsx`
- `apps/web/src/features/security-governance/security-governance.tsx`

更新文件：

- `apps/web/src/lib/api/client.ts`
- `apps/web/src/components/layout/app-shell.tsx`
- `apps/web/src/app/globals.css`

## API 对接

页面对接以下后端接口：

- `GET /api/auth/roles`
- `POST /api/auth/roles`
- `GET /api/auth/service-tokens`
- `GET /api/auth/audit-events`
- `GET /api/auth/security/anomalies`
- `POST /api/auth/security/anomalies/{eventId}/acknowledge`

所有受保护接口均支持在页面中输入：

- `x-api-key`
- `x-service-token`

本地推荐使用 `.env` 中配置的 admin service token。

## 治理约束

- 角色创建必须填写 `reason`，用于后端 audit event 留痕。
- 角色创建可选填写 `comment`，用于记录人工说明。
- `service token` 本阶段只读展示，暂不在 Web 首版暴露创建、旋转、禁用能力，避免误操作密钥生命周期。
- 发现 `break_glass` role 或 service token 时，页面展示强提醒，提示该类访问可绕过普通最小权限控制。
- 安全异常确认支持 comment，确认后刷新列表与审计视图。

## 验证方式

```bash
PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH npm run check:web
PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH npm run check -w @enterprise-agent/api
curl --max-time 10 -fsS http://127.0.0.1:3000/api/auth/roles -H 'x-service-token: local-admin-service-token'
curl --max-time 10 -fsS http://localhost:3001/security
```

## 后续增强

- 增加 role 编辑、删除和权限差异预览。
- 增加 service token 创建、禁用、轮换的二次确认流程。
- 增加 audit event 筛选条件。
- 增加 anomaly severity/category 筛选。
- 增加前端权限视图控制，只向具备 `auth:manage` 的用户展示治理操作。
