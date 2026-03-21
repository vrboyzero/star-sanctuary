import type { JsonObject, Tool, ToolContext } from "../../types.js";
import { fail, formatApprovalWorkflowScanResult, inferGoalId, ok } from "./shared.js";

export const goalApprovalScanTool: Tool = {
  definition: {
    name: "goal_approval_scan",
    description: "统一扫描当前超长期任务的 suggestion review 与 checkpoint 审批 workflow，生成 reminder / overdue / escalation 通知。",
    parameters: {
      type: "object",
      properties: {
        goal_id: { type: "string", description: "可选，目标 ID；默认从当前 goal 会话推断。" },
        now: { type: "string", description: "可选，扫描时间，ISO 时间戳。" },
        auto_escalate: { type: "boolean", description: "是否在命中 overdue 且已配置 escalation reviewer 时自动升级。" },
      },
    },
  },
  async execute(args: JsonObject, context: ToolContext) {
    const name = "goal_approval_scan";
    if (!context.goalCapabilities?.scanApprovalWorkflows) {
      return fail(name, "Goal approval workflow scan is not available in the current runtime.");
    }
    const goalId = inferGoalId(args.goal_id, context.conversationId);
    if (!goalId) return fail(name, "缺少参数: goal_id，且当前会话无法推断所属 goal。");

    try {
      const result = await context.goalCapabilities.scanApprovalWorkflows(goalId, {
        now: typeof args.now === "string" ? args.now.trim() || undefined : undefined,
        autoEscalate: args.auto_escalate === true,
      });
      return ok(name, `已执行统一 approval workflow scan。\n\n${formatApprovalWorkflowScanResult(result)}`);
    } catch (err) {
      return fail(name, `执行统一 approval workflow scan 失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};
