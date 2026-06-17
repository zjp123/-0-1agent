# Web Console Docker / CI/CD

## 目标

完成 Web Console Phase 14，让 Web 可以被标准化构建、镜像化部署，并纳入 CI/CD 基线。

## 新增文件

```text
apps/web/Dockerfile
```

## 修改文件

```text
package.json
infra/docker-compose.prod.yml
.github/workflows/ci.yml
docs/web-console-task-checklist.md
docs/enterprise-upgrade-remaining-tasks.md
```

## Web Dockerfile

路径：

```text
apps/web/Dockerfile
```

构建阶段：

1. `deps`: 安装 workspace dev dependencies。
2. `build`: 执行 `npm run build:web`，生成 Next.js standalone 产物。
3. `runtime`: 使用 `node:22-alpine`，非 root 用户运行 `apps/web/server.js`。

运行配置：

```text
NODE_ENV=production
PORT=3001
HOSTNAME=0.0.0.0
NEXT_PUBLIC_API_BASE_URL=<browser-visible-api-url>
```

镜像暴露端口：

```text
3001
```

## 根脚本

新增：

```bash
npm run docker:build:web
```

等价于：

```bash
docker build -f apps/web/Dockerfile -t enterprise-agent-web:local .
```

## Production Compose

路径：

```text
infra/docker-compose.prod.yml
```

新增服务：

```text
web
```

Web 服务能力：

- build `apps/web/Dockerfile`
- image `enterprise-agent-web:local`
- container `enterprise-agent-web`
- 端口映射 `${WEB_PORT:-3001}:3001`
- 等待 API healthcheck ready
- healthcheck 检查 `/login`
- `restart: unless-stopped`

默认 API 地址：

```text
NEXT_PUBLIC_API_BASE_URL=http://localhost:3000/api
```

说明：

- 该变量会进入浏览器 bundle，应填写浏览器可访问的 API 地址。
- 本地 compose 使用 `localhost:3000`。
- 生产环境应替换成真实 API 域名，例如 `https://api.example.com/api`。
- 不得把密钥写入 `NEXT_PUBLIC_` 变量。

## CI

路径：

```text
.github/workflows/ci.yml
```

新增步骤：

```text
Web type check -> npm run check:web
Web build      -> npm run build:web
Web Docker build -> docker build -f apps/web/Dockerfile -t enterprise-agent-web:ci .
```

CI 当前覆盖：

- API type check
- Web type check
- API tests
- OpenAPI export
- API build
- Web build
- migration generation check
- API Docker build
- Web Docker build
- API production image startup smoke

## 当前边界

已完成：

- Web Dockerfile。
- Web production runtime 配置。
- Web 接入 production compose。
- Web healthcheck。
- `check:web` 接入 CI。
- `build:web` 接入 CI。
- Web Docker image build 接入 CI。
- 本地 compose config 验证。

未完成：

- 本地实际 Docker image build。
- Web container startup smoke。
- 镜像推送 registry。
- SBOM / vulnerability scan。
- signed image / provenance。
- 多环境 promotion。

## 验证

Web type check：

```bash
PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH npm run check:web
```

结果：

```text
passed
```

API type check：

```bash
PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH npm run check -w @enterprise-agent/api
```

结果：

```text
passed
```

Web build：

```bash
PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH \
npm run build:web
```

结果：

```text
passed
```

Production compose config：

```bash
PATH=/usr/local/bin:/opt/homebrew/bin:/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH \
POSTGRES_PASSWORD=agent_password \
SECRETS_MASTER_KEY=development-only-secret-master-key-change-me \
LLM_API_KEY=local-dev-placeholder \
API_KEY=dev-api-key \
JWT_SECRET=development-only-jwt-secret-change-me \
SERVICE_TOKEN=local-admin-service-token \
npm run compose:prod:config
```

结果：

```text
passed
```
