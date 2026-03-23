import type { JsonObject, Tool, ToolContext } from "../../types.js";
import { fail, formatTaskNode, inferGoalId, ok, parseCheckpointStatus } from "./shared.js";

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

export const taskGraphUpdateTool: Tool = {
  definition: {
    name: "task_graph_update",
    description: "更新当前超长期任务 task_graph 中某个节点的结构信息。",
    parameters: {
      type: "object",
      properties: {
        goal_id: { type: "string", description: "可选，目标 ID；默认从当前 goal 会话推断。" },
        node_id: { type: "string", description: "节点 ID。" },
        title: { type: "string", description: "可选，节点标题。" },
        description: { type: "string", description: "可选，节点描述。" },
        phase: { type: "string", description: "可选，所属阶段。" },
        owner: { type: "string", description: "可选，节点负责人。" },
        depends_on: { type: "array", description: "可选，依赖节点 ID 列表。", items: { type: "string" } },
        acceptance: { type: "array", description: "可选，验收条件列表。", items: { type: "string" } },
        artifacts: { type: "array", description: "可选，产物路径列表。", items: { type: "string" } },
        checkpoint_required: { type: "boolean", description: "可选，是否需要 checkpoint。" },
        checkpoint_status: {
          type: "string",
          description: "可选，checkpoint 状态。",
          enum: ["not_required", "required", "waiting_user", "approved", "rejected", "expired"],
        },
      },
      required: ["node_id"],
    },
  },
  async execute(args: JsonObject, context: ToolContext) {
    const name = "task_graph_update";
    if (!context.goalCapabilities?.updateTaskNode) {
      return fail(name, "Goal capability is not available in the current runtime.");
    }
    const goalId = inferGoalId(args.goal_id, context.conversationId);
    if (!goalId) return fail(name, "缺少参数: goal_id，且当前会话无法推断所属 goal。");
    const nodeId = String(args.node_id ?? "").trim();
    if (!nodeId) return fail(name, "缺少参数: node_id");

    try {
      const result = await context.goalCapabilities.updateTaskNode(goalId, nodeId, {
        title: String(args.title ?? "").trim() || undefined,
        description: args.description === undefined ? undefined : String(args.description ?? "").trim() || "",
        phase: args.phase === undefined ? undefined : String(args.phase ?? "").trim() || "",
        owner: args.owner === undefined ? undefined : String(args.owner ?? "").trim() || "",
        dependsOn: readStringArray(args.depends_on),
        acceptance: readStringArray(args.acceptance),
        artifacts: readStringArray(args.artifacts),
        checkpointRequired: typeof args.checkpoint_required === "boolean" ? args.checkpoint_required : undefined,
        checkpointStatus: parseCheckpointStatus(args.checkpoint_status),
      });
      return ok(name, `已更新 task graph 节点。\n\n${formatTaskNode(result.node)}`);
    } catch (err) {
      return fail(name, `更新 task graph 节点失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};
