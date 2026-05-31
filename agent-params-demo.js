/**
 * 直观感受两个参数的区别
 */
import OpenAI from "openai";
import "dotenv/config";

const client = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY,
});

const prompt = "写一句描述今天心情的话";

// ============================================================
// top_p 对比
// ============================================================
console.log("=".repeat(60));
console.log("🎯 top_p 对比（同一个问题，同一个 temperature=0.7）\n");

for (const top_p of [1.0, 0.3]) {
  const resp = await client.chat.completions.create({
    model: "deepseek-chat",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    top_p,
    max_tokens: 80,
  });
  console.log(`top_p=${top_p}: ${resp.choices[0].message.content}\n`);
}

// ============================================================
// tool_choice 对比
// ============================================================
console.log("=".repeat(60));
console.log("🔧 tool_choice 对比\n");

const TOOL = [
  {
    type: "function",
    function: {
      name: "getWeather",
      description: "获取指定城市的天气",
      parameters: {
        type: "object",
        properties: { city: { type: "string", description: "城市名" } },
        required: ["city"],
      },
    },
  },
];

// auto
const r1 = await client.chat.completions.create({
  model: "deepseek-chat",
  messages: [{ role: "user", content: "你好，今天心情怎么样？" }],
  tools: TOOL,
  tool_choice: "auto",
  max_tokens: 100,
});
console.log(`tool_choice=auto:  ${r1.choices[0].message.content?.slice(0, 60) || r1.choices[0].message.tool_calls?.[0]?.function?.name}`);

// none
const r2 = await client.chat.completions.create({
  model: "deepseek-chat",
  messages: [{ role: "user", content: "你好，今天心情怎么样？" }],
  tools: TOOL,
  tool_choice: "none",
  max_tokens: 100,
});
console.log(`tool_choice=none:  ${r2.choices[0].message.content?.slice(0, 60)}`);

// 强制调用
const r3 = await client.chat.completions.create({
  model: "deepseek-chat",
  messages: [{ role: "user", content: "你好，今天心情怎么样？" }],
  tools: TOOL,
  tool_choice: { type: "function", function: { name: "getWeather" } },
  max_tokens: 100,
});
console.log(`tool_choice=force: ${r3.choices[0].message.tool_calls?.[0]?.function?.name}`);
console.log(`  → 强制调了天气工具，即使问题跟天气无关！\n`);
