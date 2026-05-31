/**
 * Agent 从0到1 —— 第4步：持久化存储 + 上下文管理
 *
 * 核心变化：
 *   第3步：记忆在内存（关了就没了）
 *   第4步：记忆存到文件 + 太长了自动压缩
 *
 * 两个新能力：
 *   1. 持久化：对话保存到 .agent-memory.json，关了再开继续聊
 *   2. 上下文管理：消息太多时，把旧对话压缩成摘要，省 token 省钱
 */
import OpenAI from "openai";
import * as readline from "node:readline";
import * as fs from "node:fs";
import * as path from "node:path";
import "dotenv/config";

const client = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY,
});

const MEMORY_FILE = path.join(process.cwd(), ".agent-memory.json");
const MAX_RECENT = 20; // 最近 N 条消息保留原文
const SUMMARIZE_AT = 30; // 消息超过这个数就触发压缩

// =========================================================================
// 🛠️ 工具（同第3步）
// =========================================================================
const TOOLS = [
  { name: "getCurrentTime", description: "获取当前时间", parameters: {} },
  { name: "getWeather", description: "查询指定城市的天气", parameters: { city: "城市名称" } },
  {
    name: "calculator",
    description: "执行数学计算",
    parameters: { expression: "数学表达式" },
  },
];

const toolImplementations = {
  getCurrentTime() {
    return new Date().toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "long",
    });
  },
  getWeather({ city }) {
    const w = ["晴朗 ☀️ 22°C", "多云 ⛅ 18°C", "小雨 🌧️ 15°C", "阴天 ☁️ 20°C"];
    const idx = [...city].reduce((s, c) => s + c.charCodeAt(0), 0);
    return `${city}天气：${w[idx % w.length]}`;
  },
  calculator({ expression }) {
    try {
      if (!/^[\d+\-*/().%\s]+$/.test(expression)) return "表达式不安全";
      return `${expression} = ${eval(expression)}`;
    } catch (e) { return `计算错误：${e.message}`; }
  },
};

// =========================================================================
// 💾 持久化：存盘和读盘
// =========================================================================
function saveMemory(messages) {
  fs.writeFileSync(MEMORY_FILE, JSON.stringify(messages, null, 2), "utf-8");
}

function loadMemory() {
  if (fs.existsSync(MEMORY_FILE)) {
    try {
      return JSON.parse(fs.readFileSync(MEMORY_FILE, "utf-8"));
    } catch {
      return null;
    }
  }
  return null;
}

// =========================================================================
// 📦 上下文管理：太长了就压缩
// =========================================================================
async function summarizeIfNeeded(messages) {
  const nonSystem = messages.filter((m) => m.role !== "system");
  if (nonSystem.length <= SUMMARIZE_AT) return messages; // 还没到阈值

  // 需要压缩的消息：从第1条（跳过system prompt）到倒数 MAX_RECENT 条
  const systemPrompt = messages[0];
  const oldMessages = nonSystem.slice(0, nonSystem.length - MAX_RECENT);
  const recentMessages = nonSystem.slice(-MAX_RECENT);

  // 把旧消息格式化成一段文字，让 LLM 提取关键信息
  const oldText = oldMessages
    .map((m) => {
      const role = { user: "用户", assistant: "助手", tool: "工具结果" }[m.role] || m.role;
      const content = m.content || `[调用工具: ${m.tool_call_id}]` || "";
      return `${role}: ${content.slice(0, 200)}`;
    })
    .join("\n");

  const resp = await client.chat.completions.create({
    model: "deepseek-chat",
    messages: [
      {
        role: "system",
        content:
          "请把以下对话历史压缩成一段摘要（不超过200字），包含：用户是谁、讨论了什么话题、做了哪些重要操作、有什么结论。只输出摘要本身。",
      },
      { role: "user", content: oldText },
    ],
    max_tokens: 400,
    temperature: 0,
  });

  const summary = resp.choices[0].message.content;

  // 新结构：system prompt + 摘要 + 最近的消息
  return [
    systemPrompt,
    { role: "system", content: `📋 [对话历史摘要] ${summary}` },
    ...recentMessages,
  ];
}

