/**
 * Agent 从0到1 —— 第2步：工具调用（Tool Calling）
 *
 * 核心变化：
 *   第1步：用户问 → LLM 答（纯聊天）
 *   第2步：用户问 → LLM 决定调哪个工具 → 代码执行 → 结果喂回 LLM → 最终回答
 *
 * 这就是 Agent 和 Chatbot 的本质区别：Agent 能「动手做事」。
 */
import OpenAI from "openai";
import "dotenv/config";

const client = new OpenAI({
  baseURL: "https://api.deepseek.com",
  apiKey: process.env.DEEPSEEK_API_KEY,
});

// =========================================================================
// 🔧 工具定义 —— Agent 的能力清单
// =========================================================================
// 每个工具有 name（函数名）、description（什么情况下用）、parameters（需要什么参数）
const TOOLS = [
  {
    name: "getCurrentTime",
    description: "获取当前时间。当用户问「现在几点」「今天几号」时使用。",
    parameters: {}, // 不需要参数
  },
  {
    name: "getWeather",
    description: "查询指定城市的天气。当用户问天气相关问题时使用。",
    parameters: {
      city: "城市名称，例如「北京」「上海」「东京」",
    },
  },
  {
    name: "calculator",
    description: "执行数学计算。当用户需要做算术运算时使用。",
    parameters: {
      expression: "数学表达式，例如「3 + 5 * 2」「sqrt(16)」",
    },
  },
];

// =========================================================================
// 🛠️ 工具的实际实现 —— 当 LLM 要调用时，真正执行的代码
// =========================================================================
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
    // 模拟数据（实际项目中可以接真实天气 API）
    const weathers = [
      "晴朗 ☀️，温度 22°C，湿度 45%，微风",
      "多云 ⛅，温度 18°C，湿度 60%，东北风 3 级",
      "小雨 🌧️，温度 15°C，湿度 80%，南风 2 级",
      "阴天 ☁️，温度 20°C，湿度 55%，北风 1 级",
    ];
    // 用城市名哈希选一个天气，同一个城市总是返回同一种
    const idx = [...city].reduce((s, c) => s + c.charCodeAt(0), 0);
    return `${city}天气：${weathers[idx % weathers.length]}`;
  },

  calculator({ expression }) {
    try {
      // 安全计算：只允许数字和基本运算符
      if (!/^[\d+\-*/().%\s]+$/.test(expression)) {
        return `错误：表达式包含不安全的字符，只允许数字和 + - * / ( )`;
      }
      const result = eval(expression);
      return `${expression} = ${result}`;
    } catch (e) {
      return `计算错误：${e.message}`;
    }
  },
};

// =========================================================================
// 🤖 Agent 核心循环 —— 这就是 Agent 的「大脑」
// =========================================================================
async function agent(userMessage) {
  // 第1轮：把用户消息 + 工具清单发给 LLM
  let response = await client.chat.completions.create({
    model: "deepseek-chat",
    messages: [
      {
        role: "system",
        content:
          "你是一个有用的 AI 助手。当需要获取实时信息（时间、天气）或进行计算时，请调用对应的工具。工具调用的结果会返回给你，然后你用自然语言回答用户。",
      },
      { role: "user", content: userMessage },
    ],
    tools: TOOLS.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: {
          type: "object",
          properties: Object.fromEntries(
            Object.entries(t.parameters).map(([key, desc]) => [
              key,
              { type: "string", description: desc },
            ])
          ),
          required: Object.keys(t.parameters),
        },
      },
    })),
  });

  const msg = response.choices[0].message;

  // 情况A：LLM 觉得不需要工具 → 直接回答
  if (!msg.tool_calls || msg.tool_calls.length === 0) {
    return msg.content;
  }

  // 情况B：LLM 要调工具！
  // 1. 执行所有工具调用
  const toolResults = [];
  for (const call of msg.tool_calls) {
    const fnName = call.function.name;
    const fnArgs = JSON.parse(call.function.arguments || "{}");
    const result = toolImplementations[fnName](fnArgs);

    console.log(`  🔧 调用工具: ${fnName}(${JSON.stringify(fnArgs)})`);
    console.log(`  📦 工具返回: ${result}`);

    toolResults.push({
      role: "tool",
      tool_call_id: call.id,
      content: result,
    });
  }

  // 2. 把工具结果 + 对话历史，再发给 LLM 要最终回答
  response = await client.chat.completions.create({
    model: "deepseek-chat",
    messages: [
      {
        role: "system",
        content: "根据工具返回的结果，用自然语言回答用户。",
      },
      { role: "user", content: userMessage },
      msg, // LLM 的工具调用请求
      ...toolResults, // 我们执行工具后的结果
    ],
  });

  return response.choices[0].message.content;
}

// =========================================================================
// 🚀 启动
// =========================================================================
const question = process.argv[2];
if (question) {
  console.log(`🧑 你: ${question}`);
  console.log(`🤖 Agent: 思考中...`);
  const answer = await agent(question);
  console.log(`🤖 Agent: ${answer}`);
} else {
  // 无参数时自动测试
  const tests = [
    "现在几点了？",
    "北京今天天气怎么样？",
    "帮我算一下 (3 + 5) * 12 / 4",
  ];
  for (const q of tests) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`🧑 你: ${q}`);
    const answer = await agent(q);
    console.log(`🤖 Agent: ${answer}`);
  }
}
