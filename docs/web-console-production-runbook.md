# Web Console 生产运行手册

## 目标

Phase 17 为 Web Console 沉淀生产运行手册，覆盖上线、回滚、健康检查、smoke test、故障排查和发布后观察项，方便后续 staging / production 环境按标准流程执行。

## 适用范围

本手册适用于：

- Next.js Web Console
- Enterprise Agent API
- Production compose 本地演练
- Staging / production 部署平台

相关文档：

- `docs/web-console-docker-ci-cd.md`
- `docs/web-console-config-secrets-governance.md`
- `docs/web-console-e2e.md`
- `docs/deployment-runbook.md`

## 上线前检查

代码质量门禁：

```bash
npm run check:web
npm run check -w @enterprise-agent/api
NEXT_TEST_WASM_DIR=/Users/bjsttlp406/others/-0-1agent/node_modules/@next/swc-wasm-nodejs npm run build:web
npm run test:e2e:web
```

配置检查：

- `NEXT_PUBLIC_WEB_ENV=production`
- `NEXT_PUBLIC_API_BASE_URL=https://<api-domain>/api`
- `NEXT_PUBLIC_API_BASE_URL` 以 `/api` 结尾
- Web Docker build args 与 runtime env 一致
- 生产环境没有 `local-admin-service-token`
- API 使用强随机 `JWT_SECRET`
- API 配置 `SECRETS_MASTER_KEY`
- API CORS 允许 Web 域名
- 反向代理支持 SSE streaming

Production compose 配置检查：

```bash
POSTGRES_PASSWORD=<production-password> \
SECRETS_MASTER_KEY=<production-secret-master-key> \
LLM_API_KEY=<production-llm-key> \
JWT_SECRET=<production-jwt-secret> \
NEXT_PUBLIC_WEB_ENV=production \
NEXT_PUBLIC_API_BASE_URL=https://<api-domain>/api \
npm run compose:prod:config
```

## 标准上线流程

1. 确认 CI 通过。
2. 确认 Web/API 镜像 tag。
3. 确认环境变量 profile。
4. 在 staging 执行数据库迁移。
5. 在 staging 部署 API。
6. 在 staging 部署 Web。
7. 执行 Web smoke test。
8. 验证 Agent Chat SSE streaming。
9. 检查 audit / trace / readiness。
10. 将相同镜像 promotion 到 production。
11. 生产部署后先小流量或内部用户验证。
12. 完成观察窗口后扩大流量。

本地 production compose 演练：

```bash
npm run compose:prod:up
```

停止：

```bash
npm run compose:prod:down
```

## Web 健康检查

Web 容器 healthcheck 当前检查：

```text
http://127.0.0.1:3001/login
```

手动检查：

```bash
curl -fsS http://localhost:3001/login
```

API readiness：

```bash
curl -fsS http://localhost:3000/api/health/ready
```

OpenAPI：

```bash
curl -fsS http://localhost:3000/api/docs/openapi.json
```

浏览器检查：

- 打开 Web 首页。
- Dashboard 显示 API readiness。
- Dashboard Web profile 显示 `production`。
- Dashboard 没有 production 指向 localhost API 的 warning。
- Login 页面可打开。
- 登录后菜单按权限裁剪。

## Web Smoke Test

自动化 smoke：

```bash
npm run test:e2e:web
```

核心手工 smoke：

1. 打开 `/login`。
2. 使用受治理的 API key 或 service token 交换 Web session。
3. 打开 `/`，确认 API / DB / Vector 状态。
4. 打开 `/agent-chat`，发送一次 streaming 请求。
5. 打开 `/tools`，执行 calculator。
6. 打开 `/knowledge`，执行检索。
7. 打开 `/security`，确认 roles / audit / anomaly 可读。
8. 打开 `/evaluations`，确认 cases / runs 可读。
9. 打开 `/observability`，确认 trace events 可读。
10. 打开 `/workflows`，确认 scheduler 状态可读。

## 回滚流程

### Web 应用回滚

1. 保留上一版 Web 镜像 tag。
2. 将 Web service 切回上一版镜像。
3. 确认 `NEXT_PUBLIC_*` build args 与上一版镜像一致。
4. 等待 `/login` healthcheck 通过。
5. 执行 Dashboard / Login / Agent Chat smoke。
6. 观察 Web logs、API trace、浏览器错误。

### API 兼容性回滚

Web 回滚前确认：

- 上一版 Web 与当前 API schema 兼容。
- Auth login / refresh / me 接口兼容。
- Agent Chat streaming SSE event 结构兼容。
- 权限名称和菜单裁剪逻辑兼容。

如果 API 也需要回滚，遵循 `docs/deployment-runbook.md` 的数据库回滚要求，优先向前修复 migration，避免直接 down migration。

## 常见故障排查

### Web 无法启动

检查：

- `NODE_ENV=production`
- `PORT=3001`
- `HOSTNAME=0.0.0.0`
- Next standalone 产物是否存在
- 容器是否以非 root 用户运行

命令：

```bash
docker logs enterprise-agent-web --tail 100
```

### 页面访问 404 或空白

检查：

- Web 镜像是否完成 `npm run build:web`
- `.next/static` 是否复制到 runtime image
- 反向代理 path rewrite 是否正确
- 浏览器 console 是否有 chunk 加载失败

### Dashboard API 失败

检查：

- `NEXT_PUBLIC_API_BASE_URL` 是否是浏览器可访问地址
- API `/api/health/ready` 是否通过
- API CORS 是否允许 Web 域名
- 网络代理是否阻断浏览器请求

### 登录失败

检查：

- API `/api/auth/console/login`
- `JWT_SECRET`
- service token 是否存在、启用、未过期
- API key / service token tenant 是否匹配
- 浏览器 localStorage session 是否过期

### Agent Chat streaming 卡住

检查：

- API `POST /api/agent/run/stream`
- 反向代理是否支持 SSE
- 是否关闭响应缓冲
- 代理 idle timeout 是否足够
- Web 客户端 idle timeout 当前为 `45s`

Nginx 类代理重点确认：

```text
proxy_buffering off
proxy_read_timeout >= 120s
```

### 权限菜单缺失

检查：

- `/api/auth/console/me` 返回的 permissions
- refresh token 续期后的 session permissions snapshot
- 角色是否包含对应权限
- 是否使用了低权限 API key / service token

## 发布后观察项

观察窗口建议至少 30-60 分钟。

Web 观察：

- Web container restart count
- `/login` healthcheck
- 页面错误率
- 浏览器 console error 采样
- Agent Chat streaming 成功率
- 登录成功率和 refresh 成功率

API / Agent 观察：

- `/api/health/ready`
- trace events
- auth audit events
- security anomalies
- rate limit / quota events
- tool execution error rate
- RAG retrieval latency
- indexing worker alerts
- workflow schedule runs
- evaluation run failures

基础设施观察：

- PostgreSQL connections / latency
- Redis availability
- Qdrant health
- LLM provider latency / error rate
- ingress / reverse proxy 5xx

## 退出标准

一次 Web 生产发布可认为完成，需要满足：

- Web healthcheck 持续通过。
- API readiness 持续通过。
- Web smoke test 通过。
- Agent Chat streaming 通过。
- 登录 / refresh / logout 正常。
- 无新增 critical security anomaly。
- 无持续 5xx 或明显错误率上升。
- 观察窗口结束后无阻断问题。

## 后续增强

- 镜像推送 registry。
- SBOM / vulnerability scan。
- signed image / provenance。
- 蓝绿 / 金丝雀发布。
- 合成监控定时执行 Web smoke。
- 接入前端错误上报。
