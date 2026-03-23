import type { JsonObject, Tool, ToolContext } from "../../types.js";
import { fail, formatSuggestionReviews, inferGoalId, ok } from "./shared.js";

export const goalSuggestionReviewListTool: Tool = {
  definition: {
    name: "goal_suggestion_review_list",
    description: "列出当前超长期任务的 suggestion review 运行态。",
    parameters: {
      type: "object",
      properties: {
        goal_id: { type: "string", description: "可选，目标 ID；默认从当前 goal 会话推断。" },
      },
    },
  },
  async execute(args: JsonObject, context: ToolContext) {
    const name = "goal_suggestion_review_list";
    if (!context.goalCapabilities?.listSuggestionReviews) {
      return fail(name, "Goal suggestion review list is not available in the current runtime.");
    }
    const goalId = inferGoalId(args.goal_id, context.conversationId);
    if (!goalId) return fail(name, "缺少参数: goal_id，且当前会话无法推断所属 goal。");

    try {
      const reviews = await context.goalCapabilities.listSuggestionReviews(goalId);
      return ok(name, formatSuggestionReviews(reviews.items));
    } catch (err) {
      return fail(name, `读取 suggestion review 列表失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};
