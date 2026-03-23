import type { JsonObject, Tool, ToolContext } from "../../types.js";
import { fail, formatGoal, ok } from "./shared.js";

export const goalPauseTool: Tool = {
  definition: {
    name: "goal_pause",
    description: "暂停一个超长期任务。",
    parameters: {
      type: "object",
      properties: {
        goal_id: { type: "string", description: "目标 ID。" },
      },
      required: ["goal_id"],
    },
  },
  async execute(args: JsonObject, context: ToolContext) {
    const name = "goal_pause";
    if (!context.goalCapabilities?.pauseGoal) {
      return fail(name, "Goal capability is not available in the current runtime.");
    }
    const goalId = String(args.goal_id ?? "").trim();
    if (!goalId) return fail(name, "缺少参数: goal_id");
    try {
      const goal = await context.goalCapabilities.pauseGoal(goalId);
      return ok(name, `已暂停超长期任务。\n\n${formatGoal(goal)}`);
    } catch (err) {
      return fail(name, `暂停超长期任务失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};

