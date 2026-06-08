/**
 * temperature vs top_p —— 直观对比
 */
import OpenAI from "openai";
import "dotenv/config";

const client = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY,
});

const prompt = "用一个词形容今天的天气";

// ============================================================
// 对比：改 temperature、top_p 不变
// ============================================================
console.log("=".repeat(55));
console.log("对比1: top_p 固定为 1，只改 temperature\n");

for (const temp of [0, 0.7, 1.8]) {
  const resp = await client.chat.completions.create({
    model: "deepseek-chat",
    messages: [{ role: "user", content: prompt }],
    temperature: temp,
    top_p: 1,
    max_tokens: 60,
  });
  console.log(`temp=${temp}, top_p=1  →  ${resp.choices[0].message.content}`);
}

console.log("\n说明：temp 越高，越可能冒出「不像天气描述」的词\n");

// ============================================================
// 对比：改 top_p、temperature 不变
// ============================================================
console.log("=".repeat(55));
console.log("对比2: temperature 固定为 0.7，只改 top_p\n");

for (const tp of [1, 0.5, 0.1]) {
  const resp = await client.chat.completions.create({
    model: "deepseek-chat",
    messages: [{ role: "user", content: prompt }],
    temperature: 0.7,
    top_p: tp,
    max_tokens: 60,
  });
  console.log(`temp=0.7, top_p=${tp}  →  ${resp.choices[0].message.content}`);
}

console.log("\n说明：top_p 越低，选词范围越小，结果越「安全」\n");

// ============================================================
// 极端对比
// ============================================================
console.log("=".repeat(55));
console.log("极端对比：最保守 vs 最狂野\n");

const safe = await client.chat.completions.create({
  model: "deepseek-chat",
  messages: [{ role: "user", content: prompt }],
  temperature: 0,
  top_p: 0.1,
  max_tokens: 60,
});
console.log(`temp=0, top_p=0.1  →  ${safe.choices[0].message.content}`);
console.log("（极度保守 —— 永远选最可能的词，适合代码/数学）\n");

const wild = await client.chat.completions.create({
  model: "deepseek-chat",
  messages: [{ role: "user", content: prompt }],
  temperature: 1.8,
  top_p: 1,
  max_tokens: 60,
});
console.log(`temp=1.8, top_p=1  →  ${wild.choices[0].message.content}`);
console.log("（极度狂野 —— 各种词都可能冒出来，适合创意写作）");
