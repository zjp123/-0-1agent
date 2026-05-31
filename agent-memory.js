/**
 * Agent 从0到1 —— 第3步：多轮记忆
 *
 * 核心变化：
 *   第1步：每次对话是独立的，Agent 不记得上一句话
 *   第2步：同上，只是多了工具调用能力
 *   第3步：维护一个 messages[] 数组，把整段对话历史发给 LLM
 *
 * 原理一句话：LLM 自己没有记忆，但我们每次把「完整聊天记录」塞给它，
 * 它就「看起来」像是记得所有事情。
 */
import OpenAI from "openai";
import * as readline from "node:readline";
import "dotenv/config";

const client = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY,
});

// =========================================================================
// 🔧 工具定义（同第2步）
// =========================================================================
const TOOLS = [
  {
    name: "getCurrentTime",
    description: "获取当前时间。当用户问「现在几点」「今天几号」时使用。",
    parameters: {},
  },
  {
    name: "getWeather",
    description: "查询指定城市的天气。",
    parameters: { city: "城市名称" },
  },
  {
    name: "calculator",
    description: "执行数学计算。",
    parameters: { expression: "数学表达式" },
  },
];

const toolImplementations = {
  getCurrentTime() {
    return new Date().toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      weekday: "long",
    });
  },
  getWeather({ city }) {
    const weathers = ["晴朗 ☀️ 22°C", "多云 ⛅ 18°C", "小雨 🌧️ 15°C", "阴天 ☁️ 20°C"];
    const idx = [...city].reduce((s, c) => s + c.charCodeAt(0), 0);
    return `${city}天气：${weathers[idx % weathers.length]}`;
  },
  calculator({ expression }) {
    try {
      if (!/^[\d+\-*/().%\s]+$/.test(expression)) return "表达式不安全";
      return `${expression} = ${eval(expression)}`;
    } catch (e) {
      return `计算错误：${e.message}`;
    }
  },
};

// =========================================================================
// 🧠 核心：记忆就是这一行 messages 数组
// =========================================================================
// Agent 的记忆 = 对话历史，每次对话往数组里追加，下次请求把整段历史发给 LLM
const messages = [
  {
    role: "system",
    content: "你是一个有用的 AI 助手。你可以调用工具获取实时信息（时间、天气）或进行计算。请用中文回答。",
  },
];

// =========================================================================
// 🤖 Agent 循环（记忆版）
// =========================================================================
async function chat(userInput) {
  // 第1步：把用户输入追加到记忆
  messages.push({ role: "user", content: userInput });

  // 第2步：把完整记忆 + 工具清单发给 LLM
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

  // 情况A：不需要工具 → 直接回答
  if (!msg.tool_calls || msg.tool_calls.length === 0) {
    messages.push({ role: "assistant", content: msg.content }); // 记住回答
    return { type: "text", content: msg.content };
  }

  // 情况B：需要工具 → 执行 → 把结果告诉 LLM → 拿到最终回答
  const toolMessages = [];
  for (const call of msg.tool_calls) {
    const fnName = call.function.name;
    const fnArgs = JSON.parse(call.function.arguments || "{}");
    const result = toolImplementations[fnName](fnArgs);
    toolMessages.push({ role: "tool", tool_call_id: call.id, content: result });
  }

  messages.push(msg); // 记住 LLM 的工具调用请求
  messages.push(...toolMessages); // 记住工具返回结果

  response = await client.chat.completions.create({
    model: "deepseek-chat",
    messages,
  });

  const finalAnswer = response.choices[0].message.content;
  messages.push({ role: "assistant", content: finalAnswer }); // 记住最终回答
  return { type: "text", content: finalAnswer };
}

// =========================================================================
// 💬 交互式命令行
// =========================================================================
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  prompt: "🧑 你: ",
});

console.log("=".repeat(50));
console.log("🤖 Agent（记忆版）已启动");
console.log("   - 我能记住你刚才说的一切");
console.log("   - 试试问「我刚才说了什么？」");
console.log("   - 输入 /exit 退出，/memory 查看记忆");
console.log("=".repeat(50));
console.log();

process.stdout.write("🤖 Agent: 你好！有什么我可以帮你的？\n");
messages.push({ role: "assistant", content: "你好！有什么我可以帮你的？" });

rl.prompt();

rl.on("line", async (line) => {
  const input = line.trim();
  if (!input) {
    rl.prompt();
    return;
  }

  if (input === "/exit") {
    console.log("👋 再见！");
    rl.close();
    return;
  }

  if (input === "/memory") {
    const count = messages.filter((m) => m.role !== "system").length;
    console.log(`  📋 记忆中共 ${count} 条消息（不含 system prompt）：`);
    for (const m of messages) {
      if (m.role === "system") continue;
      const preview = (m.content || m.tool_call_id || "").slice(0, 60);
      console.log(`    [${m.role}] ${preview}${preview.length > 59 ? "..." : ""}`);
    }
    rl.prompt();
    return;
  }

  // 流式输出
  const result = await chat(input);
  if (result.type === "text") {
    process.stdout.write(`🤖 Agent: ${result.content}\n`);
  }
  rl.prompt();
});

rl.on("close", () => process.exit(0));
