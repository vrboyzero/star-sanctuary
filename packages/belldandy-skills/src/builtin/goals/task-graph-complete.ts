import type { JsonObject, Tool, ToolContext } from "../../types.js";
import { fail, formatTaskNode, inferGoalId, ok, parseCheckpointStatus } from "./shared.js";

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

export const taskGraphCompleteTool: Tool = {
  definition: {
    name: "task_graph_complete",
    description: "将某个 task graph 节点置为 done，表示该节点已经完成。",
    parameters: {
      type: "object",
      properties: {
        goal_id: { type: "string", description: "可选，目标 ID；默认从当前 goal 会话推断。" },
        node_id: { type: "string", description: "节点 ID。" },
        owner: { type: "string", description: "可选，负责人。" },
        summary: { type: "string", description: "可选，完成摘要。" },
        artifacts: { type: "array", description: "可选，产物路径。", items: { type: "string" } },
        checkpoint_status: {
          type: "string",
          description: "可选，checkpoint 状态。",
          enum: ["not_required", "required", "waiting_user", "approved", "rejected", "expired"],
        },
        run_id: { type: "string", description: "可选，绑定 runId。" },
      },
      required: ["node_id"],
    },
  },
  async execute(args: JsonObject, context: ToolContext) {
    const name = "task_graph_complete";
    if (!context.goalCapabilities?.completeTaskNode) {
      return fail(name, "Goal capability is not available in the current runtime.");
    }
    const goalId = inferGoalId(args.goal_id, context.conversationId);
    if (!goalId) return fail(name, "缺少参数: goal_id，且当前会话无法推断所属 goal。");
    const nodeId = String(args.node_id ?? "").trim();
    if (!nodeId) return fail(name, "缺少参数: node_id");

    try {
      const result = await context.goalCapabilities.completeTaskNode(goalId, nodeId, {
        owner: String(args.owner ?? "").trim() || undefined,
        summary: String(args.summary ?? "").trim() || undefined,
        artifacts: readStringArray(args.artifacts),
        checkpointStatus: parseCheckpointStatus(args.checkpoint_status),
        runId: String(args.run_id ?? "").trim() || undefined,
      });
      return ok(name, `已完成节点。\n\n${formatTaskNode(result.node)}`);
    } catch (err) {
      return fail(name, `完成 task graph 节点失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};
