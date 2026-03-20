import type { JsonObject, Tool, ToolContext } from "../../types.js";
import { fail, formatGoal, formatMethodCandidates, inferGoalId, ok } from "./shared.js";

export const goalMethodCandidatesGenerateTool: Tool = {
  definition: {
    name: "goal_method_candidates_generate",
    description: "为当前超长期任务生成 method candidate 建议，输出可人工审阅的候选列表与证据路径。",
    parameters: {
      type: "object",
      properties: {
        goal_id: { type: "string", description: "可选，目标 ID；默认从当前 goal 会话推断。" },
      },
    },
  },
  async execute(args: JsonObject, context: ToolContext) {
    const name = "goal_method_candidates_generate";
    if (!context.goalCapabilities?.generateMethodCandidates) {
      return fail(name, "Goal method candidate generator is not available in the current runtime.");
    }
    const goalId = inferGoalId(args.goal_id, context.conversationId);
    if (!goalId) return fail(name, "缺少参数: goal_id，且当前会话无法推断所属 goal。");

    try {
      const result = await context.goalCapabilities.generateMethodCandidates(goalId);
      return ok(
        name,
        `已生成 method candidates。\n\n${formatMethodCandidates(result.candidates, { markdownPath: result.markdownPath, jsonPath: result.jsonPath })}\n\n${formatGoal(result.goal)}`,
      );
    } catch (err) {
      return fail(name, `生成 method candidates 失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};