// =========================================================================
// 🤖 Agent 核心
// =========================================================================
async function chat(messages, userInput) {
  messages.push({ role: "user", content: userInput });

  // 第1轮：发完整上下文 + 工具清单
  let response = await client.chat.completions.create({
    model: "deepseek-chat",
    messages,
    tools: TOOLS.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: {
          type: "object",
          properties: Object.fromEntries(
            Object.entries(t.parameters).map(([k, d]) => [k, { type: "string", description: d }])
          ),
          required: Object.keys(t.parameters),
        },
      },
    })),
  });

  const msg = response.choices[0].message;

  // 不需要工具 → 直接回答
  if (!msg.tool_calls || msg.tool_calls.length === 0) {
    messages.push({ role: "assistant", content: msg.content });
    return { type: "text", content: msg.content };
  }

  // 需要工具 → 执行 → 再问 LLM
  const toolMessages = [];
  for (const call of msg.tool_calls) {
    const fnName = call.function.name;
    const fnArgs = JSON.parse(call.function.arguments || "{}");
    const result = toolImplementations[fnName](fnArgs);
    toolMessages.push({ role: "tool", tool_call_id: call.id, content: result });
  }

  messages.push(msg);
  messages.push(...toolMessages);

  response = await client.chat.completions.create({
    model: "deepseek-chat",
    messages,
  });

  const finalAnswer = response.choices[0].message.content;
  messages.push({ role: "assistant", content: finalAnswer });
  return { type: "text", content: finalAnswer };
}

// =========================================================================
// 🚀 启动
// =========================================================================
const SYSTEM_PROMPT = {
  role: "system",
  content: "你是一个有用的 AI 助手。可以调用工具获取实时信息（时间、天气）或进行计算。请用中文回答，尽量简洁友好。",
};

let messages = loadMemory(); // ← 尝试读盘
let isNew = false;

if (messages && messages.length > 1) {
  // 有历史记录 → 恢复
  console.log("📂 从上次的对话中恢复...");
  const userMsgs = messages.filter((m) => m.role === "user");
  if (userMsgs.length > 0) {
    console.log(`   上次聊了 ${userMsgs.length} 轮，最后你说：「${userMsgs[userMsgs.length - 1].content.slice(0, 50)}」`);
  }
} else {
  // 新对话
  messages = [SYSTEM_PROMPT, { role: "assistant", content: "你好！有什么我可以帮你的？" }];
  isNew = true;
  saveMemory(messages);
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "🧑 你: ",
});

console.log("=".repeat(55));
console.log(`🤖 Agent（持久化版）已启动`);
if (!isNew) console.log("   💡 输入 /summary 查看压缩后的上下文");
console.log("   命令: /exit 退出  /memory 看记忆  /summary 看摘要  /clear 清除记忆");
console.log("=".repeat(55));
console.log();

if (isNew) {
  process.stdout.write("🤖 Agent: 你好！有什么我可以帮你的？\n");
}
rl.prompt();

rl.on("line", async (line) => {
  const input = line.trim();
  if (!input) { rl.prompt(); return; }

  // ── 命令处理 ──
  if (input === "/exit") {
    saveMemory(messages);
    console.log("💾 记忆已保存。👋 再见！");
    rl.close();
    return;
  }

  if (input === "/clear") {
    messages.length = 0;
    messages.push(SYSTEM_PROMPT);
    messages.push({ role: "assistant", content: "记忆已清除。有什么可以帮你的？" });
    saveMemory(messages);
    console.log("🗑️  记忆已清除！");
    rl.prompt();
    return;
  }

  if (input === "/memory") {
    const count = messages.filter((m) => m.role !== "system").length;
    console.log(`  📋 记忆中共 ${count} 条消息，文件: ${MEMORY_FILE}`);
    console.log(`  💡 超过 ${SUMMARIZE_AT} 条会自动压缩旧消息为摘要`);
    rl.prompt();
    return;
  }

  if (input === "/summary") {
    for (const m of messages) {
      if (m.role === "system") {
        const preview = m.content.slice(0, 100);
        console.log(`  [${m.role}] ${preview}${m.content.length > 99 ? "..." : ""}`);
      }
    }
    rl.prompt();
    return;
  }

  // ── 正常对话 ──
  const result = await chat(messages, input);
  process.stdout.write(`🤖 Agent: ${result.content}\n`);

  // 上下文管理：消息太多就压缩
  const before = messages.length;
  messages = await summarizeIfNeeded(messages);
  if (messages.length < before) {
    console.log("  📦 (旧消息已自动压缩为摘要)");
  }

  // 每次对话后存盘
  saveMemory(messages);
  rl.prompt();
});

rl.on("close", () => process.exit(0));
