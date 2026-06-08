/**
 * Agent 从0到1 —— 第1步：最小闭环
 * 输入一句话 → 调用 DeepSeek → 返回一句话
 */
import OpenAI from "openai";
import "dotenv/config";

// 1. 创建客户端（DeepSeek 兼容 OpenAI 接口）
const client = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY,
});

// 2. 最简单的 Agent：问 → 答
async function ask(question) {
  console.log(`🧑 你: ${question}`);
  console.log(`🤖 Agent: 思考中...`);

  const stream = await client.chat.completions.create({
    model: "deepseek-v4-pro",
    messages: [
            { role: "system", content: "You are a helpful assistant." },
            { role: "user", content: question }
        ],
    max_tokens: 1024,
    stream: true, // ← 流式输出
  });

  process.stdout.write(`\r🤖 Agent: `);
  let answer = "";
  for await (const chunk of stream) {
    const text = chunk.choices[0]?.delta?.content || "";
    process.stdout.write(text);
    answer += text;
  }
  console.log(); // 最后换个行
  return answer;
}

// 3. 如果你直接执行这个文件，就运行这个
if (process.argv[2]) {
  ask(process.argv[2]);
} else {
  // 没有命令行参数时，跑一个默认测试
  ask("你好，请用一句话介绍你自己");
}
