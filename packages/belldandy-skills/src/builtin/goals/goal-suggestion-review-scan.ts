import type { JsonObject, Tool, ToolContext } from "../../types.js";
import { fail, formatSuggestionReviewWorkflowScanResult, inferGoalId, ok } from "./shared.js";

export const goalSuggestionReviewScanTool: Tool = {
  definition: {
    name: "goal_suggestion_review_scan",
    description: "扫描当前超长期任务 suggestion review workflow 的 SLA 状态，并按配置执行最小自动升级。",
    parameters: {
      type: "object",
      properties: {
        goal_id: { type: "string", description: "可选，目标 ID；默认从当前 goal 会话推断。" },
        now: { type: "string", description: "可选，扫描时间，ISO 时间戳。" },
        auto_escalate: { type: "boolean", description: "是否在命中 overdue 且已配置 escalation reviewer 时自动升级。" },
      },
    },
  },
  async execute(args: JsonObject, context: ToolContext) {
    const name = "goal_suggestion_review_scan";
    if (!context.goalCapabilities?.scanSuggestionReviewWorkflows) {
      return fail(name, "Goal suggestion review workflow scan is not available in the current runtime.");
    }
    const goalId = inferGoalId(args.goal_id, context.conversationId);
    if (!goalId) return fail(name, "缺少参数: goal_id，且当前会话无法推断所属 goal。");

    try {
      const result = await context.goalCapabilities.scanSuggestionReviewWorkflows(goalId, {
        now: typeof args.now === "string" ? args.now.trim() || undefined : undefined,
        autoEscalate: args.auto_escalate === true,
      });
      return ok(name, `已执行 suggestion review workflow SLA scan。\n\n${formatSuggestionReviewWorkflowScanResult(result)}`);
    } catch (err) {
      return fail(name, `执行 suggestion review workflow SLA scan 失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};
