import type { Tool, ToolContext } from "../types.js";
import { withToolContract } from "../tool-contract.js";

export const tokenCounterStartTool: Tool = withToolContract({
  definition: {
    name: "token_counter_start",
    description:
      "开始一个命名的 token 计数器，用于追踪特定任务的 token 消耗。" +
      "在任务开始时调用，在任务结束时调用 token_counter_stop 获取统计结果。" +
      "支持同时运行多个不同名称的计数器。",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "计数器唯一名称，如 'task1'、'analysis_phase'、'web_research'",
        },
      },
      required: ["name"],
    },
  },
  async execute(args, context: ToolContext) {
    const start = Date.now();
    const { name } = args as { name: string };
    if (!context.tokenCounter) {
      return {
        id: "",
        name: "token_counter_start",
        success: false,
        error: "Token counter service not available (requires tools mode)",
        output: "",
        durationMs: Date.now() - start,
      };
    }
    try {
      context.tokenCounter.start(name);
      return {
        id: "",
        name: "token_counter_start",
        success: true,
        output: `Token counter "${name}" started.`,
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        id: "",
        name: "token_counter_start",
        success: false,
        error: String(err),
        output: "",
        durationMs: Date.now() - start,
      };
    }
  },
}, {
  family: "other",
  isReadOnly: false,
  isConcurrencySafe: false,
  needsPermission: false,
  riskLevel: "low",
  channels: ["gateway", "web"],
  safeScopes: ["local-safe", "web-safe"],
  activityDescription: "Start a named token usage counter",
  resultSchema: {
    kind: "text",
    description: "Token counter start confirmation text.",
  },
  outputPersistencePolicy: "conversation",
});

export const tokenCounterStopTool: Tool = withToolContract({
  definition: {
    name: "token_counter_stop",
    description:
      "停止命名的 token 计数器并返回统计结果。" +
      "返回字段：name（计数器名称）、inputTokens（输入 token 数）、" +
      "outputTokens（输出 token 数）、totalTokens（合计）、durationMs（耗时毫秒）。",
    parameters: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "要停止的计数器名称，需与 token_counter_start 时一致",
        },
      },
      required: ["name"],
    },
  },
  async execute(args, context: ToolContext) {
    const start = Date.now();
    const { name } = args as { name: string };
    if (!context.tokenCounter) {
      return {
        id: "",
        name: "token_counter_stop",
        success: false,
        error: "Token counter service not available (requires tools mode)",
        output: "",
        durationMs: Date.now() - start,
      };
    }
    try {
      const result = context.tokenCounter.stop(name);
      context.conversationStore?.recordTaskTokenResult(context.conversationId, result);
      // 扩展 B：广播 token.counter.result 事件到前端
      context.broadcast?.("token.counter.result", {
        conversationId: context.conversationId,
        ...result,
      });
      return {
        id: "",
        name: "token_counter_stop",
        success: true,
        output: JSON.stringify(result, null, 2),
        durationMs: Date.now() - start,
      };
    } catch (err) {
      return {
        id: "",
        name: "token_counter_stop",
        success: false,
        error: String(err),
        output: "",
        durationMs: Date.now() - start,
      };
    }
  },
}, {
  family: "other",
  isReadOnly: false,
  isConcurrencySafe: false,
  needsPermission: false,
  riskLevel: "low",
  channels: ["gateway", "web"],
  safeScopes: ["local-safe", "web-safe"],
  activityDescription: "Stop a named token usage counter and return its totals",
  resultSchema: {
    kind: "text",
    description: "Token counter summary JSON text.",
  },
  outputPersistencePolicy: "conversation",
});
