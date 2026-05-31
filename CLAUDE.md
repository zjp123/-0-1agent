# Agent 从0到1

## 技术栈
- 运行环境: Node.js v22+
- 语言: JavaScript (ES Module)
- LLM: DeepSeek (OpenAI 兼容接口)
- SDK: openai npm 包
- Web: Express + SSE 流式推送

## 项目结构
```
agent.js          —— 第1步：流式对话
agent-tools.js    —— 第2步：工具调用
agent-memory.js   —— 第3步：多轮记忆
agent-store.js    —— 第4步：持久化+压缩
agent-rag.js      —— 第5步：联网搜索+知识库
agent-server.js   —— 第6步：Web 服务器 ⭐ 当前
public/
  index.html      —— 聊天界面
knowledge/        —— 本地知识库文件
.agent-memory/    —— 分层记忆存储
docs/             —— 文档
```

## 常用命令
```bash
npm run web                       # 第6步：启动 Web 界面 ⭐
node agent-rag.js                 # 第5步：命令行交互
node agent.js "你好"              # 第1步：单次对话
node agent-tools.js "现在几点"    # 第2步：工具调用
```

## 架构（当前进度：第6步 — Web 界面）
```
浏览器 (public/index.html)
    ↓ HTTP + SSE（流式）
Express 服务器 (agent-server.js)
    ↓
DeepSeek API
    ↓
工具执行（联网搜索 / 知识库 / 计算 / 天气 / 时间）
    ↓
流式推回浏览器
```
