# 第 3 步：多轮记忆

## 这步解决了什么问题

前两步的 Agent 每次对话都是「失忆」的——你问完天气，再问「我刚才问了什么？」，它完全不记得。

第 3 步的核心：**让 Agent 记住整段对话**。

## 核心概念

### LLM 本身没有记忆

大模型自己不存储任何对话历史。它就像一个人，每次回答时，你需要把之前聊过的所有内容重新「读」给它听。

### 解决方案：messages 数组

```javascript
// 这就是 Agent 的「记忆」
const messages = [
  { role: "system", content: "你是一个有用的助手" },  // 人设
  { role: "user",   content: "北京天气怎么样？" },     // 第1轮
  { role: "assistant", content: "北京今天阴天 20°C" }, // 第1轮回答
  { role: "user",   content: "那上海呢？" },           // 第2轮 ← Agent 知道「那」指天气
  // ... 每轮对话不断追加
];
```

### 每次请求做什么

```
1. 收到用户输入 → push 到 messages
2. 把整段 messages 发给 LLM（让 LLM「看到」全部历史）
3. LLM 返回回答 → push 到 messages
4. 下一轮重复...
```

## 关键代码

```javascript
// 记忆就是一个数组
const messages = [
  { role: "system", content: "你是一个有用的 AI 助手。" },
];

async function chat(userInput) {
  // 1. 用户输入追加到记忆
  messages.push({ role: "user", content: userInput });

  // 2. 把整段记忆发给 LLM
  const response = await client.chat.completions.create({
    model: "deepseek-chat",
    messages,  // ← 整段历史，不是只有最新的
    tools: [...],
  });

  // 3. LLM 的回答也记下来
  const answer = response.choices[0].message.content;
  messages.push({ role: "assistant", content: answer });

  return answer;
}
```

## 运行

```bash
node agent-memory.js
```

你会进入一个交互式对话界面。试试这些命令：

```
🧑 你: 北京天气怎么样？
🧑 你: 我刚才问了什么？        ← 试试记忆
🧑 你: 现在几点？
🧑 你: 帮我算 123 * 456
🧑 你: /memory                ← 查看记忆内容
🧑 你: /exit                  ← 退出
```

## 和前面几步的关系

| 步骤 | 能力 | 记忆 |
|------|------|------|
| agent.js | 流式对话 | ❌ 失忆 |
| agent-tools.js | 工具调用 | ❌ 失忆 |
| **agent-memory.js** | 流式 + 工具 | ✅ 记住历史 |

## 你学到了什么

- `messages` 数组 = Agent 的「短期记忆」
- 每一轮对话往数组里追加，不断增长
- LLM 通过「看完整聊天记录」来理解上下文
- 这是所有 Agent 框架（LangChain、OpenAI Assistants）的基础原理

## 下一步是什么

短期记忆的局限：对话越长，发送的 token 越多（成本越高），而且可能超出模型的上下文窗口。

→ 第 4 步：上下文窗口管理（摘要、滑动窗口）
