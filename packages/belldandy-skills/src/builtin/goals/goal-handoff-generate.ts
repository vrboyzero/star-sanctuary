import type { JsonObject, Tool, ToolContext } from "../../types.js";
import { fail, formatGoal, formatHandoff, inferGoalId, ok } from "./shared.js";

export const goalHandoffGenerateTool: Tool = {
  definition: {
    name: "goal_handoff_generate",
    description: "为当前超长期任务生成 handoff.md，汇总恢复建议、阻塞点、checkpoint 与最近执行时间线。",
    parameters: {
      type: "object",
      properties: {
        goal_id: { type: "string", description: "可选，目标 ID；默认从当前 goal 会话推断。" },
      },
    },
  },
  async execute(args: JsonObject, context: ToolContext) {
    const name = "goal_handoff_generate";
    if (!context.goalCapabilities?.generateHandoff) {
      return fail(name, "Goal handoff generator is not available in the current runtime.");
    }
    const goalId = inferGoalId(args.goal_id, context.conversationId);
    if (!goalId) return fail(name, "缺少参数: goal_id，且当前会话无法推断所属 goal。");

    try {
      const result = await context.goalCapabilities.generateHandoff(goalId);
      return ok(
        name,
        `已生成 handoff。\n\n${formatHandoff(result.handoff)}\n\n${formatGoal(result.goal)}`,
      );
    } catch (err) {
      return fail(name, `生成 handoff 失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};
