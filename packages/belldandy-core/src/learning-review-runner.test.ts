import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MemoryManager } from "@belldandy/memory";

import { runPostTaskLearningReview } from "./learning-review-runner.js";

describe("learning review runner", () => {
  let stateDir: string;
  let manager: MemoryManager;

  beforeEach(async () => {
    stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "ss-learning-review-"));
    manager = new MemoryManager({
      workspaceRoot: stateDir,
      stateDir,
      taskMemoryEnabled: true,
      experienceAutoPromotionEnabled: false,
    });

    const now = "2026-04-09T12:00:00.000Z";
    (manager as any).store.createTask({
      id: "task_learning_1",
      conversationId: "conv_learning_1",
      sessionKey: "agent:default:main",
      agentId: "default",
      source: "chat",
      status: "success",
      title: "整理 learning runner",
      objective: "把 learningReviewInput 接到 post-run runner",
      summary: "已经收敛最小 runner 与接线点。",
      reflection: "优先保留 candidate/review/publish 治理链，不做自动发布。",
      outcome: "第一版 learning loop 可以生成 candidate。",
      toolCalls: [{ toolName: "apply_patch", success: true, durationMs: 120 }],
      artifactPaths: ["docs/plan.md"],
      startedAt: now,
      finishedAt: now,
      createdAt: now,
      updatedAt: now,
    });
  });

  afterEach(async () => {
    manager.close();
    await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  });

  it("generates method and skill candidates from post-run learning review", async () => {
    const result = await runPostTaskLearningReview({
      stateDir,
      agentId: "default",
      task: manager.getTaskDetail("task_learning_1"),
      findCandidate: (taskId, type) => manager.findExperienceCandidateByTaskAndType(taskId, type),
      promote: (taskId, type) => type === "method"
        ? manager.promoteTaskToMethodCandidate(taskId)
        : manager.promoteTaskToSkillCandidate(taskId),
    });

    expect(result).toBeTruthy();
    expect(result?.generated).toBe(true);
    expect(result?.learningReviewInput.summary.taskSignalCount).toBeGreaterThan(0);
    expect(result?.actions.map((item) => item.status)).toEqual(["generated", "generated"]);
    expect(manager.listExperienceCandidates(10, { taskId: "task_learning_1" })).toHaveLength(2);
  });

  it("reuses existing candidates instead of generating duplicates", async () => {
    manager.promoteTaskToMethodCandidate("task_learning_1");
    manager.promoteTaskToSkillCandidate("task_learning_1");

    const result = await runPostTaskLearningReview({
      stateDir,
      agentId: "default",
      task: manager.getTaskDetail("task_learning_1"),
      findCandidate: (taskId, type) => manager.findExperienceCandidateByTaskAndType(taskId, type),
      promote: (taskId, type) => type === "method"
        ? manager.promoteTaskToMethodCandidate(taskId)
        : manager.promoteTaskToSkillCandidate(taskId),
    });

    expect(result?.generated).toBe(false);
    expect(result?.actions.map((item) => item.status)).toEqual(["existing", "existing"]);
    expect(manager.listExperienceCandidates(10, { taskId: "task_learning_1" })).toHaveLength(2);
  });
});
