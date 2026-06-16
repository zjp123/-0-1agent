# Web Console Deployment

## 目标

记录 Web Console 从本地构建到生产部署的基础流程，为后续容器化、CI/CD 和正式上线做准备。

## 构建前检查

```bash
npm install
```

```bash
npm run check:web
```

```bash
npm run build:web
```

API 同步检查：

```bash
npm run check
```

## 本地生产模式启动

构建后启动：

```bash
npm run start:web
```

默认地址：

```text
http://localhost:3001
```

## 环境变量

部署平台需要显式配置：

```text
NEXT_PUBLIC_API_BASE_URL=https://<api-domain>/api
```

不要把 API key、service token、数据库密码、LLM key 写入 `NEXT_PUBLIC_` 环境变量。

## 反向代理要求

Agent Chat 使用 SSE streaming。生产代理需要支持：

- HTTP streaming。
- 长连接。
- 禁用或降低响应缓冲。
- 合理的 idle timeout。
- CORS 与 API 域名策略一致。

Nginx 类代理需要重点检查：

```text
proxy_buffering off
proxy_read_timeout >= 120s
```

实际配置应以部署平台和安全策略为准。

## 推荐部署拓扑

```text
Browser
  -> Web Console (Next.js)
  -> API Gateway / Reverse Proxy
  -> Enterprise Agent API
  -> Postgres / Redis / Qdrant
```

生产中 Web 与 API 可以同域不同 path，也可以跨域部署。跨域部署时 API 需要允许 Web 域名的 CORS。

## 发布检查清单

- `npm run check:web` 通过。
- `npm run build:web` 通过。
- Web 可访问首页。
- `/agent-chat` 可正常打开。
- SSE streaming 不被代理缓冲。
- API readiness 返回 `ok`。
- 生产环境没有使用本地 `local-admin-service-token`。

## 后续增强

- 为 Web 新增 Dockerfile。
- 为 Web 新增 CI build job。
- 增加 Playwright e2e。
- 接入正式身份系统后增加服务端权限裁剪。

