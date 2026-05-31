# 第 6 步：Web 界面

## 这步解决了什么问题

前 5 步的 Agent 都在命令行里运行。第 6 步让它走进浏览器：

```
之前：黑色终端，打字交互，只有你能用
之后：网页界面，点按钮或打字，可以分享给别人用
```

---

## 架构

```
┌─────────────────────┐
│   浏览器 (HTML/JS)   │
│   public/index.html  │
└────────┬────────────┘
         │ HTTP + SSE（流式）
         ↓
┌─────────────────────┐
│   Express 服务器     │
│   agent-server.js    │
│                     │
│   POST /api/chat    │ ← 聊天接口（SSE 流式返回）
│   GET  /api/sessions│ ← 对话历史列表
│   DELETE /api/sessions/:id │ ← 删除对话
└────────┬────────────┘
         │
         ↓
┌─────────────────────┐
│   DeepSeek API      │
└─────────────────────┘
```

### 为什么用 SSE 而不是 WebSocket？

- SSE（Server-Sent Events）更简单：单向推送，一行代码
- 聊天场景天然适合 SSE：服务器推送给客户端
- WebSocket 需要双向通信，聊天只需要服务器→客户端

---

## 新增内容

| 文件 | 作用 |
|------|------|
| `agent-server.js` | Express 后端，处理聊天请求，SSE 流式推送 |
| `public/index.html` | 前端聊天界面，纯 HTML/CSS/JS |
| `package.json` | 新增 express 依赖，新增 `npm run web` 命令 |

---

## 运行

```bash
# 启动服务器
node agent-server.js
```

打开浏览器，访问 **http://localhost:3000**

### 界面功能

- 💬 聊天：输入消息，Enter 发送
- 🌊 流式输出：回复逐字显示
- 🔧 工具调用：联网搜索、计算等过程可视化
- 📋 对话记录：查看和切换历史对话
- ✨ 新对话：一键开始新会话
- 🗑️ 删除对话：清理不需要的记录
- 📱 响应式：手机和电脑都能用

---

## 关键代码

### SSE 流式推送

```javascript
// 后端：把事件逐个推给浏览器
res.writeHead(200, { "Content-Type": "text/event-stream" });

for await (const event of processMessage(messages)) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}
res.end();
```

### 前端：接收流式事件

```javascript
const reader = resp.body.getReader();
while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  // 解析 SSE 事件，实时显示文本、工具调用等
}
```

### 事件类型

| 事件 | 含义 | UI 表现 |
|------|------|--------|
| `start` | 开始生成回答 | 移除加载动画 |
| `text` | 流式文本片段 | 逐字追加到气泡 |
| `tool_start` | 开始调用工具 | 显示工具卡片 |
| `tool_result` | 工具返回结果 | 卡片中显示结果 |
| `generating` | 工具调用完毕，开始生成文本 | — |
| `done` | 回答完成 | 移除流式样式 |
| `error` | 出错 | 显示错误信息 |

---

## 你学到了什么

1. **Express**：最流行的 Node.js Web 框架
2. **SSE**：Server-Sent Events，服务器推送技术，比 WebSocket 更简单
3. **前后端分离**：前端（HTML/JS）和后端（Express）通过 HTTP API 通信
4. **流式 UI**：用 `ReadableStream` 和 SSE 实现实时打字效果

---

## 下一步

第 7 步：部署上线
- 把这个服务部署到互联网
- 别人通过一个 URL 就能访问
- 真正的「从 0 到 1」最后一步
