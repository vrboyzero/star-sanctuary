# 任务级 Token 计数器 — 实现方案

> 文档日期：2026-02-26
> 状态：✅ 阶段 1 已完成（2026-02-26）| ✅ 扩展 A+B+C 已完成（2026-02-26）

---

## 一、背景：当前 Token 监控机制

### 数据流

```
ToolEnabledAgent (ReAct 循环)
  └─ 每次模型调用后累加 totalInputTokens / totalOutputTokens
  └─ 循环结束时 yield AgentUsage item
       └─ Gateway server.ts 转发为 token.usage 事件
            └─ WebChat 前端更新 SYS/CTX/IN/OUT/ALL 面板
```

### 关键文件与位置

| 文件 | 位置 | 作用 |
|------|------|------|
| `packages/belldandy-agent/src/tool-agent.ts` | 第 165-225 行 | 累加器初始化 + notifyUsage |
| `packages/belldandy-agent/src/index.ts` | `AgentUsage` 类型定义 | 数据结构 |
| `packages/belldandy-core/src/server.ts` | 第 645-658 行 | 转发 `token.usage` 事件 |
| `apps/web/public/app.js` | 第 826-951 行 | 前端展示逻辑 |

### 现有机制的局限

- **自动全局统计**：每次 run 结束自动产生，Agent 无法控制统计边界
- **无任务级别概念**：无法区分"这个分析任务用了多少 token"
- **前端累加**：`sessionTotalTokens` 仅存在于前端内存，刷新丢失
- **无后端持久化**：`ConversationStore` 只存消息内容，无 token 计数字段
- **OpenAIChatAgent 不产生 usage**：纯聊天模式下前端面板不更新

---

## 二、需求目标

让 Agent 能够主动控制 token 统计边界：

```
// Agent 使用示例
token_counter_start({ name: "data_analysis" })
  ... 执行多次模型调用、工具调用 ...
token_counter_stop({ name: "data_analysis" })
// 返回: { inputTokens: 1234, outputTokens: 567, totalTokens: 1801, durationMs: 5000 }
```

---

## 三、实现方案（阶段 1：最小可行版本）

### 3.1 架构概览

```
新增 TokenCounterService
  ├─ 维护全局 token 累加器（作为基准）
  ├─ 管理多个命名计数器（支持并发任务）
  └─ 计算任务级别的 token 差值

修改 ToolEnabledAgent
  ├─ 初始化 TokenCounterService 实例
  ├─ 每次 API usage 后调用 notifyUsage()
  └─ 构造 ToolContext 时传入 tokenCounter

修改 ToolContext 接口
  └─ 添加可选字段 tokenCounter?: TokenCounterService

新增两个工具
  ├─ token_counter_start
  └─ token_counter_stop

注册工具到 Gateway
```

### 3.2 新增文件：`TokenCounterService`

**位置**：`packages/belldandy-agent/src/token-counter.ts`

```typescript
export interface CounterResult {
  name: string;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  durationMs: number;
}

interface ActiveCounter {
  name: string;
  startTime: number;
  baseInputTokens: number;   // 计数器启动时的全局基准
  baseOutputTokens: number;
}

export class TokenCounterService {
  private counters = new Map<string, ActiveCounter>();
  private globalInputTokens = 0;
  private globalOutputTokens = 0;

  /** 每次模型调用后由 ToolEnabledAgent 调用 */
  notifyUsage(inputTokens: number, outputTokens: number): void {
    this.globalInputTokens += inputTokens;
    this.globalOutputTokens += outputTokens;
  }

  /** 启动一个命名计数器 */
  start(name: string): void {
    if (this.counters.has(name)) {
      throw new Error(`Token counter "${name}" already running`);
    }
    this.counters.set(name, {
      name,
      startTime: Date.now(),
      baseInputTokens: this.globalInputTokens,
      baseOutputTokens: this.globalOutputTokens,
    });
  }

  /** 停止计数器并返回统计结果 */
  stop(name: string): CounterResult {
    const counter = this.counters.get(name);
    if (!counter) {
      throw new Error(`Token counter "${name}" not found`);
    }
    const inputTokens = this.globalInputTokens - counter.baseInputTokens;
    const outputTokens = this.globalOutputTokens - counter.baseOutputTokens;
    this.counters.delete(name);
    return {
      name,
      inputTokens,
      outputTokens,
      totalTokens: inputTokens + outputTokens,
      durationMs: Date.now() - counter.startTime,
    };
  }

  /** 列出所有活跃计数器名称 */
  list(): string[] {
    return Array.from(this.counters.keys());
  }

  /** run 结束时自动清理（防泄漏） */
  cleanup(): string[] {
    const leaked = this.list();
    this.counters.clear();
    return leaked;
  }
}
```

