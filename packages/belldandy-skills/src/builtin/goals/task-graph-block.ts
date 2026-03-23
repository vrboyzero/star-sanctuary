import type { JsonObject, Tool, ToolContext } from "../../types.js";
import { fail, formatTaskNode, inferGoalId, ok, parseCheckpointStatus } from "./shared.js";

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

export const taskGraphBlockTool: Tool = {
  definition: {
    name: "task_graph_block",
    description: "将某个 task graph 节点置为 blocked，并记录阻塞原因。",
    parameters: {
      type: "object",
      properties: {
        goal_id: { type: "string", description: "可选，目标 ID；默认从当前 goal 会话推断。" },
        node_id: { type: "string", description: "节点 ID。" },
        owner: { type: "string", description: "可选，负责人。" },
        summary: { type: "string", description: "可选，当前摘要。" },
        block_reason: { type: "string", description: "阻塞原因。" },
        artifacts: { type: "array", description: "可选，相关产物路径。", items: { type: "string" } },
        checkpoint_status: {
          type: "string",
          description: "可选，checkpoint 状态。",
          enum: ["not_required", "required", "waiting_user", "approved", "rejected", "expired"],
        },
        run_id: { type: "string", description: "可选，绑定 runId。" },
      },
      required: ["node_id", "block_reason"],
    },
  },
  async execute(args: JsonObject, context: ToolContext) {
    const name = "task_graph_block";
    if (!context.goalCapabilities?.blockTaskNode) {
      return fail(name, "Goal capability is not available in the current runtime.");
    }
    const goalId = inferGoalId(args.goal_id, context.conversationId);
    if (!goalId) return fail(name, "缺少参数: goal_id，且当前会话无法推断所属 goal。");
    const nodeId = String(args.node_id ?? "").trim();
    const blockReason = String(args.block_reason ?? "").trim();
    if (!nodeId) return fail(name, "缺少参数: node_id");
    if (!blockReason) return fail(name, "缺少参数: block_reason");

    try {
      const result = await context.goalCapabilities.blockTaskNode(goalId, nodeId, {
        owner: String(args.owner ?? "").trim() || undefined,
        summary: String(args.summary ?? "").trim() || undefined,
        blockReason,
        artifacts: readStringArray(args.artifacts),
        checkpointStatus: parseCheckpointStatus(args.checkpoint_status),
        runId: String(args.run_id ?? "").trim() || undefined,
      });
      return ok(name, `已阻塞节点。\n\n${formatTaskNode(result.node)}`);
    } catch (err) {
      return fail(name, `阻塞 task graph 节点失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};
