# Web Console Production Hardening

## 目标

完成 Web Console Phase 12 生产化增强，让控制台从基础联调版本提升到可持续演进的生产应用基础形态。

## 实现内容

### 统一错误边界

新增 Next.js App Router 全局错误页：

- `apps/web/src/app/error.tsx`

能力：

- 捕获路由运行时错误。
- 展示一致的错误状态。
- 支持用户点击 Retry 重新渲染当前视图。
- 在浏览器 console 保留原始错误，方便排查。

### 统一 Toast / Notification

新增全局通知组件：

- `apps/web/src/components/notifications/toast-provider.tsx`

能力：

- `notify({ title, message, tone })` 事件式调用。
- 支持 `success`、`warning`、`danger`、`neutral` 四种语义。
- 自动关闭和手动关闭。
- 通过 `aria-live="polite"` 支持辅助技术读取。

当前已接入：

- Agent Chat streaming 失败通知。

### 请求超时与重试

增强 Web API client：

- `apps/web/src/lib/api/client.ts`

策略：

- JSON API 默认请求超时：`15s`。
- GET 请求默认重试：`2` 次。
- 非 GET 请求默认不自动重试，避免重复写入。
- 仅对网络错误或 `5xx` 响应做重试。
- 外部 `AbortSignal` 会联动内部超时控制。

### Streaming 断线与超时保护

增强 `runAgentStream()`：

- 总超时：`120s`。
- idle 超时：`45s`。
- 外部取消信号和内部超时信号统一收敛到 `AbortController`。
- Agent Chat 将超时、idle timeout、断线错误转换为用户可理解的提示。

### 前端权限视图控制

新增权限提示组件：

- `apps/web/src/components/auth/protected-operation-hint.tsx`

策略：

- Web 端不伪造 RBAC 登录态。
- 当前阶段根据本地 API key / service token 是否存在展示受保护操作状态。
- 所有权限仍由 API 服务端最终强制执行。
- 组件会展示当前操作需要的权限，例如 `agent:run`。

当前已接入：

- Agent Chat Auth 面板。

## 样式补充

更新：

- `apps/web/src/app/globals.css`

新增样式：

- `.toast-region`
- `.toast`
- `.toast-success`
- `.toast-warning`
- `.toast-danger`
- `.toast-neutral`
- `.toast-icon`
- `.toast-body`
- `.toast-title`
- `.toast-message`
- `.toast-close`
- `.error-boundary`
- `.error-boundary-icon`
- `.permission-hint`
- `.permission-hint-ready`
- `.permission-hint-blocked`

## 生产边界

当前 Phase 12 解决的是 Web Console 的客户端生产化基础能力：

- 页面级错误兜底。
- API 请求超时和安全重试。
- Streaming 长连接保护。
- 操作前权限提示。
- 用户可见通知系统。

未在本阶段实现：

- 完整登录系统。
- 浏览器会话持久化。
- 前端 RBAC 菜单裁剪。
- 服务端渲染阶段的用户权限注入。

这些能力应在后续 Auth / Identity 阶段继续建设。

## 验证命令

```bash
PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH npm run check:web
```

结果：

```text
passed
```

```bash
PATH=/Applications/Codex.app/Contents/Resources/cua_node/bin:$PATH \
npm run build:web
```

结果：

```text
passed
```

## 浏览器检查

访问：

```text
http://localhost:3001/agent-chat
```

检查结果：

- Agent Chat 页面可打开。
- 权限提示组件正常渲染。
- 移动宽度下无横向溢出。
- 页面无应用运行时 console error。