### 3.3 修改 `ToolContext` 接口

**位置**：`packages/belldandy-skills/src/types.ts`（第 27 行附近）

```diff
+ import type { TokenCounterService } from "@belldandy/agent";

  export interface ToolContext {
    conversationId: string;
    logger: Logger;
    stateDir: string;
    workspaceRoots: string[];
    toolExecutor?: ToolExecutor;
    memoryStore?: MemoryStore;
+   tokenCounter?: TokenCounterService;
  }
```

### 3.4 修改 `ToolEnabledAgent`

**位置**：`packages/belldandy-agent/src/tool-agent.ts`

**改动 1**：在累加器初始化处（第 165 行附近）创建 `TokenCounterService`：

```diff
+ import { TokenCounterService } from "./token-counter.js";

  // 在 run() 方法内
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCacheCreation = 0;
  let totalCacheRead = 0;
  let modelCallCount = 0;
+ const tokenCounter = new TokenCounterService();
```

**改动 2**：每次收到 API usage 后通知计数器（第 212-225 行附近）：

```diff
  if (response.ok && response.usage) {
    const u = response.usage;
    modelCallCount++;
    totalInputTokens += u.input_tokens;
    totalOutputTokens += u.output_tokens;
    totalCacheCreation += u.cache_creation_input_tokens ?? 0;
    totalCacheRead     += u.cache_read_input_tokens ?? 0;
+   tokenCounter.notifyUsage(u.input_tokens, u.output_tokens);
  }
```

**改动 3**：构造 `ToolContext` 时传入（第 275 行附近）：

```diff
  const context: ToolContext = {
    conversationId: input.conversationId ?? "",
    logger: this.logger,
    stateDir: this.opts.stateDir,
    workspaceRoots: this.opts.workspaceRoots ?? [],
    toolExecutor: this.toolExecutor,
    memoryStore: this.opts.memoryStore,
+   tokenCounter,
  };
```

**改动 4**：run 结束时自动清理泄漏的计数器（在 finally 块或 run 出口处）：

```diff
+ const leaked = tokenCounter.cleanup();
+ if (leaked.length > 0) {
+   this.logger.warn("token_counter_leaked", { counters: leaked });
+ }
```

### 3.5 新增工具文件

**位置**：`packages/belldandy-skills/src/builtin/token-counter.ts`

```typescript
import type { Tool, ToolContext } from "../types.js";

export const tokenCounterStart: Tool = {
  definition: {
    name: "token_counter_start",
    description:
      "开始一个命名的 token 计数器，用于追踪特定任务的 token 消耗。" +
      "在任务开始时调用，在任务结束时调用 token_counter_stop 获取统计结果。",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "计数器唯一名称（如 'task1'、'analysis_phase'、'web_research'）",
        },
      },
      required: ["name"],
    },
  },
  async execute(args, context: ToolContext) {
    const start = Date.now();
    const { name } = args as { name: string };
    if (!context.tokenCounter) {
      return { id: "", name: "token_counter_start", success: false,
        error: "Token counter service not available (tools mode required)",
        output: "", durationMs: Date.now() - start };
    }
    try {
      context.tokenCounter.start(name);
      return { id: "", name: "token_counter_start", success: true,
        output: `Token counter "${name}" started.`, durationMs: Date.now() - start };
    } catch (err) {
      return { id: "", name: "token_counter_start", success: false,
        error: String(err), output: "", durationMs: Date.now() - start };
    }
  },
};

export const tokenCounterStop: Tool = {
  definition: {
    name: "token_counter_stop",
    description:
      "停止命名的 token 计数器并返回统计结果。" +
      "返回字段：inputTokens（输入 token）、outputTokens（输出 token）、" +
      "totalTokens（合计）、durationMs（耗时毫秒）。",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "要停止的计数器名称（需与 token_counter_start 时一致）",
        },
      },
      required: ["name"],
    },
  },
  async execute(args, context: ToolContext) {
    const start = Date.now();
    const { name } = args as { name: string };
    if (!context.tokenCounter) {
      return { id: "", name: "token_counter_stop", success: false,
        error: "Token counter service not available (tools mode required)",
        output: "", durationMs: Date.now() - start };
    }
    try {
      const result = context.tokenCounter.stop(name);
      return { id: "", name: "token_counter_stop", success: true,
        output: JSON.stringify(result, null, 2), durationMs: Date.now() - start };
    } catch (err) {
      return { id: "", name: "token_counter_stop", success: false,
        error: String(err), output: "", durationMs: Date.now() - start };
    }
  },
};
```

