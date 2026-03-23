import type { JsonObject, Tool, ToolContext } from "../../types.js";
import { fail, formatGoal, ok } from "./shared.js";

export const goalResumeTool: Tool = {
  definition: {
    name: "goal_resume",
    description: "恢复一个超长期任务，可选指定某个节点。",
    parameters: {
      type: "object",
      properties: {
        goal_id: { type: "string", description: "目标 ID。" },
        node_id: { type: "string", description: "可选，恢复到指定节点。" },
      },
      required: ["goal_id"],
    },
  },
  async execute(args: JsonObject, context: ToolContext) {
    const name = "goal_resume";
    if (!context.goalCapabilities?.resumeGoal) {
      return fail(name, "Goal capability is not available in the current runtime.");
    }
    const goalId = String(args.goal_id ?? "").trim();
    const nodeId = String(args.node_id ?? "").trim() || undefined;
    if (!goalId) return fail(name, "缺少参数: goal_id");
    try {
      const result = await context.goalCapabilities.resumeGoal(goalId, nodeId);
      return ok(name, `已恢复超长期任务。\nConversation: ${result.conversationId}\nRun: ${result.runId ?? "(none)"}\n\n${formatGoal(result.goal)}`);
    } catch (err) {
      return fail(name, `恢复超长期任务失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};

