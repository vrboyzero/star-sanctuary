import type { JsonObject, Tool, ToolContext } from "../../types.js";
import { fail, inferGoalId, ok } from "./shared.js";

export const goalSuggestionReviewEscalateTool: Tool = {
  definition: {
    name: "goal_suggestion_review_escalate",
    description: "对当前超长期任务的 suggestion review 当前审批阶段执行手动 escalation。",
    parameters: {
      type: "object",
      properties: {
        goal_id: { type: "string", description: "可选，目标 ID；默认从当前 goal 会话推断。" },
        review_id: { type: "string", description: "可选，review ID。" },
        suggestion_type: { type: "string", enum: ["method_candidate", "skill_candidate", "flow_pattern"], description: "可选，建议类型。" },
        suggestion_id: { type: "string", description: "可选，建议 ID。" },
        escalated_by: { type: "string", description: "升级执行人。" },
        escalated_to: { type: "string", description: "升级后追加/改派的 reviewer。" },
        reason: { type: "string", description: "升级原因。" },
        force: { type: "boolean", description: "是否忽略 SLA 直接手动升级。" },
      },
    },
  },
  async execute(args: JsonObject, context: ToolContext) {
    const name = "goal_suggestion_review_escalate";
    if (!context.goalCapabilities?.escalateSuggestionReview) {
      return fail(name, "Goal suggestion review escalation is not available in the current runtime.");
    }
    const goalId = inferGoalId(args.goal_id, context.conversationId);
    if (!goalId) return fail(name, "缺少参数: goal_id，且当前会话无法推断所属 goal。");

    try {
      const result = await context.goalCapabilities.escalateSuggestionReview(goalId, {
        reviewId: typeof args.review_id === "string" ? args.review_id.trim() || undefined : undefined,
        suggestionType: typeof args.suggestion_type === "string"
          ? args.suggestion_type.trim() as "method_candidate" | "skill_candidate" | "flow_pattern"
          : undefined,
        suggestionId: typeof args.suggestion_id === "string" ? args.suggestion_id.trim() || undefined : undefined,
        escalatedBy: typeof args.escalated_by === "string" ? args.escalated_by.trim() || undefined : undefined,
        escalatedTo: typeof args.escalated_to === "string" ? args.escalated_to.trim() || undefined : undefined,
        reason: typeof args.reason === "string" ? args.reason.trim() || undefined : undefined,
        force: Boolean(args.force),
      });
      const workflow = result.review.workflow;
      const stage = workflow?.stages[workflow.currentStageIndex];
      return ok(
        name,
        `已执行 suggestion review escalation。\n\nReview ID: ${result.review.id}\nStatus: ${result.review.status}\nWorkflow: ${workflow?.mode ?? "(none)"} | stage=${workflow ? `${workflow.currentStageIndex + 1}/${workflow.stages.length}` : "(none)"}\nEscalation Count: ${stage?.escalation.count ?? 0}\nReviewer: ${result.review.reviewer ?? "(none)"}`,
      );
    } catch (err) {
      return fail(name, `执行 suggestion review escalation 失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};
