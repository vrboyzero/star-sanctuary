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
    expect(created?.candidate.slug).toBe("候选层-实现-闭环");
    expect(created?.candidate.content).toContain("# 实现候选层");
    expect(created?.candidate.content).toContain("## 0. 元信息");
    expect(created?.candidate.content).toContain("## 1. 触发条件");
    expect(created?.candidate.content).toContain("| 条件 | 说明 | 来源信号 |");
    expect(created?.candidate.content).toContain("## 3. 执行步骤");
    expect(created?.candidate.content).toContain("## 5. 失败经验");
    expect(created?.candidate.content).toContain("## 8. 更新记录");
    expect(reused?.reusedExisting).toBe(true);
    expect(reused?.candidate.id).toBe(created?.candidate.id);
  });

  it("creates a skill candidate with reusable skill structure instead of task report", () => {
    const created = manager.promoteTaskToSkillCandidate("task_exp_1");

    expect(created?.reusedExisting).toBe(false);
    expect(created?.candidate.type).toBe("skill");
    expect(created?.candidate.status).toBe("draft");
    expect(created?.candidate.slug).toBe("skill-task-exp-1");
    expect(created?.candidate.content).toContain('name: "skill-task-exp-1"');
    expect(created?.candidate.content).toContain('description: "将与 完成 P5-A 的候选层最小闭环 相近的问题收敛为可复用执行路由');
    expect(created?.candidate.content).toContain("## 快速开始");
    expect(created?.candidate.content).toContain("## 决策路由");
    expect(created?.candidate.content).toContain("## 输入");
    expect(created?.candidate.content).toContain("## 输出");
    expect(created?.candidate.content).toContain("## NEVER");
    expect(created?.candidate.content).not.toContain("Conversation:");
    expect(created?.candidate.content).not.toContain("Status:");
  });

  it("reuses an exact candidate from another task as system-level dedup", () => {
    (manager as any).store.createTask({
      id: "task_exp_2",
      conversationId: "conv_exp_2",
      sessionKey: "session_exp_2",
      source: "chat",
      status: "success",
      title: "实现候选层",
      objective: "完成同类候选层闭环",
      summary: "已经整理出类型、存储和工具入口。",
      reflection: "保持候选层先落库，避免正式资产被错误污染。",
      outcome: "候选层基础闭环可以运行。",
      toolCalls: [{ toolName: "memory_search", success: true, durationMs: 60 }],
      artifactPaths: ["MemOS对比分析-v2.md"],
      startedAt: "2026-03-16T00:00:00.000Z",
      finishedAt: "2026-03-16T00:00:00.000Z",
      createdAt: "2026-03-16T00:00:00.000Z",
      updatedAt: "2026-03-16T00:00:00.000Z",
    });

    const first = manager.promoteTaskToMethodCandidate("task_exp_1");
    const deduped = manager.promoteTaskToMethodCandidate("task_exp_2");

    expect(first?.candidate.id).toBeTruthy();
    expect(deduped?.reusedExisting).toBe(true);
    expect(deduped?.candidate.id).toBe(first?.candidate.id);
    expect(deduped?.dedupDecision).toBe("duplicate_existing");
    expect(deduped?.exactMatch?.candidateId).toBe(first?.candidate.id);
  });

  it("attaches similar existing method assets to the promotion result", async () => {
    const methodsDir = path.join(workspaceRoot, "methods");
    await fs.mkdir(methodsDir, { recursive: true });
    await fs.writeFile(
      path.join(methodsDir, "候选层-实现-闭环.md"),
      [
        "---",
        'summary: "已经整理出类型、存储和工具入口。"',
        "---",
        "",
        "# 实现候选层",
        "",
        "## 适用场景",
        "处理候选层实现与治理。",
      ].join("\n"),
      "utf-8",
    );

    const result = manager.promoteTaskToMethodCandidate("task_exp_1");
    expect(result?.reusedExisting).toBe(false);
    expect(result?.dedupDecision).toBe("similar_existing");
    expect(result?.similarMatches?.some((item) => item.source === "method_asset")).toBe(true);
  });

  it("checks duplicates before generation without creating a candidate", async () => {
    const methodsDir = path.join(workspaceRoot, "methods");
    await fs.mkdir(methodsDir, { recursive: true });
    await fs.writeFile(
      path.join(methodsDir, "候选层-实现-闭环.md"),
      [
        "---",
        'summary: "已经整理出类型、存储和工具入口。"',
        "---",
        "",
        "# 实现候选层",
      ].join("\n"),
      "utf-8",
    );

    const preview = manager.checkTaskMethodCandidateDuplicate("task_exp_1");

    expect(preview?.type).toBe("method");
    expect(preview?.decision).toBe("similar_existing");
    expect(preview?.title).toBe("实现候选层");
    expect(preview?.similarMatches.some((item) => item.source === "method_asset")).toBe(true);
    expect(manager.listExperienceCandidates(10, { taskId: "task_exp_1", type: "method" })).toHaveLength(0);
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

  it("does not auto-promote ordinary chat tasks without execution evidence", () => {
    const taskId = manager.startTaskCapture({
      conversationId: "conv_chat_plain",
      sessionKey: "session_chat_plain",
      source: "chat",
      objective: "小贝早上好",
    });

    expect(taskId).toBeTruthy();
    const completedTaskId = manager.completeTaskCapture({
      conversationId: "conv_chat_plain",
      success: true,
      durationMs: 180,
    });

    expect(completedTaskId).toBe(taskId);
    const task = manager.getTask(taskId!);
    expect(task).toMatchObject({
      source: "chat",
      objective: "小贝早上好",
    });
    const candidates = manager.listExperienceCandidates(10, { taskId: taskId! });
    expect(candidates).toHaveLength(0);
  });

  it("does not auto-promote chat tasks that only send email", () => {
    const taskId = manager.startTaskCapture({
      conversationId: "conv_send_email",
      sessionKey: "session_send_email",
      source: "chat",
      objective: "给客户发一封跟进邮件",
    });

    expect(taskId).toBeTruthy();
    manager.recordTaskToolCall("conv_send_email", {
      toolName: "send_email",
      success: true,
      durationMs: 120,
    });

    const completedTaskId = manager.completeTaskCapture({
      conversationId: "conv_send_email",
      success: true,
      durationMs: 420,
    });

    expect(completedTaskId).toBe(taskId);
    expect(manager.listExperienceCandidates(10, { taskId: taskId! })).toHaveLength(0);
  });

  it("does not auto-promote email thread tasks even with execution evidence", () => {
    const conversationId = "channel=email:scope=per-account-thread:provider=imap:account=default:thread=%3Cthread-1%40example.com%3E";
    const taskId = manager.startTaskCapture({
      conversationId,
      sessionKey: conversationId,
      source: "chat",
      objective: "处理并回复一封入站邮件",
    });

    expect(taskId).toBeTruthy();
    manager.recordTaskToolCall(conversationId, {
      toolName: "memory_search",
      success: true,
      durationMs: 80,
    });

    const completedTaskId = manager.completeTaskCapture({
      conversationId,
      success: true,
      durationMs: 560,
    });

    expect(completedTaskId).toBe(taskId);
    expect(manager.listExperienceCandidates(10, { taskId: taskId! })).toHaveLength(0);
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
    expect(path.basename(accepted!.publishedPath!)).toBe("候选层-实现-闭环.md");

    const content = await fs.readFile(accepted!.publishedPath!, "utf-8");
    expect(content).toContain("# 实现候选层");
    expect(content).toContain("## 3. 执行步骤");
  });

  it("rejects publishing malformed method candidates before write", () => {
    manager.upsertExperienceCandidate({
      id: "exp_invalid_method",
      taskId: "task_exp_1",
      type: "method",
      status: "draft",
      title: "不完整方法",
      slug: "不完整方法",
      content: "# 不完整方法\n\n## 0. 元信息\n| 属性 | 内容 |",
      summary: "不完整",
      createdAt: "2026-03-15T00:00:00.000Z",
      sourceTaskSnapshot: {
        taskId: "task_exp_1",
        conversationId: "conv_exp_1",
        source: "chat",
        status: "success",
        startedAt: "2026-03-15T00:00:00.000Z",
      },
    });

    expect(() => manager.acceptExperienceCandidate("exp_invalid_method")).toThrow(
      /Method candidate publish validation failed/,
    );
  });
});
