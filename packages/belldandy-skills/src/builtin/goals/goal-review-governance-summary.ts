import type { JsonObject, Tool, ToolContext } from "../../types.js";
import { fail, formatReviewGovernanceSummary, inferGoalId, ok } from "./shared.js";

export const goalReviewGovernanceSummaryTool: Tool = {
  definition: {
    name: "goal_review_governance_summary",
    description: "聚合当前超长期任务的 review / publish / cross-goal 治理摘要。",
    parameters: {
      type: "object",
      properties: {
        goal_id: { type: "string", description: "可选，目标 ID；默认从当前 goal 会话推断。" },
      },
    },
  },
  async execute(args: JsonObject, context: ToolContext) {
    const name = "goal_review_governance_summary";
    if (!context.goalCapabilities?.getReviewGovernanceSummary) {
      return fail(name, "Goal review governance summary is not available in the current runtime.");
    }
    const goalId = inferGoalId(args.goal_id, context.conversationId);
    if (!goalId) return fail(name, "缺少参数: goal_id，且当前会话无法推断所属 goal。");

    try {
      const summary = await context.goalCapabilities.getReviewGovernanceSummary(goalId);
      return ok(name, `已生成 goal review governance 摘要。\n\n${formatReviewGovernanceSummary(summary)}`);
    } catch (err) {
      return fail(name, `生成 goal review governance 摘要失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};