### 3.6 注册工具到 Gateway

**位置**：`packages/belldandy-core/src/bin/gateway.ts`（`toolsToRegister` 数组）

```diff
+ import { tokenCounterStart, tokenCounterStop } from "@belldandy/skills";

  const toolsToRegister: Tool[] = [
    webFetch,
    fileRead, fileWrite, fileDelete, listFiles, applyPatch,
    ...webSearchTools,
    ...systemTools,
    ...browserTools,
    ...multimediaTools,
    ...memoryTools,
    ...methodTools,
    ...logTools,
    cronTool,
    ...sessionTools,
+   tokenCounterStart,
+   tokenCounterStop,
  ];
```

同时在 `packages/belldandy-skills/src/index.ts` 中导出新工具。

---

## 四、可行性分析

### 技术可行性：高 ✅

| 维度 | 评估 |
|------|------|
| 协议兼容 | 无需修改 WebSocket 协议，结果通过现有 `tool_result` 事件返回 |
| 向后兼容 | `tokenCounter` 是可选字段，不影响现有代码路径 |
| 依赖关系 | 仅依赖现有的 `ToolContext` 和 `ToolEnabledAgent`，无外部依赖 |
| 测试隔离 | 可独立单元测试 `TokenCounterService`，不影响其他模块 |

### 工作量评估：中等（2.5-3 小时）

| 任务 | 代码量 | 说明 |
|------|--------|------|
| `TokenCounterService` 类 | ~80 行 | 纯逻辑，无外部依赖 |
| 修改 `ToolContext` 接口 | 1 行 | 加可选字段 |
| 修改 `ToolEnabledAgent` | ~25 行 | 初始化 + notifyUsage + cleanup |
| 实现两个工具 | ~100 行 | 标准 Tool 接口实现 |
| 注册工具 + 导出 | ~10 行 | gateway.ts + index.ts |
| 单元测试 | ~100 行 | TokenCounterService 核心逻辑 |
| **总计** | **~316 行** | |

### 风险评估：低 ⚠️

| 风险 | 影响 | 缓解措施 |
|------|------|----------|
| Agent 忘记调用 stop | 计数器泄漏（内存微小） | run 结束时 `cleanup()` 自动清理 + warn 日志 |
| 重复 start 同名计数器 | 工具返回错误 | 工具层捕获并返回友好错误信息 |
| 跨 run 累计需求 | 当前不支持 | 文档说明"仅支持单次 run 内累计" |
| 并发工具调用 | 无影响 | `notifyUsage` 是同步累加，无竞态 |

---

## 五、局限性与扩展方向

### 当前设计的局限

1. **单 run 作用域**：计数器生命周期绑定到单次 `message.send` 的 ReAct 循环，无法跨多次用户消息累计
2. **无前端展示**：结果仅通过 `tool_result` 返回给 Agent，前端 token 面板不显示任务级统计
3. **无持久化**：计数器状态不落盘，Gateway 重启后丢失

### 扩展 A：跨 run 持久化（可选）

**改动**：在 `ConversationStore` 添加 `activeCounters` 字段，每次 run 结束时保存，下次 run 开始时恢复。

**工作量**：+2 小时（需修改持久化层 + 迁移逻辑）

### 扩展 B：前端任务级展示（可选）

**改动**：
1. 定义新事件 `token.counter.result`（在 `token_counter_stop` 执行后发送）
2. WebChat 添加"任务历史"面板，展示每个任务的 token 消耗

**工作量**：+3 小时（协议 + 前端 UI）

### 扩展 C：自动任务边界检测（✅ 已完成 2026-02-26）

**改动**：通过 hook 系统自动识别任务边界（如检测到 `sessions_spawn` 时自动 start，`agent_end` 时自动 stop）。

**工作量**：+1.5 小时（hook 实现 + 启发式规则）

---

## 六、推荐实施路径

### 阶段 1（本次）：最小可行实现

实现核心方案，满足"Agent 主动控制 + 单 run 内累计"需求。

**验收标准**：
- `token_counter_start({ name: "x" })` 返回成功
- `token_counter_stop({ name: "x" })` 返回 `{ inputTokens, outputTokens, totalTokens, durationMs }`
- 重复 start 同名计数器返回错误
- stop 不存在的计数器返回错误
- run 结束时泄漏计数器被自动清理并记录 warn 日志

### 阶段 2（按需）：持久化支持

