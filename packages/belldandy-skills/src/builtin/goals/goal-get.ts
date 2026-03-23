import type { JsonObject, Tool, ToolContext } from "../../types.js";
import { fail, formatGoal, ok } from "./shared.js";

export const goalGetTool: Tool = {
  definition: {
    name: "goal_get",
    description: "获取一个超长期任务的详情。",
    parameters: {
      type: "object",
      properties: {
        goal_id: { type: "string", description: "目标 ID。" },
      },
      required: ["goal_id"],
    },
  },
  async execute(args: JsonObject, context: ToolContext) {
    const name = "goal_get";
    if (!context.goalCapabilities?.getGoal) {
      return fail(name, "Goal capability is not available in the current runtime.");
    }
    const goalId = String(args.goal_id ?? "").trim();
    if (!goalId) return fail(name, "缺少参数: goal_id");
    const goal = await context.goalCapabilities.getGoal(goalId);
    return ok(name, goal ? formatGoal(goal) : "Goal not found.");
  },
};

