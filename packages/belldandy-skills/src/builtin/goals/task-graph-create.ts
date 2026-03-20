import type { JsonObject, Tool, ToolContext } from "../../types.js";
import { fail, formatTaskGraph, formatTaskNode, inferGoalId, ok, parseCheckpointStatus, parseCreateStatus } from "./shared.js";

function readStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
}

export const taskGraphCreateTool: Tool = {
  definition: {
    name: "task_graph_create",
    description: "向当前超长期任务的 task_graph 中新增一个节点。",
    parameters: {
      type: "object",
      properties: {
        goal_id: { type: "string", description: "可选，目标 ID；默认从当前 goal 会话推断。" },
        node_id: { type: "string", description: "可选，自定义节点 ID。" },
        title: { type: "string", description: "节点标题。" },
        description: { type: "string", description: "可选，节点描述。" },
        phase: { type: "string", description: "可选，所属阶段。" },
        owner: { type: "string", description: "可选，节点负责人。" },
        depends_on: { type: "array", description: "可选，依赖节点 ID 列表。", items: { type: "string" } },
        acceptance: { type: "array", description: "可选，验收条件列表。", items: { type: "string" } },
        checkpoint_required: { type: "boolean", description: "可选，是否需要 checkpoint。" },
        checkpoint_status: {
          type: "string",
          description: "可选，checkpoint 状态。",
          enum: ["not_required", "required", "waiting_user", "approved", "rejected", "expired"],
        },
        status: {
          type: "string",
          description: "可选，节点初始状态。",
          enum: ["draft", "ready", "blocked", "skipped"],
        },
      },
      required: ["title"],
    },
  },
  async execute(args: JsonObject, context: ToolContext) {
    const name = "task_graph_create";
    if (!context.goalCapabilities?.createTaskNode) {
      return fail(name, "Goal capability is not available in the current runtime.");
    }
    const goalId = inferGoalId(args.goal_id, context.conversationId);
    if (!goalId) return fail(name, "缺少参数: goal_id，且当前会话无法推断所属 goal。");
    const title = String(args.title ?? "").trim();
    if (!title) return fail(name, "缺少参数: title");

    try {
      const result = await context.goalCapabilities.createTaskNode(goalId, {
        id: String(args.node_id ?? "").trim() || undefined,
        title,
        description: String(args.description ?? "").trim() || undefined,
        phase: String(args.phase ?? "").trim() || undefined,
        owner: String(args.owner ?? "").trim() || undefined,
        dependsOn: readStringArray(args.depends_on),
        acceptance: readStringArray(args.acceptance),
        checkpointRequired: typeof args.checkpoint_required === "boolean" ? args.checkpoint_required : undefined,
        checkpointStatus: parseCheckpointStatus(args.checkpoint_status),
        status: parseCreateStatus(args.status),
      });
      return ok(name, `已创建 task graph 节点。\n\n${formatTaskNode(result.node)}\n\n${formatTaskGraph(result.graph)}`);
    } catch (err) {
      return fail(name, `创建 task graph 节点失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};
