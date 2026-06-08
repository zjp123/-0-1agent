/**
 * Agent 从0到1 —— 第5步：联网搜索 + 知识库（RAG）
 *
 * 新增能力：
 *   1. 联网搜索 —— 调用 DuckDuckGo / Wikipedia，打破 LLM 知识截止日期
 *   2. 知识库   —— 读取本地文件，搜索你自己的文档
 *   3. 分层记忆 —— 用户档案 + 知识库 + 对话日志，各存各的
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

// =========================================================================
// 💾 分层记忆结构
// =========================================================================
const MEMORY_DIR = path.join(process.cwd(), ".agent-memory");
const PROFILE_FILE = path.join(MEMORY_DIR, "profile.json");
const KNOWLEDGE_FILE = path.join(MEMORY_DIR, "knowledge.json");
const SESSIONS_DIR = path.join(MEMORY_DIR, "sessions");
const KNOWLEDGE_FILES_DIR = path.join(process.cwd(), "knowledge");

function ensureDirs() {
  [MEMORY_DIR, SESSIONS_DIR, KNOWLEDGE_FILES_DIR].forEach((d) => {
    if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  });
}

// ── 用户档案（长期）──
function loadProfile() {
  try { return JSON.parse(fs.readFileSync(PROFILE_FILE, "utf-8")); } catch { return {}; }
}
function saveProfile(p) {
  fs.writeFileSync(PROFILE_FILE, JSON.stringify(p, null, 2));
}

// ── 知识库（长期）──
function loadKnowledge() {
  try { return JSON.parse(fs.readFileSync(KNOWLEDGE_FILE, "utf-8")); } catch { return []; }
}
function saveKnowledge(items) {
  fs.writeFileSync(KNOWLEDGE_FILE, JSON.stringify(items, null, 2));
}

// ── 对话日志（按天）──
function getSessionFile() {
  const date = new Date().toISOString().slice(0, 10);
  return path.join(SESSIONS_DIR, `${date}.json`);
}
function loadSession() {
  try { return JSON.parse(fs.readFileSync(getSessionFile(), "utf-8")); } catch { return []; }
}
function saveSession(messages) {
  fs.writeFileSync(getSessionFile(), JSON.stringify(messages, null, 2));
}

// =========================================================================
// 🌐 工具1：联网搜索
// =========================================================================
async function webSearch({ query }) {
  const results = [];
  const q = encodeURIComponent(query);

  try {
    // 主搜索：DuckDuckGo Instant Answer（免费，无需 Key）
    const ddgUrl = `https://api.duckduckgo.com/?q=${q}&format=json&no_html=1&skip_disambig=1`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const resp = await fetch(ddgUrl, { signal: controller.signal });
    clearTimeout(timeout);
    const data = await resp.json();

    // Abstract（摘要）
    if (data.Abstract) {
      results.push(`📖 ${data.Abstract}`);
      if (data.AbstractURL) results.push(`   来源: ${data.AbstractURL}`);
    }
    // RelatedTopics
    if (data.RelatedTopics && data.RelatedTopics.length > 0) {
      const topics = data.RelatedTopics.filter((t) => t.Text).slice(0, 5);
      topics.forEach((t) => results.push(`  • ${t.Text.replace(/<[^>]+>/g, "")}`));
    }
    // Answer
    if (data.Answer) results.push(`💡 ${data.Answer}`);
  } catch (e) {
    // DDG 挂了就用 Wikipedia 兜底
    results.push(`⚠️ DuckDuckGo 暂时不可用，尝试 Wikipedia...`);
  }

  // 后备：Wikipedia
  if (results.length <= 1) {
    try {
      const wikiUrl = `https://zh.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
      const wikiResp = await fetch(wikiUrl, { headers: { "User-Agent": "AgentFromZero/1.0" } });
      if (wikiResp.ok) {
        const wiki = await wikiResp.json();
        results.push(`📚 Wikipedia: ${wiki.extract?.slice(0, 500) || "无结果"}`);
        if (wiki.content_urls?.desktop?.page) {
          results.push(`   来源: ${wiki.content_urls.desktop.page}`);
        }
      }
    } catch {}
  }

  if (results.length === 0) {
    results.push(`未找到关于「${query}」的搜索结果。`);
  }
  return results.join("\n");
}

// =========================================================================
// 📚 工具2：搜索本地知识库
// =========================================================================
async function searchKnowledge({ query }) {
  const knowledgeItems = loadKnowledge();

  // 先搜已保存的知识条目
  const matched = knowledgeItems
    .filter((item) => {
      const text = `${item.title} ${item.content} ${item.tags?.join(" ") || ""}`.toLowerCase();
      return query.toLowerCase().split(/\s+/).some((word) => text.includes(word));
    })
    .slice(0, 5);

  const lines = [];
  if (matched.length > 0) {
    lines.push(`📋 知识库中找到 ${matched.length} 条：`);
    matched.forEach((item, i) => {
      lines.push(`\n${i + 1}. **${item.title}** (${item.date || "未知日期"})`);
      lines.push(`   ${item.content.slice(0, 200)}`);
    });
  }

  // 再搜本地文件
  if (fs.existsSync(KNOWLEDGE_FILES_DIR)) {
    const files = fs.readdirSync(KNOWLEDGE_FILES_DIR).filter((f) => /\.(md|txt)$/.test(f));
    const fileMatches = [];

    for (const file of files) {
      const content = fs.readFileSync(path.join(KNOWLEDGE_FILES_DIR, file), "utf-8");
      const lowerContent = content.toLowerCase();
      const words = query.toLowerCase().split(/\s+/);
      const score = words.filter((w) => lowerContent.includes(w)).length;

      if (score > 0) {
        // 找到匹配的段落
        const idx = lowerContent.indexOf(words.find((w) => lowerContent.includes(w)) || "");
        const start = Math.max(0, idx - 100);
        const snippet = content.slice(start, start + 400);
        fileMatches.push({ file, score, snippet });
      }
    }

    fileMatches.sort((a, b) => b.score - a.score);
    if (fileMatches.length > 0) {
      lines.push(`\n📁 本地文件中找到 ${fileMatches.length} 个匹配：`);
      fileMatches.slice(0, 3).forEach((m) => {
        lines.push(`\n  📄 ${m.file}:`);
        lines.push(`     ...${m.snippet.replace(/\n/g, " ")}...`);
      });
    }
  }

  if (lines.length === 0) {
    lines.push(`未在知识库中找到关于「${query}」的内容。`);
    lines.push(`💡 你可以用 /save "标题" "内容" 保存知识，或者把 .md/.txt 文件放到 knowledge/ 目录下。`);
  }
  return lines.join("\n");
}

// =========================================================================
// 💾 工具3：保存到知识库
// =========================================================================
function saveToKnowledge({ title, content, tags }) {
  const items = loadKnowledge();
  items.push({
    title,
    content,
    tags: tags ? tags.split(",").map((t) => t.trim()) : [],
    date: new Date().toISOString().slice(0, 10),
  });
  saveKnowledge(items);
  return `✅ 已保存：「${title}」到知识库（共 ${items.length} 条）。`;
}

// =========================================================================
// 🛠️ 工具注册
// =========================================================================
const TOOLS = [
  { name: "getCurrentTime", description: "获取当前时间", parameters: {} },
  { name: "getWeather", description: "查询指定城市的天气", parameters: { city: "城市名称" } },
  { name: "calculator", description: "执行数学计算", parameters: { expression: "数学表达式" } },
  {
    name: "webSearch",
    description: "在网上搜索最新信息。当用户问的知识超出你的训练数据、需要查新闻、实时信息、或者你不知道的内容时使用。",
    parameters: { query: "搜索关键词" },
  },
  {
    name: "searchKnowledge",
    description: "搜索本地知识库和文档。当用户问「我之前记录的XX」「我的笔记里有没有YY」或需要从本地文档中查找信息时使用。",
    parameters: { query: "搜索关键词" },
  },
  {
    name: "saveToKnowledge",
    description: "将重要信息保存到本地知识库。当用户说「记住这个」「保存下来」「记录下来」时使用。",
    parameters: { title: "标题", content: "内容", tags: "标签（逗号分隔，可选）" },
  },
];

const toolImpl = {
  getCurrentTime: () =>
    new Date().toLocaleString("zh-CN", {
      timeZone: "Asia/Shanghai",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "long",
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
  webSearch,
  searchKnowledge,
  saveToKnowledge,
};

// =========================================================================
// 🧠 Agent 核心
// =========================================================================
async function chat(messages, userInput) {
  messages.push({ role: "user", content: userInput });

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

  if (!msg.tool_calls || msg.tool_calls.length === 0) {
    messages.push({ role: "assistant", content: msg.content });
    return { type: "text", content: msg.content };
  }

  // 执行工具
  const toolMsgs = [];
  for (const call of msg.tool_calls) {
    const fnName = call.function.name;
    const fnArgs = JSON.parse(call.function.arguments || "{}");
    console.log(`  🔧 ${fnName}(${JSON.stringify(fnArgs).slice(0, 60)})`);

    try {
      const result = await toolImpl[fnName](fnArgs);
      toolMsgs.push({ role: "tool", tool_call_id: call.id, content: result });
    } catch (e) {
      toolMsgs.push({ role: "tool", tool_call_id: call.id, content: `错误：${e.message}` });
    }
  }

  messages.push(msg);
  messages.push(...toolMsgs);

  response = await client.chat.completions.create({
    model: "deepseek-chat",
    messages,
  });

  const final = response.choices[0].message.content;
  messages.push({ role: "assistant", content: final });
  return { type: "text", content: final };
}

// =========================================================================
// 📦 上下文压缩
// =========================================================================
async function compressIfNeeded(messages) {
  const nonSys = messages.filter((m) => m.role !== "system");
  if (nonSys.length <= 40) return messages;

  const old = nonSys.slice(0, nonSys.length - 20);
  const recent = nonSys.slice(-20);
  const text = old
    .map((m) => {
      const role = { user: "用户", assistant: "助手", tool: "工具" }[m.role] || m.role;
      return `${role}: ${(m.content || "").slice(0, 150)}`;
    })
    .join("\n");

  const resp = await client.chat.completions.create({
    model: "deepseek-chat",
    messages: [
      { role: "system", content: "把这段对话压缩成摘要（200字以内）。只输出摘要。" },
      { role: "user", content: text },
    ],
    max_tokens: 400,
    temperature: 0,
  });

  return [messages[0], { role: "system", content: `📋 [摘要] ${resp.choices[0].message.content}` }, ...recent];
}

// =========================================================================
// 🚀 启动
// =========================================================================
ensureDirs();

const profile = loadProfile();
const todaySession = loadSession();

const SYSTEM = {
  role: "system",
  content: `你是全能 AI 助手。具备以下能力：
1. 联网搜索（webSearch）—— 获取最新信息
2. 本地知识库（searchKnowledge / saveToKnowledge）—— 搜索和保存文档
3. 时间、天气、计算等基础工具

${profile.name ? `当前用户：${profile.name}${profile.role ? `，${profile.role}` : ""}。` : "如果用户介绍自己，请主动用 saveToKnowledge 保存。"}
请用中文回答，简洁友好。遇到不确定的信息时主动联网搜索。`,
};

let messages = todaySession.length > 0 ? todaySession : [SYSTEM, { role: "assistant", content: "你好！我可以联网搜索、查知识库、算数、查天气。有什么可以帮你的？" }];

// ── 界面 ──
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: "🧑 你: " });

console.log("=".repeat(55));
console.log("🤖 Agent（联网+知识库版）已启动");
console.log("   能力：💬 对话  🌐 联网搜索  📚 本地知识库  🧮 计算  🌤️ 天气");
if (profile.name) console.log(`   👤 当前用户：${profile.name}${profile.role ? ` (${profile.role})` : ""}`);
console.log("   命令：/exit  /profile  /knowledge  /save  /clear");
console.log("=".repeat(55));

if (todaySession.length === 0) {
  process.stdout.write("\n🤖 Agent: 你好！我可以联网搜索、查知识库。试试问我最新新闻~\n");
}
rl.prompt();

rl.on("line", async (line) => {
  const input = line.trim();
  if (!input) { rl.prompt(); return; }

  // ── 命令 ──
  if (input === "/exit") {
    saveSession(messages);
    console.log("💾 已保存。👋 再见！");
    rl.close();
    return;
  }
  if (input === "/clear") {
    messages = [SYSTEM, { role: "assistant", content: "记忆已清除。" }];
    saveSession([]);
    console.log("🗑️ 对话已清除（知识和档案保留）。");
    rl.prompt();
    return;
  }
  if (input === "/profile") {
    console.log(`  👤 档案：${JSON.stringify(profile, null, 2)}`);
    rl.prompt();
    return;
  }
  if (input === "/knowledge") {
    const items = loadKnowledge();
    console.log(`  📚 知识库共 ${items.length} 条：`);
    items.forEach((i, n) => console.log(`    ${n + 1}. [${i.date}] ${i.title}`));
    rl.prompt();
    return;
  }
  if (input.startsWith("/save ")) {
    const args = input.slice(6).split(" ").filter(Boolean);
    const title = args[0] || "未命名";
    const content = args.slice(1).join(" ") || "(空)";
    const r = saveToKnowledge({ title, content, tags: "" });
    console.log(`  ${r}`);
    rl.prompt();
    return;
  }

  // ── 正常对话 ──
  const result = await chat(messages, input);
  process.stdout.write(`🤖 Agent: ${result.content}\n`);

  // 自动检测：如果用户介绍了自己，更新档案
  if (
    input.includes("我叫") ||
    input.includes("我是") ||
    input.includes("我是一名") ||
    input.includes("我的名字")
  ) {
    const prof = loadProfile();
    if (!prof.name) {
      // 让 LLM 提取信息
      const ext = await client.chat.completions.create({
        model: "deepseek-chat",
        messages: [
          {
            role: "system",
            content: '从用户的话中提取名字和职业，返回JSON格式：{"name":"名字","role":"职业"}。如果没提到某个字段就写null。只返回JSON。',
          },
          { role: "user", content: input },
        ],
        temperature: 0,
        max_tokens: 100,
      });
      try {
        const info = JSON.parse(ext.choices[0].message.content);
        if (info.name) {
          Object.assign(prof, info);
          saveProfile(prof);
          console.log("  📝 用户档案已自动更新");
        }
      } catch {}
    }
  }

  // 上下文压缩
  const before = messages.length;
  messages = await compressIfNeeded(messages);
  if (messages.length < before) console.log("  📦 (旧消息已压缩为摘要)");

  saveSession(messages);
  rl.prompt();
});

rl.on("close", () => process.exit(0));
