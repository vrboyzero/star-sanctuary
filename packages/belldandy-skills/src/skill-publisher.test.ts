import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import type { ExperienceCandidate } from "@belldandy/memory";
import { publishSkillCandidate } from "./skill-publisher.js";

function buildCandidate(overrides: Partial<ExperienceCandidate> = {}): ExperienceCandidate {
  return {
    id: "exp_skill_1",
    taskId: "task_skill_1",
    type: "skill",
    status: "draft",
    title: "网页修复技能",
    slug: "skill-task-skill-1",
    content: [
      "---",
      'name: "网页修复技能草稿"',
      'description: "用于网页修复"',
      'version: "0.1.0-draft"',
      'tags: ["task-derived"]',
      "priority: normal",
      "---",
      "",
      "# 网页修复技能",
      "",
      "## 快速开始",
      "1. 先检查网页问题。",
      "",
      "## 决策路由",
      "- 命中同类问题时优先复用。",
      "",
      "## 输入",
      "- 当前页面状态。",
      "",
      "## 输出",
      "- 修复结果。",
      "",
      "## 参考指引",
      "- 来源任务：task_skill_1",
      "",
      "## NEVER",
      "- 不要绕过审阅。",
    ].join("\n"),
    summary: "网页修复技能",
    qualityScore: 80,
    createdAt: "2026-04-20T00:00:00.000Z",
    sourceTaskSnapshot: {
      taskId: "task_skill_1",
      conversationId: "conv_skill_1",
      source: "chat",
      status: "success",
      startedAt: "2026-04-20T00:00:00.000Z",
    },
    ...overrides,
  };
}

describe("skill publisher", () => {
  let stateDir = "";

  afterEach(async () => {
    if (stateDir) {
      await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
      stateDir = "";
    }
  });

  it("publishes skills into a canonical kebab-case directory and rewrites frontmatter name", async () => {
    stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-skill-publisher-"));
    const publishedPath = await publishSkillCandidate(buildCandidate(), stateDir);

    expect(publishedPath).toContain(path.join(stateDir, "skills", "task-skill-1", "SKILL.md"));
    const content = await fs.readFile(publishedPath, "utf-8");
    expect(content).toContain('name: "task-skill-1"');
    expect(content).toContain("# 网页修复技能");
  });

  it("rejects malformed skill drafts before publish", async () => {
    stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-skill-publisher-"));

    await expect(publishSkillCandidate(buildCandidate({
      content: [
        "---",
        'name: "bad skill"',
        'description: "用于测试"',
        "---",
        "",
        "# 坏技能",
        "",
        "## 快速开始",
        "1. only one section",
      ].join("\n"),
    }), stateDir)).rejects.toThrow(/Skill candidate publish validation failed/);
  });
});
