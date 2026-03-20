import type { JsonObject, Tool, ToolContext } from "../../types.js";
import { fail, formatGoal, formatSkillCandidates, inferGoalId, ok } from "./shared.js";

export const goalSkillCandidatesGenerateTool: Tool = {
  definition: {
    name: "goal_skill_candidates_generate",
    description: "为当前超长期任务生成 skill candidate 建议，聚焦能力缺口、工具编排和 MCP 协同模式。",
    parameters: {
      type: "object",
      properties: {
        goal_id: { type: "string", description: "可选，目标 ID；默认从当前 goal 会话推断。" },
      },
    },
  },
  async execute(args: JsonObject, context: ToolContext) {
    const name = "goal_skill_candidates_generate";
    if (!context.goalCapabilities?.generateSkillCandidates) {
      return fail(name, "Goal skill candidate generator is not available in the current runtime.");
    }
    const goalId = inferGoalId(args.goal_id, context.conversationId);
    if (!goalId) return fail(name, "缺少参数: goal_id，且当前会话无法推断所属 goal。");

    try {
      const result = await context.goalCapabilities.generateSkillCandidates(goalId);
      return ok(
        name,
        `已生成 skill candidates。\n\n${formatSkillCandidates(result.candidates, { markdownPath: result.markdownPath, jsonPath: result.jsonPath })}\n\n${formatGoal(result.goal)}`,
      );
    } catch (err) {
      return fail(name, `生成 skill candidates 失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};
