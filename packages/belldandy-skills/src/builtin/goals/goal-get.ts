import type { JsonObject, Tool, ToolContext } from "../../types.js";
import { fail, formatGoal, inferGoalId, ok } from "./shared.js";

export const goalGetTool: Tool = {
  definition: {
    name: "goal_get",
    description: "获取一个超长期任务的详情与当前 runtime 状态；在 goal 会话中可默认推断当前 goal。",
    parameters: {
      type: "object",
      properties: {
        goal_id: { type: "string", description: "可选，目标 ID；默认从当前 goal 会话推断。" },
      },
      required: [],
    },
  },
  async execute(args: JsonObject, context: ToolContext) {
    const name = "goal_get";
    if (!context.goalCapabilities?.getGoal) {
      return fail(name, "Goal capability is not available in the current runtime.");
    }
    const goalId = inferGoalId(args.goal_id, context.conversationId);
    if (!goalId) return fail(name, "缺少参数: goal_id，且当前会话无法推断所属 goal。");
    const goal = await context.goalCapabilities.getGoal(goalId);
    return ok(name, goal ? formatGoal(goal) : "Goal not found.");
  },
};

