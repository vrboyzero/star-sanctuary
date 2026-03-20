import type { JsonObject, Tool, ToolContext } from "../../types.js";
import { fail, formatCrossGoalFlowPatterns, ok } from "./shared.js";

export const goalCrossGoalFlowPatternsTool: Tool = {
  definition: {
    name: "goal_cross_goal_flow_patterns",
    description: "聚合所有已生成的 goal flow-patterns.json，输出跨 goal 的高频流程摘要。",
    parameters: {
      type: "object",
      properties: {},
    },
  },
  async execute(_args: JsonObject, context: ToolContext) {
    const name = "goal_cross_goal_flow_patterns";
    if (!context.goalCapabilities?.generateCrossGoalFlowPatterns) {
      return fail(name, "Cross-goal flow pattern generator is not available in the current runtime.");
    }

    try {
      const result = await context.goalCapabilities.generateCrossGoalFlowPatterns();
      return ok(
        name,
        `已生成跨 goal flow patterns。\n\n${formatCrossGoalFlowPatterns(result.patterns, {
          markdownPath: result.markdownPath,
          jsonPath: result.jsonPath,
          goalsScanned: result.goalsScanned,
        })}`,
      );
    } catch (err) {
      return fail(name, `生成跨 goal flow patterns 失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};
