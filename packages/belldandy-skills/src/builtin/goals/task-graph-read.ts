import type { JsonObject, Tool, ToolContext } from "../../types.js";
import { fail, formatTaskGraph, inferGoalId, ok } from "./shared.js";

export const taskGraphReadTool: Tool = {
  definition: {
    name: "task_graph_read",
    description: "读取当前超长期任务的正式 tasks.json task_graph。",
    parameters: {
      type: "object",
      properties: {
        goal_id: { type: "string", description: "可选，目标 ID；默认从当前 goal 会话推断。" },
      },
      required: [],
    },
  },
  async execute(args: JsonObject, context: ToolContext) {
    const name = "task_graph_read";
    if (!context.goalCapabilities?.readTaskGraph) {
      return fail(name, "Goal capability is not available in the current runtime.");
    }
    const goalId = inferGoalId(args.goal_id, context.conversationId);
    if (!goalId) return fail(name, "缺少参数: goal_id，且当前会话无法推断所属 goal。");

    try {
      const graph = await context.goalCapabilities.readTaskGraph(goalId);
      return ok(name, formatTaskGraph(graph));
    } catch (err) {
      return fail(name, `读取 task graph 失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};
