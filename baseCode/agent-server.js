/**
 * Agent 从0到1 —— 第6步：Web 界面
 *
 * 从命令行走进浏览器！
 * 后端：Express.js + SSE 流式响应
 * 前端：public/index.html（纯 HTML/CSS/JS）
 */
import OpenAI from "openai";
import express from "express";
import * as fs from "node:fs";
import * as path from "node:path";
import "dotenv/config";

const app = express();
app.use(express.json());
app.use(express.static("public"));

const client = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY,
});

const MEMORY_DIR = path.join(process.cwd(), ".agent-memory");
const PROFILE_FILE = path.join(MEMORY_DIR, "profile.json");
const KNOWLEDGE_FILE = path.join(MEMORY_DIR, "knowledge.json");
const SESSIONS_DIR = path.join(MEMORY_DIR, "sessions");

// 初始化目录和文件
for (const d of [MEMORY_DIR, SESSIONS_DIR]) {
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
}
// 确保 profile 和 knowledge 文件存在
if (!fs.existsSync(PROFILE_FILE)) fs.writeFileSync(PROFILE_FILE, "{}");
if (!fs.existsSync(KNOWLEDGE_FILE)) fs.writeFileSync(KNOWLEDGE_FILE, "[]");

// =========================================================================
// 🛠️ 工具
// =========================================================================
const TOOLS = [
  { name: "getCurrentTime", description: "获取当前时间", parameters: {} },
  { name: "getWeather", description: "查询指定城市的天气", parameters: { city: "城市名称" } },
  { name: "calculator", description: "执行数学计算", parameters: { expression: "数学表达式" } },
  { name: "webSearch", description: "在网上搜索最新信息。需要实时信息、新闻、或不知道的内容时使用。", parameters: { query: "搜索关键词" } },
  { name: "searchKnowledge", description: "搜索本地知识库", parameters: { query: "搜索关键词" } },
  { name: "saveToKnowledge", description: "保存信息到知识库。用户说「记住这个」时使用。", parameters: { title: "标题", content: "内容", tags: "标签（可选）" } },
];

const toolImpl = {
  getCurrentTime: () =>
    new Date().toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai", year: "numeric", month: "2-digit",
      day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "long",
    }),
  getWeather: ({ city }) => {
    const w = ["晴朗 ☀️ 22°C", "多云 ⛅ 18°C", "小雨 🌧️ 15°C", "阴天 ☁️ 20°C"];
    return `${city}天气：${w[[...city].reduce((s, c) => s + c.charCodeAt(0), 0) % w.length]}`;
  },
  calculator: ({ expression }) => {
    try {
      if (!/^[\d+\-*/().%\s]+$/.test(expression)) return "表达式不安全";
      return `${expression} = ${eval(expression)}`;
    } catch (e) { return `错误：${e.message}`; }
  },
  webSearch: async ({ query }) => {
    const results = [];
    const q = encodeURIComponent(query);
    try {
      const resp = await fetch(`https://api.duckduckgo.com/?q=${q}&format=json&no_html=1&skip_disambig=1`, { signal: AbortSignal.timeout(8000) });
      const data = await resp.json();
      if (data.Abstract) results.push(data.Abstract);
      if (data.Answer) results.push(`💡 ${data.Answer}`);
      if (data.RelatedTopics?.length) {
        data.RelatedTopics.filter(t => t.Text).slice(0, 3).forEach(t => results.push(`• ${t.Text.replace(/<[^>]+>/g, "")}`));
      }
    } catch {}
    if (results.length === 0) {
      try {
        const wr = await fetch(`https://zh.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`, { headers: { "User-Agent": "AgentZero/1.0" } });
        if (wr.ok) { const w = await wr.json(); results.push(w.extract?.slice(0, 500) || "无结果"); }
      } catch {}
    }
    return results.join("\n") || `未找到「${query}」的结果`;
  },
  searchKnowledge: ({ query }) => {
    let items = [];
    try { items = JSON.parse(fs.readFileSync(KNOWLEDGE_FILE, "utf-8")); } catch {}
    const lines = [];
    const matched = items.filter(i =>
      query.toLowerCase().split(/\s+/).some(w => `${i.title} ${i.content}`.toLowerCase().includes(w))
    ).slice(0, 5);
    if (matched.length > 0) {
      lines.push(`知识库中找到 ${matched.length} 条：`);
      matched.forEach((i, n) => lines.push(`${n+1}. ${i.title}: ${i.content.slice(0, 200)}`));
    } else {
      lines.push("知识库中无匹配内容。");
    }
    return lines.join("\n");
  },
  saveToKnowledge: ({ title, content, tags }) => {
    let items = [];
    try { items = JSON.parse(fs.readFileSync(KNOWLEDGE_FILE, "utf-8")); } catch {}
    items.push({ title, content, tags: tags?.split(",").map(t => t.trim()).filter(Boolean) || [], date: new Date().toISOString().slice(0, 10) });
    fs.writeFileSync(KNOWLEDGE_FILE, JSON.stringify(items, null, 2));
    return `✅ 已保存「${title}」到知识库`;
  },
};

