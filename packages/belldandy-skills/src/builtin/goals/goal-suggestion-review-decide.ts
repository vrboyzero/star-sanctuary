import type { JsonObject, Tool, ToolContext } from "../../types.js";
import { fail, inferGoalId, ok } from "./shared.js";

export const goalSuggestionReviewDecideTool: Tool = {
  definition: {
    name: "goal_suggestion_review_decide",
    description: "更新当前超长期任务 suggestion review 的决策状态。",
    parameters: {
      type: "object",
      properties: {
        goal_id: { type: "string", description: "可选，目标 ID；默认从当前 goal 会话推断。" },
        review_id: { type: "string", description: "可选，review ID。" },
        suggestion_type: { type: "string", enum: ["method_candidate", "skill_candidate", "flow_pattern"], description: "可选，建议类型。" },
        suggestion_id: { type: "string", description: "可选，建议 ID。" },
        decision: { type: "string", enum: ["accepted", "rejected", "deferred", "needs_revision"], description: "决策状态。" },
        reviewer: { type: "string", description: "可选，审阅人。" },
        decided_by: { type: "string", description: "可选，决策执行人。" },
        note: { type: "string", description: "可选，审阅备注。" },
      },
      required: ["decision"],
    },
  },
  async execute(args: JsonObject, context: ToolContext) {
    const name = "goal_suggestion_review_decide";
    if (!context.goalCapabilities?.decideSuggestionReview) {
      return fail(name, "Goal suggestion review decision is not available in the current runtime.");
    }
    const goalId = inferGoalId(args.goal_id, context.conversationId);
    if (!goalId) return fail(name, "缺少参数: goal_id，且当前会话无法推断所属 goal。");
    const decision = typeof args.decision === "string" ? args.decision.trim() : "";
    if (!["accepted", "rejected", "deferred", "needs_revision"].includes(decision)) {
      return fail(name, "缺少或无效参数: decision。");
    }

    try {
      const result = await context.goalCapabilities.decideSuggestionReview(goalId, {
        reviewId: typeof args.review_id === "string" ? args.review_id.trim() || undefined : undefined,
        suggestionType: typeof args.suggestion_type === "string"
          ? args.suggestion_type.trim() as "method_candidate" | "skill_candidate" | "flow_pattern"
          : undefined,
        suggestionId: typeof args.suggestion_id === "string" ? args.suggestion_id.trim() || undefined : undefined,
        decision: decision as "accepted" | "rejected" | "deferred" | "needs_revision",
        reviewer: typeof args.reviewer === "string" ? args.reviewer.trim() || undefined : undefined,
        decidedBy: typeof args.decided_by === "string" ? args.decided_by.trim() || undefined : undefined,
        note: typeof args.note === "string" ? args.note.trim() || undefined : undefined,
      });
      return ok(
        name,
        `已更新 suggestion review。\n\nReview ID: ${result.review.id}\nStatus: ${result.review.status}\nWorkflow: ${result.review.workflow ? `${result.review.workflow.mode} | stage=${result.review.workflow.currentStageIndex + 1}/${result.review.workflow.stages.length} | workflowStatus=${result.review.workflow.status}` : "(none)"}\nSuggestion: ${result.review.suggestionType} / ${result.review.suggestionId}\nTitle: ${result.review.title}\nReviewer: ${result.review.reviewer ?? "(none)"}\nDecided By: ${result.review.decidedBy ?? "(none)"}\nNote: ${result.review.note ?? "(none)"}`,
      );
    } catch (err) {
      return fail(name, `更新 suggestion review 失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};
