# Auto-Recall 底层隐式语义召回 — 实现方案（方案 A / 调整版）

## 目标

当用户发送一条消息时，系统在底层自动将“用户原始输入”作为 query 进行向量语义检索，将匹配到的旧对话/记忆静默注入到 Agent 上下文中，无需 Agent 主动调用 `memory_search` 工具。通过 `.env` 配置开关控制。

## 可行性分析

### 已就绪的基础设施

| 组件 | 状态 | 复用方式 |
|------|------|---------|
| `MemoryManager.search()`（混合检索 + rerank + MMR） | ✅ 完备 | 直接调用 |
| `shouldSkipRetrieval()` | ✅ 已内置在 `search()` | 自动生效 |
| `before_agent_start` hook | ✅ 已用于近期记忆注入 | 扩展同一 hook |
| `getGlobalMemoryManager()` | ✅ 已就绪 | 直接获取 |

### 关键实现调整（相对原稿）

1. 当前 `BeforeAgentStartEvent` 已有 `prompt` 字段，但该字段在现链路中可能包含附件拼接内容，不适合作为语义检索 query。
2. 为避免成本与噪声，新增 `userInput?: string`，用于传递“用户原始文本输入”；Auto-Recall 优先使用该字段，缺失时回退到 `prompt`。
3. 不需要改 `runModifyingHook` 机制，`prependContext` 合并策略已在 `hook-runner` 中具备。

## 风险评估

| 等级 | 风险 | 缓解方案 |
|------|------|---------|
| P1 | Embedding API 延迟 | 2s 超时，超时直接跳过 |
| P1 | API 成本增加 | 依赖 `shouldSkipRetrieval` 自动拦截无效检索 |
| P2 | 上下文污染 | `minScore` 阈值过滤 + 明确标注“仅供参考” |
| P2 | Token 增长 | 限制条数（默认 3）+ snippet 截断（200 字） |
| P3 | 与近期记忆注入重复 | 合并在同一 hook，单次构造 `prependContext` |

## 方案 A 详细设计：扩展现有 `context-injection` Hook

> 核心思路：同一个 `before_agent_start` hook 中同时执行“近期记忆注入”和“语义召回注入”。

### 新增 `.env` 配置项

```bash
# Auto-Recall: 底层自动语义召回（默认关闭）
BELLDANDY_AUTO_RECALL_ENABLED=false
# 召回结果数量上限（默认 3）
BELLDANDY_AUTO_RECALL_LIMIT=3
# 最低分数阈值，低于此分不注入（默认 0.3）
BELLDANDY_AUTO_RECALL_MIN_SCORE=0.3
```

## 改动文件清单

### [MODIFY] `packages/belldandy-core/src/bin/gateway.ts`

1. 在现有 `contextInjectionEnabled` 配置区旁新增 Auto-Recall 环境变量读取：

```ts
const autoRecallEnabled = readEnv("BELLDANDY_AUTO_RECALL_ENABLED") === "true";
const autoRecallLimit = Math.max(1, parseInt(readEnv("BELLDANDY_AUTO_RECALL_LIMIT") || "3", 10) || 3);
const autoRecallMinScoreRaw = Number(readEnv("BELLDANDY_AUTO_RECALL_MIN_SCORE") || "0.3");
const autoRecallMinScore = Number.isFinite(autoRecallMinScoreRaw) ? autoRecallMinScoreRaw : 0.3;
```

2. 将原 `if (contextInjectionEnabled) { ... }` 改为 `if (contextInjectionEnabled || autoRecallEnabled) { ... }`，在同一 handler 中：
   - 保留原近期记忆注入逻辑；
   - 新增 Auto-Recall：
     - `const queryText = event.userInput?.trim() || event.prompt?.trim();`
     - 通过 `Promise.race` 做 2s 超时；
     - `results.filter(r => r.score >= autoRecallMinScore)`；
     - 格式化为 `<auto-recall ...>` 块并拼接到 `prependContext`。

3. 启动日志新增：
   - `context-injection enabled ...`（保持不变）
   - `auto-recall enabled (limit=..., minScore=...)`

### [MODIFY] `packages/belldandy-agent/src/hooks.ts`

在 `BeforeAgentStartEvent` 增加字段（保留现有 `prompt`）：

```ts
export interface BeforeAgentStartEvent {
  prompt: string;
  messages?: unknown[];
  userInput?: string;
}
```

### [MODIFY] `packages/belldandy-agent/src/index.ts`

在 `AgentRunInput` 增加可选字段，供上层传递原始用户文本：

```ts
userInput?: string;
```

### [MODIFY] `packages/belldandy-agent/src/tool-agent.ts`

调用 `runBeforeAgentStart` 时透传 `userInput`：

```ts
const normalizedPrompt = typeof input.content === "string" ? input.content : input.text;
const normalizedUserInput = input.userInput?.trim() || normalizedPrompt;
await this.opts.hookRunner.runBeforeAgentStart(
  { prompt: normalizedPrompt, messages: input.history as any, userInput: normalizedUserInput },
  agentHookCtx,
);
```

### [MODIFY] `packages/belldandy-core/src/server.ts`

在 `message.send` 构造 `runInput` 时传入用户原始文本：

```ts
const runInput = {
  ...,
  text: promptText,
  userInput: parsed.value.text,
};
```

### [MODIFY] `.env.example`

补充 3 个 `BELLDANDY_AUTO_RECALL_*` 注释配置，放在 `BELLDANDY_CONTEXT_INJECTION*` 附近。

## 验证计划

### 自动验证

1. `corepack pnpm build`（TypeScript 编译通过）
2. 启动 gateway，确认日志输出：
   - `auto-recall enabled (limit=3, minScore=0.3)`（启用时）

### 手动验证

1. `.env` 设置 `BELLDANDY_AUTO_RECALL_ENABLED=true`
2. 先进行数轮对话产生记忆
3. 输入与历史语义相关的问题，观察 Agent 回复是否自然利用历史记忆
4. 输入问候（如“你好”），确认被 `shouldSkipRetrieval` 跳过
5. 设置 `BELLDANDY_AUTO_RECALL_ENABLED=false`，确认召回注入完全关闭

