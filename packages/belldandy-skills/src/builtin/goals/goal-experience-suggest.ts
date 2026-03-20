import type { JsonObject, Tool, ToolContext } from "../../types.js";
import { fail, formatExperienceSuggestions, formatGoal, inferGoalId, ok } from "./shared.js";

export const goalExperienceSuggestTool: Tool = {
  definition: {
    name: "goal_experience_suggest",
    description: "聚合当前超长期任务的 retrospective、method candidate、skill candidate 与 flow pattern 建议。",
    parameters: {
      type: "object",
      properties: {
        goal_id: { type: "string", description: "可选，目标 ID；默认从当前 goal 会话推断。" },
      },
    },
  },
  async execute(args: JsonObject, context: ToolContext) {
    const name = "goal_experience_suggest";
    if (!context.goalCapabilities?.generateExperienceSuggestions) {
      return fail(name, "Goal experience suggest generator is not available in the current runtime.");
    }
    const goalId = inferGoalId(args.goal_id, context.conversationId);
    if (!goalId) return fail(name, "缺少参数: goal_id，且当前会话无法推断所属 goal。");

    try {
      const result = await context.goalCapabilities.generateExperienceSuggestions(goalId);
      return ok(
        name,
        `已生成 goal experience suggestions。\n\n${formatExperienceSuggestions(result)}\n\n${formatGoal(result.goal)}`,
      );
    } catch (err) {
      return fail(name, `生成 goal experience suggestions 失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};
