import type { JsonObject, Tool, ToolContext } from "../../types.js";
import { fail, formatTaskNode, inferGoalId, ok, parseCheckpointStatus } from "./shared.js";

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

export const taskGraphSkipTool: Tool = {
  definition: {
    name: "task_graph_skip",
    description: "将某个 task graph 节点置为 skipped，表示跳过该节点。",
    parameters: {
      type: "object",
      properties: {
        goal_id: { type: "string", description: "可选，目标 ID；默认从当前 goal 会话推断。" },
        node_id: { type: "string", description: "节点 ID。" },
        owner: { type: "string", description: "可选，负责人。" },
        summary: { type: "string", description: "可选，跳过摘要。" },
        block_reason: { type: "string", description: "可选，跳过原因。" },
        artifacts: { type: "array", description: "可选，相关产物路径。", items: { type: "string" } },
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
    const name = "task_graph_skip";
    if (!context.goalCapabilities?.skipTaskNode) {
      return fail(name, "Goal capability is not available in the current runtime.");
    }
    const goalId = inferGoalId(args.goal_id, context.conversationId);
    if (!goalId) return fail(name, "缺少参数: goal_id，且当前会话无法推断所属 goal。");
    const nodeId = String(args.node_id ?? "").trim();
    if (!nodeId) return fail(name, "缺少参数: node_id");

    try {
      const result = await context.goalCapabilities.skipTaskNode(goalId, nodeId, {
        owner: String(args.owner ?? "").trim() || undefined,
        summary: String(args.summary ?? "").trim() || undefined,
        blockReason: String(args.block_reason ?? "").trim() || undefined,
        artifacts: readStringArray(args.artifacts),
        checkpointStatus: parseCheckpointStatus(args.checkpoint_status),
        runId: String(args.run_id ?? "").trim() || undefined,
      });
      return ok(name, `节点已标记为 skipped。\n\n${formatTaskNode(result.node)}`);
    } catch (err) {
      return fail(name, `标记 skipped 失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};
