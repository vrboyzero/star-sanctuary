import type { JsonObject, Tool, ToolContext } from "../../types.js";
import { fail, formatCheckpoint, formatTaskNode, inferGoalId, ok } from "./shared.js";

export const goalCheckpointEscalateTool: Tool = {
  definition: {
    name: "goal_checkpoint_escalate",
    description: "手动升级当前长期任务节点 checkpoint 的当前审批 stage reviewer。",
    parameters: {
      type: "object",
      properties: {
        goal_id: { type: "string", description: "可选，目标 ID；默认从当前 goal 会话推断。" },
        node_id: { type: "string", description: "节点 ID。" },
        checkpoint_id: { type: "string", description: "可选，指定 checkpoint ID；默认取该节点最近活跃项。" },
        escalated_by: { type: "string", description: "可选，执行 escalation 的操作人标识。" },
        escalated_to: { type: "string", description: "可选，升级到的 reviewer。" },
        reason: { type: "string", description: "可选，升级原因。" },
        force: { type: "boolean", description: "是否强制升级，忽略 overdue 约束。" },
        run_id: { type: "string", description: "可选，绑定 runId。" },
      },
      required: ["node_id"],
    },
  },
  async execute(args: JsonObject, context: ToolContext) {
    const name = "goal_checkpoint_escalate";
    if (!context.goalCapabilities?.escalateCheckpoint) {
      return fail(name, "Goal checkpoint escalation is not available in the current runtime.");
    }
    const goalId = inferGoalId(args.goal_id, context.conversationId);
    if (!goalId) return fail(name, "缺少参数: goal_id，且当前会话无法推断所属 goal。");
    const nodeId = String(args.node_id ?? "").trim();
    if (!nodeId) return fail(name, "缺少参数: node_id");

    try {
      const result = await context.goalCapabilities.escalateCheckpoint(goalId, nodeId, {
        checkpointId: String(args.checkpoint_id ?? "").trim() || undefined,
        escalatedBy: String(args.escalated_by ?? "").trim() || undefined,
        escalatedTo: String(args.escalated_to ?? "").trim() || undefined,
        reason: String(args.reason ?? "").trim() || undefined,
        force: args.force === true,
        runId: String(args.run_id ?? "").trim() || undefined,
      });
      return ok(name, `已升级 checkpoint 当前审批 stage。\n\n${formatCheckpoint(result.checkpoint)}\n\n${formatTaskNode(result.node)}`);
    } catch (err) {
      return fail(name, `升级 checkpoint 失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};
