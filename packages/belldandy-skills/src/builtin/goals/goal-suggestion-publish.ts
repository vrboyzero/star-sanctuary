import type { JsonObject, Tool, ToolContext } from "../../types.js";
import { fail, formatSuggestionPublishRecord, inferGoalId, ok } from "./shared.js";

export const goalSuggestionPublishTool: Tool = {
  definition: {
    name: "goal_suggestion_publish",
    description: "将已通过审阅的 goal suggestion 发布到正式 method/skill 资产目录。",
    parameters: {
      type: "object",
      properties: {
        goal_id: { type: "string", description: "可选，目标 ID；默认从当前 goal 会话推断。" },
        review_id: { type: "string", description: "可选，review ID。" },
        suggestion_type: { type: "string", enum: ["method_candidate", "skill_candidate", "flow_pattern"], description: "可选，建议类型。" },
        suggestion_id: { type: "string", description: "可选，建议 ID。" },
        reviewer: { type: "string", description: "可选，审阅人。" },
        decided_by: { type: "string", description: "可选，发布执行人。" },
        note: { type: "string", description: "可选，发布备注。" },
      },
    },
  },
  async execute(args: JsonObject, context: ToolContext) {
    const name = "goal_suggestion_publish";
    if (!context.goalCapabilities?.publishSuggestion) {
      return fail(name, "Goal suggestion publish is not available in the current runtime.");
    }
    const goalId = inferGoalId(args.goal_id, context.conversationId);
    if (!goalId) return fail(name, "缺少参数: goal_id，且当前会话无法推断所属 goal。");

    try {
      const result = await context.goalCapabilities.publishSuggestion(goalId, {
        reviewId: typeof args.review_id === "string" ? args.review_id.trim() || undefined : undefined,
        suggestionType: typeof args.suggestion_type === "string"
          ? args.suggestion_type.trim() as "method_candidate" | "skill_candidate" | "flow_pattern"
          : undefined,
        suggestionId: typeof args.suggestion_id === "string" ? args.suggestion_id.trim() || undefined : undefined,
        reviewer: typeof args.reviewer === "string" ? args.reviewer.trim() || undefined : undefined,
        decidedBy: typeof args.decided_by === "string" ? args.decided_by.trim() || undefined : undefined,
        note: typeof args.note === "string" ? args.note.trim() || undefined : undefined,
      });
      return ok(name, `已发布 suggestion。\n\n${formatSuggestionPublishRecord(result.record)}`);
    } catch (err) {
      return fail(name, `发布 suggestion 失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};
