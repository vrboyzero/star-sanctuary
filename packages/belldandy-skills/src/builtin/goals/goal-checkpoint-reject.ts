import type { JsonObject, Tool, ToolContext } from "../../types.js";
import { fail, formatCheckpoint, formatTaskNode, inferGoalId, ok } from "./shared.js";

export const goalCheckpointRejectTool: Tool = {
  definition: {
    name: "goal_checkpoint_reject",
    description: "拒绝当前长期任务节点的 checkpoint，请求节点进入 blocked。",
    parameters: {
      type: "object",
      properties: {
        goal_id: { type: "string", description: "可选，目标 ID；默认从当前 goal 会话推断。" },
        node_id: { type: "string", description: "节点 ID。" },
        checkpoint_id: { type: "string", description: "可选，指定 checkpoint ID；默认取该节点最近待审批项。" },
        summary: { type: "string", description: "可选，审批结论摘要。" },
        note: { type: "string", description: "拒绝原因或备注。" },
        reviewer: { type: "string", description: "可选，覆盖或补充 reviewer 标识。" },
        reviewer_role: { type: "string", description: "可选，reviewer 角色说明。" },
        requested_by: { type: "string", description: "可选，保留/补充发起人标识。" },
        decided_by: { type: "string", description: "可选，审批人标识。" },
        sla_at: { type: "string", description: "可选，更新后的 SLA 截止时间（建议 ISO 时间）。" },
        run_id: { type: "string", description: "可选，绑定 runId。" },
      },
      required: ["node_id"],
    },
  },
  async execute(args: JsonObject, context: ToolContext) {
    const name = "goal_checkpoint_reject";
    if (!context.goalCapabilities?.rejectCheckpoint) {
      return fail(name, "Goal capability is not available in the current runtime.");
    }
    const goalId = inferGoalId(args.goal_id, context.conversationId);
    if (!goalId) return fail(name, "缺少参数: goal_id，且当前会话无法推断所属 goal。");
    const nodeId = String(args.node_id ?? "").trim();
    if (!nodeId) return fail(name, "缺少参数: node_id");

    try {
      const result = await context.goalCapabilities.rejectCheckpoint(goalId, nodeId, {
        checkpointId: String(args.checkpoint_id ?? "").trim() || undefined,
        summary: String(args.summary ?? "").trim() || undefined,
        note: String(args.note ?? "").trim() || undefined,
        reviewer: String(args.reviewer ?? "").trim() || undefined,
        reviewerRole: String(args.reviewer_role ?? "").trim() || undefined,
        requestedBy: String(args.requested_by ?? "").trim() || undefined,
        decidedBy: String(args.decided_by ?? "").trim() || undefined,
        slaAt: String(args.sla_at ?? "").trim() || undefined,
        runId: String(args.run_id ?? "").trim() || undefined,
      });
      return ok(name, `已拒绝 checkpoint。\n\n${formatCheckpoint(result.checkpoint)}\n\n${formatTaskNode(result.node)}`);
    } catch (err) {
      return fail(name, `拒绝 checkpoint 失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};