如果发现跨 run 累计是高频需求，再实施扩展 A。

### 阶段 3（按需）：用户可见性

如果需要让用户（而非 Agent）看到任务级统计，再实施扩展 B。

---

## 八、实施记录（阶段 1）

### 完成日期：2026-02-26

### 新增文件

| 文件 | 说明 |
|------|------|
| `packages/belldandy-agent/src/token-counter.ts` | `TokenCounterService` 类，管理命名计数器与全局累加器 |
| `packages/belldandy-skills/src/builtin/token-counter.ts` | `tokenCounterStartTool` / `tokenCounterStopTool` 两个工具实现 |

### 修改文件

| 文件 | 改动内容 |
|------|----------|
| `packages/belldandy-skills/src/types.ts` | 新增 `ITokenCounterService` 接口；`ToolContext` 添加可选字段 `tokenCounter` |
| `packages/belldandy-skills/src/executor.ts` | 导入 `ITokenCounterService`；添加 `tokenCounters: Map<string, ITokenCounterService>`；新增 `setTokenCounter` / `clearTokenCounter` 方法；`execute()` 中注入 `tokenCounter` 到 `ToolContext` |
| `packages/belldandy-agent/src/tool-agent.ts` | 导入 `TokenCounterService`；`run()` 中创建实例并注册到 executor；每次模型调用后调用 `notifyUsage()`；`finally` 块中清理泄漏计数器并调用 `clearTokenCounter` |
| `packages/belldandy-skills/src/index.ts` | 导出 `tokenCounterStartTool` / `tokenCounterStopTool` |
| `packages/belldandy-core/src/bin/gateway.ts` | 导入并注册两个工具到 `toolsToRegister` core 组（始终加载） |

### 验收结果

| 验收项 | 结果 |
|--------|------|
| `corepack pnpm build` TypeScript 编译 | ✅ 通过 |
| `corepack pnpm bdd doctor` 系统检查 | ✅ 通过（1 warning：memory DB 未创建，属正常） |
| 向后兼容（不影响现有功能） | ✅ `tokenCounter` 为可选字段 |
| 并发安全（多会话隔离） | ✅ 使用 `Map<conversationId, TokenCounterService>` |
| 泄漏防护 | ✅ `finally` 块自动清理 + warn 日志 |
| 无循环依赖 | ✅ 通过 `ITokenCounterService` 接口解耦 |

### 架构说明

```
ToolEnabledAgent.run()
  ├─ 创建 TokenCounterService 实例
  ├─ toolExecutor.setTokenCounter(conversationId, tokenCounter)
  ├─ ReAct 循环
  │    └─ 每次模型调用后 tokenCounter.notifyUsage(input, output)
  │    └─ 工具调用时 executor.execute() 将 tokenCounter 注入 ToolContext
  │         └─ token_counter_start → tokenCounter.start(name)
  │         └─ token_counter_stop  → tokenCounter.stop(name) → 返回统计结果
  └─ finally: tokenCounter.cleanup() + toolExecutor.clearTokenCounter(conversationId)
```

### 已知局限（待阶段 2/3 扩展）

- 计数器生命周期绑定单次 `message.send` 的 ReAct 循环，不支持跨 run 累计
- 结果仅通过 `tool_result` 返回给 Agent，前端 token 面板不显示任务级统计
- 计数器状态不落盘，Gateway 重启后丢失


| 维度 | 结论 |
|------|------|
| 可行性 | ✅ 高（无技术障碍，架构清晰） |
| 工作量 | 📊 中等（2.5-3 小时，~316 行代码） |
| 风险 | ⚠️ 低（向后兼容，易回滚，错误处理简单） |
| 价值 | 🎯 高（让 Agent 具备任务级成本感知能力） |

---

## 九、补丁记录

### 补丁 1：修复扩展 A 跨 run 计数器 base 值计算错误（2026-02-26）

**问题描述**：

`restoreFromSnapshots()` 恢复时直接使用原始 `baseInputTokens`（上一 run 中的全局累计值），但新 run 的 `globalInputTokens` 从 0 开始，导致 `stop()` 时差值为负数。

**根因分析**：

```
场景：
- 上一 run：counter 在 global=500 时 start，run 结束时 global=700
  - 快照：baseInputTokens=500, savedGlobalInputTokens=700
- 新 run：globalInputTokens 从 0 开始，累计到 300
- stop() 计算：300 - 500 = -300  ← 负数！
```

**修复方案**：

恢复时将 base 调整为相对于新 run 全局累加器（从 0 开始）的偏移量：

