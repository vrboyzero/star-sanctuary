import type { JsonObject, Tool, ToolContext } from "../../types.js";
import { fail, inferGoalId, ok } from "./shared.js";

function toStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((item) => typeof item === "string" ? item.trim() : "")
    .filter(Boolean);
  return items.length > 0 ? items : undefined;
}

export const goalSuggestionReviewWorkflowSetTool: Tool = {
  definition: {
    name: "goal_suggestion_review_workflow_set",
    description: "为当前超长期任务的 suggestion review 配置 single / chain / quorum 工作流骨架。",
    parameters: {
      type: "object",
      properties: {
        goal_id: { type: "string", description: "可选，目标 ID；默认从当前 goal 会话推断。" },
        review_id: { type: "string", description: "可选，review ID。" },
        suggestion_type: { type: "string", enum: ["method_candidate", "skill_candidate", "flow_pattern"], description: "可选，建议类型。" },
        suggestion_id: { type: "string", description: "可选，建议 ID。" },
        mode: { type: "string", enum: ["single", "chain", "quorum"], description: "workflow 模式。" },
        reviewers: { type: "array", items: { type: "string" }, description: "单阶段 reviewer 列表。" },
        reviewer_roles: { type: "array", items: { type: "string" }, description: "与 reviewers 对应的 reviewer role 列表。" },
        min_approvals: { type: "number", description: "quorum 所需最小通过人数。" },
        stages: { type: "array", description: "chain 模式的阶段列表。" },
        sla_hours: { type: "number", description: "默认 SLA 小时数。" },
        escalation_mode: { type: "string", enum: ["none", "manual"], description: "升级模式。" },
        escalation_reviewer: { type: "string", description: "建议升级审批人。" },
        note: { type: "string", description: "可选备注。" },
      },
      required: ["mode"],
    },
  },
  async execute(args: JsonObject, context: ToolContext) {
    const name = "goal_suggestion_review_workflow_set";
    if (!context.goalCapabilities?.configureSuggestionReviewWorkflow) {
      return fail(name, "Goal suggestion review workflow configuration is not available in the current runtime.");
    }
    const goalId = inferGoalId(args.goal_id, context.conversationId);
    if (!goalId) return fail(name, "缺少参数: goal_id，且当前会话无法推断所属 goal。");
    const mode = typeof args.mode === "string" ? args.mode.trim() : "";
    if (!["single", "chain", "quorum"].includes(mode)) {
      return fail(name, "缺少或无效参数: mode。");
    }

    try {
      const result = await context.goalCapabilities.configureSuggestionReviewWorkflow(goalId, {
        reviewId: typeof args.review_id === "string" ? args.review_id.trim() || undefined : undefined,
        suggestionType: typeof args.suggestion_type === "string"
          ? args.suggestion_type.trim() as "method_candidate" | "skill_candidate" | "flow_pattern"
          : undefined,
        suggestionId: typeof args.suggestion_id === "string" ? args.suggestion_id.trim() || undefined : undefined,
        mode: mode as "single" | "chain" | "quorum",
        reviewers: toStringArray(args.reviewers),
        reviewerRoles: toStringArray(args.reviewer_roles),
        minApprovals: typeof args.min_approvals === "number" && Number.isFinite(args.min_approvals) ? args.min_approvals : undefined,
        stages: Array.isArray(args.stages)
          ? args.stages
            .map((item) => {
              const stage = item && typeof item === "object" && !Array.isArray(item) ? item as Record<string, unknown> : {};
              const reviewers = toStringArray(stage.reviewers);
              if (!reviewers) return null;
              return {
                title: typeof stage.title === "string" ? stage.title.trim() || undefined : undefined,
                reviewers,
                reviewerRoles: toStringArray(stage.reviewer_roles),
                minApprovals: typeof stage.min_approvals === "number" && Number.isFinite(stage.min_approvals) ? stage.min_approvals : undefined,
                slaHours: typeof stage.sla_hours === "number" && Number.isFinite(stage.sla_hours) ? stage.sla_hours : undefined,
              };
            })
            .filter((item): item is NonNullable<typeof item> => Boolean(item))
          : undefined,
        slaHours: typeof args.sla_hours === "number" && Number.isFinite(args.sla_hours) ? args.sla_hours : undefined,
        escalationMode: typeof args.escalation_mode === "string"
          ? args.escalation_mode.trim() as "none" | "manual"
          : undefined,
        escalationReviewer: typeof args.escalation_reviewer === "string" ? args.escalation_reviewer.trim() || undefined : undefined,
        note: typeof args.note === "string" ? args.note.trim() || undefined : undefined,
      });
      const workflow = result.review.workflow;
      return ok(
        name,
        `已配置 suggestion review workflow。\n\nReview ID: ${result.review.id}\nMode: ${workflow?.mode ?? "(none)"}\nStage: ${workflow ? `${workflow.currentStageIndex + 1}/${workflow.stages.length}` : "(none)"}\nStatus: ${result.review.status}\nReviewer: ${result.review.reviewer ?? "(none)"}`,
      );
    } catch (err) {
      return fail(name, `配置 suggestion review workflow 失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};