// =========================================================================
// 💬 核心：处理一条用户消息，返回流式事件
// =========================================================================
async function* processMessage(messages) {
  // 发送给 LLM
  let response = await client.chat.completions.create({
    model: "deepseek-chat",
    messages,
    tools: TOOLS.map(t => ({ type: "function", function: { name: t.name, description: t.description, parameters: { type: "object", properties: Object.fromEntries(Object.entries(t.parameters).map(([k, d]) => [k, { type: "string", description: d }])), required: Object.keys(t.parameters) } } })),
  });

  const msg = response.choices[0].message;

  // 不需要工具 → 流式输出文本
  if (!msg.tool_calls || msg.tool_calls.length === 0) {
    yield { type: "start" };

    const stream = await client.chat.completions.create({
      model: "deepseek-chat",
      messages,
      stream: true,
      max_tokens: 2048,
    });

    let fullText = "";
    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || "";
      if (text) {
        fullText += text;
        yield { type: "text", text };
      }
    }

    messages.push({ role: "assistant", content: fullText });
    yield { type: "done", messages };
    return;
  }

  // 需要工具 → 执行
  const toolMsgs = [];
  for (const call of msg.tool_calls) {
    const fnName = call.function.name;
    const fnArgs = JSON.parse(call.function.arguments || "{}");
    yield { type: "tool_start", tool: fnName, args: fnArgs };

    try {
      const result = await toolImpl[fnName](fnArgs);
      toolMsgs.push({ role: "tool", tool_call_id: call.id, content: result });
      yield { type: "tool_result", tool: fnName, result: result.slice(0, 200) };
    } catch (e) {
      toolMsgs.push({ role: "tool", tool_call_id: call.id, content: `错误：${e.message}` });
      yield { type: "tool_error", tool: fnName, error: e.message };
    }
  }

  messages.push(msg);
  messages.push(...toolMsgs);

  // 工具执行完，再问 LLM 拿最终回答
  yield { type: "generating" };
  yield* processMessage(messages); // 递归（不会再调工具，因为结果已经在 messages 里了）
}

// =========================================================================
// 🌐 API 路由
// =========================================================================

// 聊天接口（SSE 流式）
app.post("/api/chat", async (req, res) => {
  const { message, sessionId } = req.body;
  if (!message) return res.status(400).json({ error: "missing message" });

  const sid = sessionId || new Date().toISOString().slice(0, 10);
  const sessionFile = path.join(SESSIONS_DIR, `${sid}.json`);

  // 加载会话
  let messages;
  try { messages = JSON.parse(fs.readFileSync(sessionFile, "utf-8")); } catch {
    let profile = {};
    try { profile = JSON.parse(fs.readFileSync(PROFILE_FILE, "utf-8")); } catch {}
    messages = [
      { role: "system", content: `你是全能 AI 助手。可以联网搜索、查知识库、计算、查时间天气等。${profile.name ? `当前用户：${profile.name}${profile.role ? `，${profile.role}` : ""}。` : ""}请用中文回答，简洁友好。遇到不确定的信息主动搜索。` },
    ];
  }

  messages.push({ role: "user", content: message });

  // SSE
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  try {
    for await (const event of processMessage(messages)) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }
    // 保存会话
    fs.writeFileSync(sessionFile, JSON.stringify(messages, null, 2));
  } catch (e) {
    res.write(`data: ${JSON.stringify({ type: "error", error: e.message })}\n\n`);
  }
  res.end();
});

// 会话列表
app.get("/api/sessions", (req, res) => {
  const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith(".json"));
  const sessions = files.map(f => {
    const data = JSON.parse(fs.readFileSync(path.join(SESSIONS_DIR, f), "utf-8"));
    const userMsgs = data.filter(m => m.role === "user");
    return { id: f.replace(".json", ""), messages: data.length, first: userMsgs[0]?.content?.slice(0, 50) || "(空)", last: userMsgs[userMsgs.length - 1]?.content?.slice(0, 50) || "(空)" };
  }).sort((a, b) => b.id.localeCompare(a.id));
  res.json(sessions);
});

// 清除会话
app.delete("/api/sessions/:id", (req, res) => {
  const file = path.join(SESSIONS_DIR, `${req.params.id}.json`);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  res.json({ ok: true });
});

// 档案
app.get("/api/profile", (req, res) => {
  try { res.json(JSON.parse(fs.readFileSync(PROFILE_FILE, "utf-8"))); } catch { res.json({}); }
});

app.post("/api/profile", (req, res) => {
  fs.writeFileSync(PROFILE_FILE, JSON.stringify(req.body, null, 2));
  res.json({ ok: true });
});

// 知识库
app.get("/api/knowledge", (req, res) => {
  try { res.json(JSON.parse(fs.readFileSync(KNOWLEDGE_FILE, "utf-8"))); } catch { res.json([]); }
});

// 全局错误处理：防止任何异常导致服务崩溃
app.use((err, req, res, next) => {
  console.error("  ❌ 服务器错误:", err.message);
  if (!res.headersSent) res.status(500).json({ error: err.message });
  else res.end();
});

// 启动
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("=".repeat(55));
  console.log(`🌐 Agent Web 已启动`);
  console.log(`   打开浏览器访问：http://localhost:${PORT}`);
  console.log("=".repeat(55));
});
