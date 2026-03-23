import type { JsonObject, Tool, ToolContext } from "../../types.js";
import { fail, formatCheckpointState, inferGoalId, ok } from "./shared.js";

export const goalCheckpointListTool: Tool = {
  definition: {
    name: "goal_checkpoint_list",
    description: "列出当前超长期任务的 checkpoint 运行态。",
    parameters: {
      type: "object",
      properties: {
        goal_id: { type: "string", description: "可选，目标 ID；默认从当前 goal 会话推断。" },
      },
      required: [],
    },
  },
  async execute(args: JsonObject, context: ToolContext) {
    const name = "goal_checkpoint_list";
    if (!context.goalCapabilities?.listCheckpoints) {
      return fail(name, "Goal capability is not available in the current runtime.");
    }
    const goalId = inferGoalId(args.goal_id, context.conversationId);
    if (!goalId) return fail(name, "缺少参数: goal_id，且当前会话无法推断所属 goal。");

    try {
      const checkpoints = await context.goalCapabilities.listCheckpoints(goalId);
      return ok(name, formatCheckpointState(checkpoints.items));
    } catch (err) {
      return fail(name, `读取 checkpoint 列表失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};
