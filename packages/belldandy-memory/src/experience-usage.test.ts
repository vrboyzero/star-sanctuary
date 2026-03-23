import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { MemoryManager } from "./manager.js";

describe("ExperienceUsage", () => {
  let workspaceRoot: string;
  let manager: MemoryManager;

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-experience-usage-"));
    manager = new MemoryManager({
      workspaceRoot,
      stateDir: workspaceRoot,
      taskMemoryEnabled: true,
    });

    const now = "2026-03-16T00:00:00.000Z";
    (manager as any).store.createTask({
      id: "task_usage_1",
      conversationId: "conv_usage_1",
      sessionKey: "session_usage_1",
      source: "chat",
      status: "success",
      title: "使用已沉淀经验",
      objective: "验证 P6-A 经验消费记录层",
      summary: "method 和 skill 的使用记录应该可回链到 task。",
      reflection: "先做 usage 数据底座，再补命中与展示链路。",
      outcome: "usage 可以被查询和聚合。",
      toolCalls: [{ toolName: "method_read", success: true, durationMs: 40 }],
      artifactPaths: ["MemOS对比分析.md"],
      startedAt: now,
      finishedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  });

  afterEach(async () => {
    manager.close();
    await fs.rm(workspaceRoot, { recursive: true, force: true }).catch(() => { });
  });

  it("records method and skill usage with task back-link", () => {
    const methodUsage = manager.recordMethodUsage("task_usage_1", "web-browser-automation.md", {
      sourceCandidateId: "exp-method-1",
      usedVia: "tool",
    });
    const skillUsage = manager.recordSkillUsage("task_usage_1", "网页自动化技能草稿", {
      sourceCandidateId: "exp-skill-1",
      usedVia: "search",
    });

    expect(methodUsage?.reusedExisting).toBe(false);
    expect(methodUsage?.usage.taskId).toBe("task_usage_1");
    expect(methodUsage?.usage.assetType).toBe("method");
    expect(methodUsage?.usage.assetKey).toBe("web-browser-automation.md");

    expect(skillUsage?.reusedExisting).toBe(false);
    expect(skillUsage?.usage.assetType).toBe("skill");
    expect(skillUsage?.usage.assetKey).toBe("网页自动化技能草稿");

    const usages = manager.listExperienceUsages(10, { taskId: "task_usage_1" });
    expect(usages).toHaveLength(2);
    expect(usages.map((item) => item.assetType).sort()).toEqual(["method", "skill"]);
  });

  it("reuses duplicate usage for the same task and asset", () => {
    const first = manager.recordMethodUsage("task_usage_1", "web-browser-automation.md");
    const second = manager.recordMethodUsage("task_usage_1", "web-browser-automation.md", {
      usedVia: "manual",
    });

    expect(first?.reusedExisting).toBe(false);
    expect(second?.reusedExisting).toBe(true);
    expect(second?.usage.id).toBe(first?.usage.id);

    const usages = manager.listExperienceUsages(10, {
      taskId: "task_usage_1",
      assetType: "method",
      assetKey: "web-browser-automation.md",
    });
    expect(usages).toHaveLength(1);
  });

  it("aggregates usage stats by asset", () => {
    (manager as any).store.createExperienceCandidate({
      id: "exp-method-1",
      taskId: "task_usage_1",
      type: "method",
      status: "accepted",
      title: "Web Browser Automation",
      slug: "web-browser-automation",
      content: "# Web Browser Automation",
      sourceTaskSnapshot: {
        taskId: "task_usage_1",
        conversationId: "conv_usage_1",
        source: "chat",
        status: "success",
        startedAt: "2026-03-16T00:00:00.000Z",
      },
      publishedPath: path.join(workspaceRoot, "methods", "web-browser-automation.md"),
      createdAt: "2026-03-16T00:00:00.000Z",
      acceptedAt: "2026-03-16T00:10:00.000Z",
    });

    manager.recordMethodUsage("task_usage_1", "web-browser-automation.md", {
      sourceCandidateId: "exp-method-1",
      usedVia: "tool",
    });

    const now = "2026-03-16T01:00:00.000Z";
    (manager as any).store.createTask({
      id: "task_usage_2",
      conversationId: "conv_usage_2",
      sessionKey: "session_usage_2",
      source: "chat",
      status: "success",
      title: "再次使用方法",
      objective: "验证 usage 聚合统计",
      startedAt: now,
      finishedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const second = manager.recordMethodUsage("task_usage_2", "web-browser-automation.md", {
      sourceCandidateId: "exp-method-1",
      usedVia: "manual",
    });

    expect(second?.reusedExisting).toBe(false);

    const stats = manager.getExperienceUsageStats("method", "web-browser-automation.md");
    expect(stats.usageCount).toBe(2);
    expect(stats.lastUsedTaskId).toBe("task_usage_2");
    expect(stats.lastUsedAt).toBeTruthy();
    expect(stats.sourceCandidateId).toBe("exp-method-1");
    expect(stats.sourceCandidateType).toBe("method");
    expect(stats.sourceCandidateTitle).toBe("Web Browser Automation");
    expect(stats.sourceCandidateStatus).toBe("accepted");
    expect(stats.sourceCandidateTaskId).toBe("task_usage_1");
    expect(stats.sourceCandidatePublishedPath).toBe(path.join(workspaceRoot, "methods", "web-browser-automation.md"));

    const listedStats = manager.listExperienceUsageStats(10, { assetType: "method" });
    expect(listedStats).toHaveLength(1);
    expect(listedStats[0].assetKey).toBe("web-browser-automation.md");
    expect(listedStats[0].usageCount).toBe(2);
    expect(listedStats[0].sourceCandidateType).toBe("method");
    expect(listedStats[0].sourceCandidateTitle).toBe("Web Browser Automation");
    expect(listedStats[0].sourceCandidateStatus).toBe("accepted");
    expect(listedStats[0].sourceCandidateTaskId).toBe("task_usage_1");
    expect(listedStats[0].sourceCandidatePublishedPath).toBe(path.join(workspaceRoot, "methods", "web-browser-automation.md"));
  });

  it("infers method source candidate from published method filename", () => {
    const created = manager.promoteTaskToMethodCandidate("task_usage_1");
    expect(created?.candidate.id).toBeTruthy();

    const accepted = manager.acceptExperienceCandidate(created!.candidate.id);
    expect(accepted?.publishedPath).toBeTruthy();

    const recorded = manager.recordMethodUsage("task_usage_1", path.basename(accepted!.publishedPath!));
    expect(recorded?.reusedExisting).toBe(false);
    expect(recorded?.usage.sourceCandidateId).toBe(created?.candidate.id);
  });

  it("infers skill source candidate from accepted skill name", () => {
    const created = manager.promoteTaskToSkillCandidate("task_usage_1");
    expect(created?.candidate.id).toBeTruthy();

    const publishedPath = path.join(workspaceRoot, "skills", "skill-task-usage-1", "SKILL.md");
    const accepted = manager.acceptExperienceCandidate(created!.candidate.id, { publishedPath });
    expect(accepted?.publishedPath).toBe(publishedPath);

    const recorded = manager.recordSkillUsage("task_usage_1", "使用已沉淀经验 技能草稿");
    expect(recorded?.reusedExisting).toBe(false);
    expect(recorded?.usage.sourceCandidateId).toBe(created?.candidate.id);
  });

  it("revokes usage by usageId and recomputes aggregate stats", () => {
    manager.recordMethodUsage("task_usage_1", "web-browser-automation.md", {
      sourceCandidateId: "exp-method-1",
      usedVia: "tool",
    });

    const now = "2026-03-16T01:00:00.000Z";
    (manager as any).store.createTask({
      id: "task_usage_2",
      conversationId: "conv_usage_2",
      sessionKey: "session_usage_2",
      source: "chat",
      status: "success",
      title: "再次使用方法",
      objective: "验证 usage 撤销",
      startedAt: now,
      finishedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const second = manager.recordMethodUsage("task_usage_2", "web-browser-automation.md", {
      sourceCandidateId: "exp-method-1",
      usedVia: "manual",
    });
    expect(second?.usage.id).toBeTruthy();

    const revoked = manager.revokeExperienceUsage({ usageId: second!.usage.id });
    expect(revoked?.id).toBe(second?.usage.id);

    const stats = manager.getExperienceUsageStats("method", "web-browser-automation.md");
    expect(stats.usageCount).toBe(1);
    expect(stats.lastUsedTaskId).toBe("task_usage_1");
  });

  it("revokes usage by task and asset", () => {
    manager.recordSkillUsage("task_usage_1", "网页自动化技能草稿", {
      sourceCandidateId: "exp-skill-1",
      usedVia: "tool",
    });

    const revoked = manager.revokeExperienceUsage({
      taskId: "task_usage_1",
      assetType: "skill",
      assetKey: "网页自动化技能草稿",
    });
    expect(revoked?.taskId).toBe("task_usage_1");
    expect(revoked?.assetType).toBe("skill");

    const usages = manager.listExperienceUsages(10, { taskId: "task_usage_1" });
    expect(usages).toHaveLength(0);
  });
});
