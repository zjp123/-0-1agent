# Web Console Environment Config

## 目标

记录 Web Console 本地、测试、生产环境需要关注的配置项，避免环境差异导致排查困难。

## Node.js

项目要求：

```text
node >= 22
npm >= 10
```

当前根目录已在 `package.json` 中声明 engines。

## Web 运行地址

开发模式：

```bash
npm run dev:web
```

默认地址：

```text
http://localhost:3001
```

## API 地址

Web 通过公开环境变量连接 API：

```text
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3000/api
```

该变量必须满足：

- 使用绝对 `http` 或 `https` URL。
- 以 `/api` 结尾。
- 浏览器可以直接访问。

本地建议：

```text
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:3000/api
```

生产建议：

```text
NEXT_PUBLIC_WEB_ENV=production
NEXT_PUBLIC_API_BASE_URL=https://<api-domain>/api
```

注意：

- `NEXT_PUBLIC_` 变量会进入浏览器 bundle，不得放入任何密钥。
- API key、service token、JWT secret、数据库密码、LLM key 不得出现在 Web public env 中。
- 生产环境不得使用 `local-admin-service-token`。
- `NEXT_PUBLIC_*` 通常在 Next.js build 阶段固化到浏览器 bundle，Docker build args 与 runtime env 应保持一致。

## Web Profile

Web 使用公开 profile 标识当前环境：

```text
NEXT_PUBLIC_WEB_ENV=local
```

允许值：

- `local`
- `development`
- `staging`
- `production`
- `test`

Dashboard 会展示当前 Web profile。若 `production` profile 指向 localhost API，页面会显示配置告警。

## 本地 Service Token

本地受保护接口可使用：

```http
x-service-token: local-admin-service-token
```

仅用于本地开发和联调，不得用于生产。

## Streaming

Agent Chat 当前客户端保护参数：

```text
total timeout: 120s
idle timeout: 45s
```

生产部署时需要确保：

- API 网关允许 SSE。
- 反向代理关闭响应缓冲或对 SSE 做专门配置。
- 代理 idle timeout 大于 Web 客户端 idle timeout 或按平台策略统一设置。

## 当前 Codex macOS 构建注意事项

当前本地 Codex Node 环境存在 macOS 原生模块签名限制。Web 已使用：

```bash
next dev --webpack -p 3001
next build --webpack
@next/swc-wasm-nodejs
```

本地构建推荐：

```bash
PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH \
NEXT_TEST_WASM_DIR=/Users/bjsttlp406/others/-0-1agent/node_modules/@next/swc-wasm-nodejs \
npm run build:web
```

CI / 生产容器建议使用 Linux Node.js 22 镜像重新验证。
