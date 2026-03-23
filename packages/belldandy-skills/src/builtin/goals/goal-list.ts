import type { JsonObject, Tool, ToolContext } from "../../types.js";
import { fail, ok } from "./shared.js";

export const goalListTool: Tool = {
  definition: {
    name: "goal_list",
    description: "列出当前已注册的超长期任务。",
    parameters: {
      type: "object",
      properties: {},
      required: [],
    },
  },
  async execute(_args: JsonObject, context: ToolContext) {
    const name = "goal_list";
    if (!context.goalCapabilities?.listGoals) {
      return fail(name, "Goal capability is not available in the current runtime.");
    }
    const goals = await context.goalCapabilities.listGoals();
    if (goals.length === 0) return ok(name, "当前没有任何超长期任务。");
    const lines = goals.map((goal, index) => `${index + 1}. [${goal.id}] ${goal.title} | ${goal.status} | ${goal.goalRoot}`);
    return ok(name, lines.join("\n"));
  },
};

