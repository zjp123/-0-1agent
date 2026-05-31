# 第 4 步：持久化存储 + 上下文管理

## 这步解决了两个问题

| 问题 | 第3步的状态 | 第4步的解法 |
|------|-----------|-----------|
| 关了重开就失忆 | `messages[]` 只在内存，进程结束就消失 | **存到文件**（`.agent-memory.json`），启动时读回 |
| 聊太长了费钱 | 每轮把所有历史发给 LLM，token 越用越多 | **自动压缩**：旧对话压缩成摘要，省 token |

---

## 核心概念

### 1. 持久化 —— 把记忆写入硬盘

```
每轮对话结束后：
  messages[]  ──→  JSON.stringify  ──→  .agent-memory.json

下次启动时：
  .agent-memory.json  ──→  JSON.parse  ──→  messages[]
```

做法非常简单：内存里的数组 → 写到文件。下次打开 → 读回数组。

### 2. 上下文管理 —— 旧消息自动压缩

```
消息数 ≤ 30 条：
  [system] [user] [assistant] [user] [assistant] ...  全部保留原文

消息数 > 30 条：
  [system] [📋 摘要: "用户叫小明，是程序员。讨论了天气和3次数学计算..."]
  [user] [assistant] ... (最近20条保留原文)

这样 token 不会无限增长，但关键信息不丢。
```

---

## 关键代码

### 存和读

```javascript
const MEMORY_FILE = ".agent-memory.json";

// 存
function saveMemory(messages) {
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(messages, null, 2));
}

// 读
function loadMemory() {
  if (fs.existsSync(MEMORY_FILE)) {
    return JSON.parse(fs.readFileSync(MEMORY_FILE, "utf-8"));
  }
  return null; // 第一次启动，没有记录
}
```

### 压缩

```javascript
async function summarizeIfNeeded(messages) {
  if (messages.length <= SUMMARIZE_AT) return messages;

  const oldOnes = messages.slice(1, -MAX_RECENT);    // 太旧的部分
  const recentOnes = messages.slice(-MAX_RECENT);     // 最近20条

  // 让 LLM 把旧消息压缩成一段话
  const summary = await askLLM("把这段对话历史压缩成摘要...", oldOnes);

  return [messages[0], { role: "system", content: summary }, ...recentOnes];
}
```

---

## 运行

```bash
node agent-store.js
```

### 试试这个流程

```
🧑 你: 我叫小明，我是前端程序员
🤖 Agent: 你好小明！

🧑 你: 帮我算 1024 * 768
🤖 Agent: ...

🧑 你: 查询一下杭州的天气
🤖 Agent: ...

🧑 你: /exit              ← 关掉
💾 记忆已保存。

# ── 过一会儿，重新打开 ──

$ node agent-store.js
📂 从上次的对话中恢复...
   上次聊了 3 轮，最后你说：「查询一下杭州的天气」
🤖 Agent（持久化版）已启动

🧑 你: 还记得我叫什么吗？
🤖 Agent: 当然记得！你叫小明，是前端程序员。上次我们还查了杭州天气...
```

### 可用命令

| 命令 | 作用 |
|------|------|
| `/exit` | 保存记忆并退出 |
| `/memory` | 查看记忆统计 |
| `/summary` | 查看摘要（如果有压缩过） |
| `/clear` | 清除所有记忆，重新开始 |

---

## 和前面几步的关系

| 步骤 | 新增能力 | 记忆持久？ | 会自动压缩？ |
|------|---------|----------|------------|
| agent.js | 流式对话 | ❌ | ❌ |
| agent-tools.js | 工具调用 | ❌ | ❌ |
| agent-memory.js | 多轮记忆 | ❌ | ❌ |
| **agent-store.js** | **持久化+压缩** | **✅** | **✅** |

---

## 你学到了什么

1. **持久化** = 把 `messages[]` 序列化成 JSON 文件，启动时读回来。简单但关键。
2. **上下文窗口管理** = 用「摘要」代替「原文」，让 token 不随对话长度无限增长。
3. 这其实是 ChatGPT、Claude 等产品背后都在用的方案——它们处理长对话时，也是在后台做压缩。

---

## 当前架构

```
🧑 用户输入
    ↓
messages[]（记忆数组，启动时从文件读）
    ↓
[太长？] → 是 → LLM 压缩旧消息为摘要
    ↓ 否
发完整上下文 + 工具清单 → DeepSeek
    ↓
LLM 返回（可能需要调工具 → 执行 → 再问 LLM）
    ↓
回答追加到 messages[]
    ↓
messages[] 写入 .agent-memory.json（持久化）
```

## 下一步

第 5 步：联网搜索 + 知识库（RAG）
- 让 Agent 能搜索互联网，打破 LLM 知识截止日期的限制
- 让 Agent 能读取你的本地文件（PDF、Markdown、代码等）
