import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ToolContext } from "../types.js";

const memoryManager = {
  getTaskByConversation: vi.fn(),
  recordSkillUsage: vi.fn(),
};

vi.mock("@belldandy/memory", () => ({
  getGlobalMemoryManager: () => memoryManager,
}));

const { createSkillGetTool } = await import("./skills-tool.js");

describe("skill_get usage recording", () => {
  const context: ToolContext = {
    conversationId: "conv-skill-usage",
    workspaceRoot: "E:/project/star-sanctuary",
    policy: {
      allowedPaths: [],
      deniedPaths: [],
      allowedDomains: [],
      deniedDomains: [],
      maxTimeoutMs: 1000,
      maxResponseBytes: 1024 * 1024,
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("records skill usage when current conversation has a task", async () => {
    const registry = {
      getSkill: vi.fn().mockReturnValue({
        name: "网页自动化 Skill",
        description: "用于网页自动化任务",
        priority: "normal",
        tags: ["browser", "automation"],
        instructions: "1. 打开浏览器\n2. 执行网页自动化",
        source: { type: "user", path: "E:/project/star-sanctuary/.star_sanctuary/skills/web-auto/SKILL.md" },
      }),
      listSkills: vi.fn().mockReturnValue([]),
    } as any;

    memoryManager.getTaskByConversation.mockReturnValue({
      id: "task_skill_usage_1",
      conversationId: "conv-skill-usage",
    });

    const tool = createSkillGetTool(registry);
    const result = await tool.execute({ name: "网页自动化 Skill" }, context);

    expect(result.success).toBe(true);
    expect(result.output).toContain("网页自动化 Skill");
    expect(memoryManager.getTaskByConversation).toHaveBeenCalledWith("conv-skill-usage");
    expect(memoryManager.recordSkillUsage).toHaveBeenCalledWith("task_skill_usage_1", "网页自动化 Skill", {
      usedVia: "tool",
    });
  });

  it("does not fail when no task is available", async () => {
    const registry = {
      getSkill: vi.fn().mockReturnValue({
        name: "网页自动化 Skill",
        description: "用于网页自动化任务",
        priority: "normal",
        tags: [],
        instructions: "按步骤执行",
        source: { type: "bundled" },
      }),
      listSkills: vi.fn().mockReturnValue([]),
    } as any;

    memoryManager.getTaskByConversation.mockReturnValue(null);

    const tool = createSkillGetTool(registry);
    const result = await tool.execute({ name: "网页自动化 Skill" }, context);

    expect(result.success).toBe(true);
    expect(memoryManager.recordSkillUsage).not.toHaveBeenCalled();
  });
});
