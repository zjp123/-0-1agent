# Web Console 配置与密钥治理

## 目标

Phase 16 为 Web Console 建立生产级配置边界，避免前端公开环境变量混入密钥，明确 local / staging / production profile 的使用方式，并在页面层暴露基础配置告警。

## 实现内容

### 集中式 Web Config

新增/升级：

- `apps/web/src/lib/config.ts`

能力：

- 集中读取 `NEXT_PUBLIC_API_BASE_URL`。
- 新增 `NEXT_PUBLIC_WEB_ENV` profile。
- 校验 API URL 必须是绝对 `http` 或 `https` URL。
- 校验 API URL 必须以 `/api` 结尾。
- 校验 Web profile 只能是允许值。
- 当 production profile 指向 localhost API 时生成 warning。

允许的 Web profile：

```text
local
development
staging
production
test
```

### UI 可观测性

更新：

- `apps/web/src/components/layout/app-shell.tsx`
- `apps/web/src/features/dashboard/dashboard-health-panel.tsx`

能力：

- 顶部栏展示当前 Web profile。
- Dashboard 展示 Web profile 和 API base URL。
- Dashboard 展示配置 warning，例如 production profile 指向 localhost API。

### 环境样例

更新：

- `.env.example`
- `apps/web/.env.example`

新增 Web 配置：

```text
NEXT_PUBLIC_WEB_ENV=local
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3000/api
WEB_PORT=3001
```

### Docker / Compose

更新：

- `apps/web/Dockerfile`
- `infra/docker-compose.prod.yml`

策略：

- Docker build 阶段接收 `NEXT_PUBLIC_WEB_ENV` 和 `NEXT_PUBLIC_API_BASE_URL`。
- Compose build args 与 runtime env 保持一致。
- 默认 production compose 使用 `NEXT_PUBLIC_WEB_ENV=production`。

## 配置 Profile

### Local

```text
NEXT_PUBLIC_WEB_ENV=local
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3000/api
```

用途：

- 本地开发
- 本地 Docker / API 联调
- Playwright mock 或本机 API 自测

### Staging

```text
NEXT_PUBLIC_WEB_ENV=staging
NEXT_PUBLIC_API_BASE_URL=https://staging-api.example.com/api
```

用途：

- 预发布验证
- 生产前 smoke test
- 与 staging API / DB / Redis / Qdrant 环境联调

### Production

```text
NEXT_PUBLIC_WEB_ENV=production
NEXT_PUBLIC_API_BASE_URL=https://api.example.com/api
```

要求：

- API URL 必须是浏览器可访问的生产 API 地址。
- 不允许指向 `localhost` / `127.0.0.1` / `::1`。
- 不允许使用 `local-admin-service-token`。
- 必须通过正式登录会话或受治理的后端认证链路访问受保护能力。

## NEXT_PUBLIC 安全边界

所有 `NEXT_PUBLIC_*` 变量都会进入浏览器 bundle，用户可以在浏览器 DevTools 中看到。

允许放入：

- Web profile
- 浏览器可访问 API URL
- 非敏感 feature flag
- 非敏感展示文案或版本标识

禁止放入：

- API key
- Service token
- JWT secret
- Refresh token
- Database URL / password
- Redis password
- Qdrant API key
- LLM / embedding provider key
- KMS / secrets master key

## 启动前校验策略

Web build / runtime 会在导入 `apps/web/src/lib/config.ts` 时进行基础校验：

- `NEXT_PUBLIC_WEB_ENV` 非法时抛错。
- `NEXT_PUBLIC_API_BASE_URL` 不是 HTTP(S) 绝对 URL 时抛错。
- `NEXT_PUBLIC_API_BASE_URL` 不以 `/api` 结尾时抛错。

页面级 warning：

- `NEXT_PUBLIC_WEB_ENV=production` 但 API URL 指向 localhost 时，Dashboard 显示 warning。

生产上线前仍需要部署平台校验：

- 确认 Docker build args 与 runtime env 一致。
- 确认生产 API CORS 允许 Web 域名。
- 确认生产 API 使用强 `JWT_SECRET`。
- 确认生产环境没有本地开发 service token。

## 验证命令

```bash
npm run check:web
npm run check -w @enterprise-agent/api
npm run build:web
npm run test:e2e:web
```

## 后续

Phase 17 进入 Web 生产运行手册，补齐上线、回滚、健康检查、smoke test 和故障排查流程。
