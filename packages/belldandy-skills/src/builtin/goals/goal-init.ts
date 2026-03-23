import type { JsonObject, Tool, ToolContext } from "../../types.js";
import { fail, formatGoal, ok } from "./shared.js";

export const goalInitTool: Tool = {
  definition: {
    name: "goal_init",
    description: "创建一个新的超长期任务，并初始化文档脚手架、运行态目录与默认会话。",
    parameters: {
      type: "object",
      properties: {
        title: { type: "string", description: "超长期任务标题。" },
        objective: { type: "string", description: "可选，任务目标描述。" },
        slug: { type: "string", description: "可选，文档目录 slug。" },
        goalRoot: { type: "string", description: "可选，指定该超长期任务的自定义根路径（绝对路径）。" },
      },
      required: ["title"],
    },
  },
  async execute(args: JsonObject, context: ToolContext) {
    const name = "goal_init";
    if (!context.goalCapabilities?.createGoal) {
      return fail(name, "Goal capability is not available in the current runtime.");
    }
    const title = String(args.title ?? "").trim();
    if (!title) return fail(name, "缺少参数: title");
    const objective = String(args.objective ?? "").trim() || undefined;
    const slug = String(args.slug ?? "").trim() || undefined;
    const goalRoot = String(args.goalRoot ?? "").trim() || undefined;

    try {
      const goal = await context.goalCapabilities.createGoal({ title, objective, slug, goalRoot });
      return ok(name, `超长期任务已创建。\n\n${formatGoal(goal)}`);
    } catch (err) {
      return fail(name, `创建超长期任务失败: ${err instanceof Error ? err.message : String(err)}`);
    }
  },
};

