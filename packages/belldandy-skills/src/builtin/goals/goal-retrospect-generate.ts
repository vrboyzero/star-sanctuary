import type { JsonObject, Tool, ToolContext } from "../../types.js";
import { fail, formatGoal, formatRetrospective, inferGoalId, ok } from "./shared.js";

export const goalRetrospectGenerateTool: Tool = {
  definition: {
    name: "goal_retrospect_generate",
    description: "为当前超长期任务生成 retrospective，总结任务完成度、阻塞、checkpoint、capability 偏差与下一步建议。",
    parameters: {
      type: "object",
      properties: {
        goal_id: { type: "string", description: "可选，目标 ID；默认从当前 goal 会话推断。" },
      },
    },
  },
  async execute(args: JsonObject, context: ToolContext) {
    const name = "goal_retrospect_generate";
    if (!context.goalCapabilities?.generateRetrospective) {
      return fail(name, "Goal retrospective generator is not available in the current runtime.");
    }
    const goalId = inferGoalId(args.goal_id, context.conversationId);
    if (!goalId) return fail(name, "缺少参数: goal_id，且当前会话无法推断所属 goal。");

    try {
      const result = await context.goalCapabilities.generateRetrospective(goalId);
      return ok(
        name,
        `已生成 retrospective。\n\n${formatRetrospective(result.retrospective)}\n\n${formatGoal(result.goal)}`,
      );
    } catch (err) {
      return fail(name, `生成 retrospective 失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};
