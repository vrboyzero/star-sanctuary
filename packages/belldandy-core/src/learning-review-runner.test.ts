import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MemoryManager } from "@belldandy/memory";

import { runGoalReviewScanLearningReview, runPostTaskLearningReview } from "./learning-review-runner.js";

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

  it("skips goal review scan generation when actionable reviews still exist", async () => {
    let generateCalled = false;
    const result = await runGoalReviewScanLearningReview({
      stateDir,
      agentId: "default",
      governanceSummary: {
        goal: {
          id: "goal_actionable",
          title: "收口 actionable reviews",
          status: "executing",
          goalRoot: "goalRoot",
          runtimeRoot: "runtimeRoot",
          docRoot: "docRoot",
          northstarPath: "northstar",
          tasksPath: "tasks",
          progressPath: "progress",
          handoffPath: "handoff",
          registryPath: "registry",
          pathSource: "default",
          lastRunId: "run_1",
          createdAt: "2026-04-10T00:00:00.000Z",
          updatedAt: "2026-04-10T00:00:00.000Z",
        } as any,
        reviews: {
          version: 1,
          items: [
            {
              id: "review_pending",
              goalId: "goal_actionable",
              suggestionType: "method_candidate",
              suggestionId: "method_1",
              title: "方法候选 1",
              summary: "待审阅",
              sourcePath: "runtime/methods.json",
              status: "pending_review",
              evidenceRefs: [],
              createdAt: "2026-04-10T00:00:00.000Z",
              updatedAt: "2026-04-10T00:00:00.000Z",
            },
          ],
        },
        actionableReviews: [
          {
            id: "review_pending",
            goalId: "goal_actionable",
            suggestionType: "method_candidate",
            suggestionId: "method_1",
            title: "方法候选 1",
            summary: "待审阅",
            sourcePath: "runtime/methods.json",
            status: "pending_review",
            evidenceRefs: [],
            createdAt: "2026-04-10T00:00:00.000Z",
            updatedAt: "2026-04-10T00:00:00.000Z",
          },
        ],
        actionableCheckpoints: [],
        crossGoal: { items: [] },
        recommendations: ["优先处理待审阅 suggestion：方法候选 1"],
      } as any,
      generateSuggestions: async () => {
        generateCalled = true;
        throw new Error("should not generate while actionable reviews exist");
      },
    });

    expect(generateCalled).toBe(false);
    expect(result.generated).toBe(false);
    expect(result.summary).toContain("skipped=actionable_reviews:1/1");
    expect(result.recommendations[0]).toContain("仍有待处理的 review / publish 项");
  });

  it("allows goal review scan refresh when only settled review history remains", async () => {
    let generateCalled = false;
    const result = await runGoalReviewScanLearningReview({
      stateDir,
      agentId: "default",
      governanceSummary: {
        goal: {
          id: "goal_refreshable",
          title: "允许 refresh",
          status: "executing",
          goalRoot: "goalRoot",
          runtimeRoot: "runtimeRoot",
          docRoot: "docRoot",
          northstarPath: "northstar",
          tasksPath: "tasks",
          progressPath: "progress",
          handoffPath: "handoff",
          registryPath: "registry",
          pathSource: "default",
          lastRunId: "run_2",
          createdAt: "2026-04-10T00:00:00.000Z",
          updatedAt: "2026-04-10T00:00:00.000Z",
        } as any,
        reviews: {
          version: 1,
          items: [
            {
              id: "review_accepted",
              goalId: "goal_refreshable",
              suggestionType: "method_candidate",
              suggestionId: "method_done",
              title: "已发布方法候选",
              summary: "已发布",
              sourcePath: "runtime/methods.json",
              status: "accepted",
              evidenceRefs: [],
              createdAt: "2026-04-10T00:00:00.000Z",
              updatedAt: "2026-04-10T00:00:00.000Z",
            },
          ],
        },
        actionableReviews: [],
        actionableCheckpoints: [],
        crossGoal: { items: [] },
        recommendations: [],
      } as any,
      generateSuggestions: async () => {
        generateCalled = true;
        return {
          generatedAt: "2026-04-10T00:10:00.000Z",
          methodCandidates: { count: 1, items: [], markdownPath: "m.md", jsonPath: "m.json" },
          skillCandidates: { count: 0, items: [], markdownPath: "s.md", jsonPath: "s.json" },
          flowPatterns: { count: 0, items: [], markdownPath: "f.md", jsonPath: "f.json" },
          recommendations: ["优先审阅新的 method candidate"],
        } as any;
      },
      syncReviews: async () => ({ version: 1, items: [] }),
    });

    expect(generateCalled).toBe(true);
    expect(result.generated).toBe(true);
    expect(result.summary).toContain("generated=1");
    expect(result.summary).toContain("priority=method");
    expect(result.suggestionCounts).toMatchObject({ method: 1, skill: 0, flow: 0 });
    expect(result.recommendations[0]).toContain("当前 refresh 优先级：method candidate");
  });

  it("prioritizes flow refresh when cross-goal or checkpoint governance signals are present", async () => {
    const result = await runGoalReviewScanLearningReview({
      stateDir,
      agentId: "default",
      governanceSummary: {
        goal: {
          id: "goal_flow_priority",
          title: "优先处理 flow",
          status: "executing",
          goalRoot: "goalRoot",
          runtimeRoot: "runtimeRoot",
          docRoot: "docRoot",
          northstarPath: "northstar",
          tasksPath: "tasks",
          progressPath: "progress",
          handoffPath: "handoff",
          registryPath: "registry",
          pathSource: "default",
          lastRunId: "run_3",
          createdAt: "2026-04-10T00:00:00.000Z",
          updatedAt: "2026-04-10T00:00:00.000Z",
        } as any,
        reviews: { version: 1, items: [] },
        actionableReviews: [],
        actionableCheckpoints: [
          {
            id: "checkpoint_1",
            title: "等待 checkpoint 收口",
            status: "required",
          },
        ],
        checkpointWorkflowPendingCount: 1,
        checkpointWorkflowOverdueCount: 0,
        crossGoal: {
          items: [
            { id: "flow_repeat_1", summary: "高频流程命中" },
          ],
        },
        reviewTypeCounts: {
          method_candidate: 1,
          skill_candidate: 1,
          flow_pattern: 0,
        },
        recommendations: ["当前 goal 已命中跨 goal 高频流程"],
      } as any,
      generateSuggestions: async () => ({
        generatedAt: "2026-04-10T00:20:00.000Z",
        methodCandidates: { count: 1, items: [], markdownPath: "m.md", jsonPath: "m.json" },
        skillCandidates: { count: 1, items: [], markdownPath: "s.md", jsonPath: "s.json" },
        flowPatterns: { count: 2, items: [], markdownPath: "f.md", jsonPath: "f.json" },
        recommendations: ["优先观察高频流程", "优先审阅 method candidate"],
      } as any),
      syncReviews: async () => ({ version: 1, items: [] }),
    });

    expect(result.generated).toBe(true);
    expect(result.summary).toContain("priority=flow");
    expect(result.recommendations[0]).toContain("当前 refresh 优先级：flow pattern");
  });

  it("skips refresh when fingerprint matches the last refreshed signal", async () => {
    let generateCalled = false;
    const result = await runGoalReviewScanLearningReview({
      stateDir,
      agentId: "default",
      governanceSummary: {
        goal: {
          id: "goal_unchanged_signal",
          title: "跳过重复 refresh",
          status: "executing",
          goalRoot: "goalRoot",
          runtimeRoot: "runtimeRoot",
          docRoot: "docRoot",
          northstarPath: "northstar",
          tasksPath: "tasks",
          progressPath: "progress",
          handoffPath: "handoff",
          registryPath: "registry",
          pathSource: "default",
          lastRunId: "run_same",
          createdAt: "2026-04-10T00:00:00.000Z",
          updatedAt: "2026-04-10T00:00:00.000Z",
        } as any,
        reviews: { version: 1, items: [] },
        actionableReviews: [],
        actionableCheckpoints: [],
        crossGoal: { items: [] },
        recommendations: ["当前没有待处理的 review / publish 项；如需继续提升，可转入 review chain / quorum / escalation workflow。"],
      } as any,
      refreshState: {
        version: 1,
        lastRefreshAt: "2026-04-10T00:10:00.000Z",
        lastRefreshFingerprint: "same-fingerprint",
        lastOutcome: "generated",
      },
      refreshFingerprint: "same-fingerprint",
      generateSuggestions: async () => {
        generateCalled = true;
        throw new Error("should not generate when fingerprint is unchanged");
      },
    });

    expect(generateCalled).toBe(false);
    expect(result.outcome).toBe("unchanged_signal");
    expect(result.refreshed).toBe(false);
    expect(result.summary).toContain("skipped=unchanged_signal");
    expect(result.recommendations[0]).toContain("没有新的运行信号");
  });
});
