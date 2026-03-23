import type { JsonObject, Tool, ToolContext } from "../../types.js";
import { fail, formatCapabilityPlan, formatTaskNode, inferGoalId, ok } from "./shared.js";
import { buildCapabilityPlanSaveInput, collectCapabilityPlanActualUsage } from "./capability-plan-utils.js";

function parseStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

export const goalCapabilityPlanTool: Tool = {
  definition: {
    name: "goal_capability_plan",
    description: "为当前超长期任务节点生成 capabilityPlan，明确单/多 Agent、methods、skills、MCP 和能力缺口。",
    parameters: {
      type: "object",
      properties: {
        goal_id: { type: "string", description: "可选，目标 ID；默认从当前 goal 会话推断。" },
        node_id: { type: "string", description: "节点 ID。" },
        objective: { type: "string", description: "可选，覆盖/补充该节点的执行 objective。" },
        query_hints: { type: "array", description: "可选，额外检索 hints。", items: { type: "string" } },
        force_mode: {
          type: "string",
          description: "可选，强制规划模式。",
          enum: ["single_agent", "multi_agent"],
        },
        run_id: { type: "string", description: "可选，绑定 runId。" },
      },
      required: ["node_id"],
    },
  },
  async execute(args: JsonObject, context: ToolContext) {
    const name = "goal_capability_plan";
    if (!context.goalCapabilities?.generateCapabilityPlan) {
      return fail(name, "Goal capabilityPlan generator is not available in the current runtime.");
    }
    const goalId = inferGoalId(args.goal_id, context.conversationId);
    if (!goalId) return fail(name, "缺少参数: goal_id，且当前会话无法推断所属 goal。");
    const nodeId = String(args.node_id ?? "").trim();
    if (!nodeId) return fail(name, "缺少参数: node_id");

    try {
      const result = await context.goalCapabilities.generateCapabilityPlan(goalId, nodeId, {
        objective: String(args.objective ?? "").trim() || undefined,
        queryHints: parseStringArray(args.query_hints),
        forceMode: args.force_mode === "multi_agent" ? "multi_agent" : args.force_mode === "single_agent" ? "single_agent" : undefined,
        runId: String(args.run_id ?? "").trim() || undefined,
      });
      const actualUsage = collectCapabilityPlanActualUsage(context);
      const plan = actualUsage && context.goalCapabilities.saveCapabilityPlan
        ? await context.goalCapabilities.saveCapabilityPlan(goalId, nodeId, buildCapabilityPlanSaveInput(result.plan, { actualUsage }))
        : result.plan;
      return ok(name, `已生成 capabilityPlan。\n\n${formatCapabilityPlan(plan)}\n\n${formatTaskNode(result.node)}`);
    } catch (err) {
      return fail(name, `生成 capabilityPlan 失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};
