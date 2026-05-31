/**
 * agent.js L19 的几种用法对比
 *
 * 用法1：普通模式 —— agent.js 当前用的
 * 用法2：流式模式 —— 像 ChatGPT 一样逐字输出
 * 用法3：调参模式 —— 控制模型「创造力」
 */
import OpenAI from "openai";
import "dotenv/config";

const client = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY,
});

// ============================================================
// 用法1：普通模式（agent.js 当前用的）
// ============================================================
async function normalMode() {
  console.log("\n📦 用法1：普通模式 —— 等全部生成完，一次返回\n");

  const response = await client.chat.completions.create({
    model: "deepseek-chat",
    messages: [{ role: "user", content: "用3句话介绍 JavaScript" }],
    max_tokens: 200,
  });

  console.log(response.choices[0].message.content);
  console.log("\n⚠️ 特点：要等全部生成完才能看到结果，长回答时感觉「卡」");
}

// ============================================================
// 用法2：流式模式 —— 像打字机一样逐字输出 ✨ 推荐
// ============================================================
async function streamingMode() {
  console.log("\n📡 用法2：流式模式 —— 一个字一个字蹦出来\n");

  const stream = await client.chat.completions.create({
    model: "deepseek-chat",
    messages: [{ role: "user", content: "用3句话介绍 JavaScript" }],
    max_tokens: 200,
    stream: true, // ← 就多这一行！
  });

  process.stdout.write("🤖 ");
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content || "";
    process.stdout.write(text); // 不打换行，连续输出
  }
  console.log("\n\n⚠️ 特点：即时反馈，用户体验好很多，适合聊天场景");
}

// ============================================================
// 用法3：调参 —— 控制模型的「创造力」
// ============================================================
async function parameterMode() {
  console.log("\n🎛️  用法3：调整参数\n");

  // 参数说明
  console.log(`
  ┌──────────────┬──────────────────────────────────────┐
  │ temperature  │ 0 = 严谨保守  1 = 天马行空            │
  │              │ 写代码用 0~0.3  写文章用 0.7~1.0     │
  ├──────────────┼──────────────────────────────────────┤
  │ top_p        │ 另一种控制随机性的方式，通常和        │
  │              │ temperature 二选一即可                │
  ├──────────────┼──────────────────────────────────────┤
  │ max_tokens   │ 限制输出长度，防止浪费 token          │
  ├──────────────┼──────────────────────────────────────┤
  │ stop         │ 遇到指定文字就停，比如 ["。", "\\n"]  │
  └──────────────┴──────────────────────────────────────┘
  `);

  // 对比：同一个问题，不同 temperature
  const prompt = "给我写一句励志的话";

  for (const temp of [0, 0.7, 1.5]) {
    const response = await client.chat.completions.create({
      model: "deepseek-chat",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 100,
      temperature: temp,
    });
    console.log(`  temperature=${temp}: ${response.choices[0].message.content}`);
  }
}

// ============================================================
// 🚀 依次演示
// ============================================================
await normalMode();
await streamingMode();
await parameterMode();