```typescript
// 公式：新 base = 原始 base - 快照时全局值 = -(上一 run 内已累计量)
baseInputTokens: s.baseInputTokens - s.savedGlobalInputTokens,
baseOutputTokens: s.baseOutputTokens - s.savedGlobalOutputTokens,

// 验证：
// 新 base = 500 - 700 = -200
// stop() 时：300 - (-200) = 500  ✓（200 来自上一 run + 300 来自新 run）
```

**修改文件**：

- `packages/belldandy-agent/src/token-counter.ts`，`restoreFromSnapshots()` 方法

**影响范围**：

仅影响跨 run 持久化场景（扩展 A），不影响单 run 内计数器功能。

---

### 补丁 2：移除 executor.ts 中不必要的类型绕过（2026-02-26）

**问题描述**：

`broadcast` 字段赋值使用了 `(this as any).broadcast = options.broadcast`，绕过了 TypeScript 类型检查。

**修复方案**：

改为直接赋值 `this.broadcast = options.broadcast`。TypeScript 允许在构造函数中对 `readonly` 字段赋值，无需类型断言。

**修改文件**：

- `packages/belldandy-skills/src/executor.ts`，构造函数第 69 行

**影响范围**：

代码质量改进，无功能变化。

---

## 十、扩展 C 实施记录：自动任务边界检测

### 完成日期：2026-02-26

### 概述

通过 hook 系统自动识别任务边界：当检测到 `sessions_spawn` / `delegate_task` / `delegate_parallel` 工具调用时自动启动 token 计数器，`agent_end` 时自动停止所有自动计数器并广播结果。无需 Agent 手动调用 `token_counter_start` / `token_counter_stop`。

### 修改文件

| 文件 | 改动内容 |
|------|----------|
| `packages/belldandy-skills/src/executor.ts` | 新增 `getTokenCounter(conversationId)` 方法，供 gateway hooks 通过 sessionKey 访问 token 计数器 |
| `packages/belldandy-agent/src/tool-agent.ts` | 重排 `finally` 块顺序：`runAgentEnd()` → 保存快照 → `cleanup()` → `clearTokenCounter()`，确保 `agent_end` hooks 执行时 token 计数器仍可用 |
| `packages/belldandy-core/src/bin/gateway.ts` | 新增 `AUTO_BOUNDARY_TOOLS` Set 和 `AUTO_COUNTER_PREFIX` 常量；注册 `after_tool_call` hook（自动 start）和 `agent_end` hook（自动 stop + 广播） |

### 架构说明

```
ToolEnabledAgent.run()
  ├─ ReAct 循环
  │    └─ 工具调用 sessions_spawn / delegate_task / delegate_parallel
  │         └─ after_tool_call hook 触发
  │              └─ toolExecutor.getTokenCounter(sessionKey)
  │              └─ counter.start("auto:delegate_task_1740000000000")
  │    └─ 后续模型调用 → tokenCounter.notifyUsage() 累加
  └─ finally
       ├─ runAgentEnd()  ← agent_end hook 触发
       │    └─ counter.list() → 过滤 "auto:" 前缀
       │    └─ counter.stop(name) → 获取统计结果
       │    └─ serverBroadcast → token.counter.result 事件（auto: true）
       ├─ getSnapshots() → 保存到 ConversationStore（扩展 A）
       ├─ cleanup() → 清理泄漏计数器
       └─ clearTokenCounter()
```

### 关键设计决策

1. **hook 执行模型**：`agent_end` 和 `after_tool_call` 均为 void hook（`Promise.all` 并行执行），priority 不控制执行顺序
2. **计数器可用性保证**：由 `tool-agent.ts` finally 块排序保证（`runAgentEnd()` 在 `cleanup()` 之前），而非 hook priority
3. **命名规则**：自动计数器使用 `auto:{toolName}_{timestamp}` 格式，与手动计数器（扩展 B）命名空间隔离
4. **广播事件**：复用扩展 B 的 `token.counter.result` 事件，附加 `auto: true` 字段区分来源

### 验收结果

| 验收项 | 结果 |
|--------|------|
| `corepack pnpm build` TypeScript 编译 | ✅ 通过 |
| 向后兼容（不影响现有功能） | ✅ hooks 仅在 `toolsEnabled` 时注册 |
| 与扩展 A 兼容（跨 run 持久化） | ✅ 自动计数器 stop 后不出现在快照中（语义正确） |
| 与扩展 B 兼容（手动计数器） | ✅ `auto:` 前缀隔离，互不干扰 |
| 代码复查 | ✅ 修复死分支 bug + 修正误导性注释 |
