import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { MemoryManager } from "./manager.js";

describe("ExperiencePromoter", () => {
  let workspaceRoot: string;
  let manager: MemoryManager;

  beforeEach(async () => {
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-experience-"));
    manager = new MemoryManager({
      workspaceRoot,
      stateDir: workspaceRoot,
      taskMemoryEnabled: true,
    });

    const now = "2026-03-15T00:00:00.000Z";
    (manager as any).store.createTask({
      id: "task_exp_1",
      conversationId: "conv_exp_1",
      sessionKey: "session_exp_1",
      source: "chat",
      status: "success",
      title: "实现候选层",
      objective: "完成 P5-A 的候选层最小闭环",
      summary: "已经整理出类型、存储和工具入口。",
      reflection: "保持候选层先落库，避免正式资产被错误污染。",
      outcome: "候选层基础闭环可以运行。",
      toolCalls: [{ toolName: "memory_search", success: true, durationMs: 80 }],
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

  it("creates a method candidate and reuses duplicates", () => {
    const created = manager.promoteTaskToMethodCandidate("task_exp_1");
    const reused = manager.promoteTaskToMethodCandidate("task_exp_1");

    expect(created?.reusedExisting).toBe(false);
    expect(created?.candidate.type).toBe("method");
    expect(created?.candidate.status).toBe("draft");
    expect(created?.candidate.content).toContain("# 实现候选层 方法候选");
    expect(reused?.reusedExisting).toBe(true);
    expect(reused?.candidate.id).toBe(created?.candidate.id);
  });

  it("lists and updates candidate status", () => {
    const skillCandidate = manager.promoteTaskToSkillCandidate("task_exp_1");
    const methodCandidate = manager.promoteTaskToMethodCandidate("task_exp_1");
    expect(skillCandidate?.candidate.id).toBeTruthy();
    expect(methodCandidate?.candidate.id).toBeTruthy();

    const listed = manager.listExperienceCandidates(10, { status: "draft" });
    expect(listed.length).toBe(2);

    const accepted = manager.acceptExperienceCandidate(skillCandidate!.candidate.id);
    expect(accepted?.status).toBe("accepted");
    expect(accepted?.acceptedAt).toBeTruthy();
    expect(accepted?.reviewedAt).toBeTruthy();

    const rejected = manager.rejectExperienceCandidate(methodCandidate!.candidate.id);
    expect(rejected?.status).toBe("rejected");
    expect(rejected?.rejectedAt).toBeTruthy();

    const invalidReject = manager.rejectExperienceCandidate(skillCandidate!.candidate.id);
    expect(invalidReject).toBeNull();
    expect(manager.getExperienceCandidate(skillCandidate!.candidate.id)?.status).toBe("accepted");
  });

  it("auto-promotes method and skill candidates after successful task completion by default", () => {
    const taskId = manager.startTaskCapture({
      conversationId: "conv_auto_1",
      sessionKey: "session_auto_1",
      source: "chat",
      objective: "验证自动经验沉淀",
    });

    expect(taskId).toBeTruthy();
    manager.recordTaskToolCall("conv_auto_1", {
      toolName: "memory_search",
      success: true,
      durationMs: 50,
    });

    const completedTaskId = manager.completeTaskCapture({
      conversationId: "conv_auto_1",
      success: true,
      durationMs: 500,
    });

    expect(completedTaskId).toBe(taskId);
    const candidates = manager.listExperienceCandidates(10, { taskId: taskId! });
    expect(candidates).toHaveLength(2);
    expect(candidates.map((item) => item.type).sort()).toEqual(["method", "skill"]);
  });

  it("does not auto-promote when the switch is disabled", async () => {
    manager.close();
    await fs.rm(workspaceRoot, { recursive: true, force: true }).catch(() => { });

    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-experience-"));
    manager = new MemoryManager({
      workspaceRoot,
      stateDir: workspaceRoot,
      taskMemoryEnabled: true,
      experienceAutoPromotionEnabled: false,
    });

    const taskId = manager.startTaskCapture({
      conversationId: "conv_auto_off",
      sessionKey: "session_auto_off",
      source: "chat",
      objective: "验证关闭自动经验沉淀",
    });

    expect(taskId).toBeTruthy();
    const completedTaskId = manager.completeTaskCapture({
      conversationId: "conv_auto_off",
      success: true,
      durationMs: 300,
    });

    expect(completedTaskId).toBe(taskId);
    const candidates = manager.listExperienceCandidates(10, { taskId: taskId! });
    expect(candidates).toHaveLength(0);
  });

  it("publishes accepted method candidates into methods directory", async () => {
    const created = manager.promoteTaskToMethodCandidate("task_exp_1");
    expect(created?.candidate.id).toBeTruthy();

    const accepted = manager.acceptExperienceCandidate(created!.candidate.id);
    expect(accepted?.status).toBe("accepted");
    expect(accepted?.publishedPath).toBeTruthy();
    expect(accepted?.publishedPath).toContain(path.join(workspaceRoot, "methods"));

    const content = await fs.readFile(accepted!.publishedPath!, "utf-8");
    expect(content).toContain("# 实现候选层 方法候选");
  });
});
