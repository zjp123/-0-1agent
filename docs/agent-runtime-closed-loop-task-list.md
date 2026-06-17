# Agent Runtime 闭环升级任务清单

## 目标

把当前“模块集合”升级为真正可工作的企业级 Agent 闭环：

```text
用户任务
  -> 任务规划
  -> 上下文/RAG 构建
  -> 多步模型与工具执行
  -> Workflow/Evaluation/Observability 联动
  -> 可追踪、可回放、可治理的最终结果
```

## 执行规则

- 每完成一项，把 `[ ]` 改为 `[x]`。
- 每完成一个功能，更新对应留痕文档。
- 优先打通真实闭环，不继续堆只读页面。
- 每个阶段至少运行一次 API/Web 类型检查或针对性测试。

## Phase 1 - Agent Runtime 生产执行循环

- [x] 新增 Agent run execution plan：每次运行生成可追踪的 plan、step、status、timestamps。
- [x] 将现有 ReAct 循环拆成明确阶段：context、planning、model、tool、reflection/finalize。
- [x] 在返回结果和 SSE 中暴露 plan/step 摘要，便于 Web Run Details 展示。
- [x] 为每个阶段写入 observability trace，支持 requestId 串联。
- [x] 增加 loop guard：最大工具调用次数、连续空输出保护、重复工具调用保护。
- [x] 更新 Agent Chat 文档和 API 文档。

## Phase 2 - Workflow Run Executor

- [x] 新增 workflow run executor service。
- [x] 支持从 workflow step 生成 Agent task。
- [x] 执行 step 时调用 Agent Runtime。
- [x] 根据 Agent Runtime 结果自动更新 workflow step 状态。
- [x] 支持 step 失败记录 error，并写入 trace。
- [x] Web Workflows 增加执行选中 step 入口。
- [x] Web Workflows 增加执行全部 pending steps 入口。
- [x] 更新 Workflow 文档。

## Phase 3 - Evaluation 接入真实 Agent Run

- [x] Evaluation run 可选择调用真实 Agent Runtime，而不是只评估手动 actualOutput。
- [x] 支持批量运行 evaluation cases。
- [x] 每次 evaluation run 关联 requestId 和 trace。
- [x] 失败样本记录 prompt、actual、expected、score、reason。
- [x] Web Evaluations 增加真实 Agent run 模式。
- [x] 更新 Evaluation 文档。

## Phase 4 - Observability 调用链闭环

- [ ] 按 requestId 聚合 agent/model/tool/rag/workflow/evaluation trace。
- [ ] 新增 trace timeline API。
- [ ] Web Observability 增加 request timeline 视图。
- [ ] Agent Chat Run Details 可跳转到对应 trace timeline。
- [ ] 增加错误聚合和最近失败请求入口。
- [ ] 更新 Observability 文档。

## Phase 5 - 工具与 RAG 生产能力增强

- [ ] 工具调用结果增加结构化 output，避免只能读纯文本。
- [ ] 增加工具权限/风险级别展示。
- [ ] RAG 引用结果返回 document/chunk/source metadata。
- [ ] Agent final answer 中保留 sources 引用摘要。
- [ ] Web Agent Chat 展示引用卡片。
- [ ] 更新 Tools/RAG 文档。

## Phase 6 - 安全、配额与治理闭环

- [ ] Agent run 前执行 quota / permission preflight。
- [ ] 高风险工具调用支持 approval-required 状态。
- [ ] 记录 token/cost usage 到可查询存储。
- [ ] 增加 tenant/user 维度 run history。
- [ ] 增加审计事件与安全页面联动。
- [ ] 更新 Auth/Security 文档。

## 当前状态

当前已具备：

- Agent Runtime 基础 ReAct loop。
- RAG 上下文注入。
- Tool Registry 和 calculator/current_time 两个内置工具。
- Observability trace events。
- Workflow 存储、step 状态和 schedule/run 记录。
- Evaluation case/run 基础能力。
- Web Console 登录和主要页面。

当前缺口：

- Workflow 还不能真正驱动 Agent 自动执行。
- Evaluation 还没有成为真实 Agent 质量门禁。
- Observability 还没有 requestId timeline 闭环。
- Agent run 已有显式 execution plan 和基础 loop guard；下一步要让 Workflow 真正驱动 Agent 自动执行。
