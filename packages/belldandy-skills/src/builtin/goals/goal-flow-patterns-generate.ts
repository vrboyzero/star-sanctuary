import type { JsonObject, Tool, ToolContext } from "../../types.js";
import { fail, formatFlowPatterns, formatGoal, inferGoalId, ok } from "./shared.js";

export const goalFlowPatternsGenerateTool: Tool = {
  definition: {
    name: "goal_flow_patterns_generate",
    description: "为当前超长期任务生成高频流程摘要，聚合 flow signature 并给出 method/skill/observe 建议动作。",
    parameters: {
      type: "object",
      properties: {
        goal_id: { type: "string", description: "可选，目标 ID；默认从当前 goal 会话推断。" },
      },
    },
  },
  async execute(args: JsonObject, context: ToolContext) {
    const name = "goal_flow_patterns_generate";
    if (!context.goalCapabilities?.generateFlowPatterns) {
      return fail(name, "Goal flow pattern generator is not available in the current runtime.");
    }
    const goalId = inferGoalId(args.goal_id, context.conversationId);
    if (!goalId) return fail(name, "缺少参数: goal_id，且当前会话无法推断所属 goal。");

    try {
      const result = await context.goalCapabilities.generateFlowPatterns(goalId);
      return ok(
        name,
        `已生成 flow patterns。\n\n${formatFlowPatterns(result.patterns, { markdownPath: result.markdownPath, jsonPath: result.jsonPath })}\n\n${formatGoal(result.goal)}`,
      );
    } catch (err) {
      return fail(name, `生成 flow patterns 失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};
