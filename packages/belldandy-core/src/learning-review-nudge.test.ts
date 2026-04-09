import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MemoryManager } from "@belldandy/memory";

import { buildLearningReviewNudgePrelude } from "./learning-review-nudge.js";

describe("buildLearningReviewNudgePrelude", () => {
  let stateDir: string;
  let manager: MemoryManager;

  beforeEach(async () => {
    stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "ss-learning-review-nudge-"));
    manager = new MemoryManager({
      workspaceRoot: stateDir,
      stateDir,
      taskMemoryEnabled: true,
      experienceAutoPromotionEnabled: false,
    });
  });

  afterEach(async () => {
    manager.close();
    await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  });

  it("builds prompt/runtime nudges only when the current turn explicitly asks for learning/review follow-up", async () => {
    const now = "2026-04-09T16:00:00.000Z";
    (manager as any).store.createTask({
      id: "task_draft_1",
      conversationId: "conv_draft_1",
      sessionKey: "agent:default:main",
      agentId: "default",
      source: "chat",
      status: "success",
      title: "已有候选任务",
      summary: "已经可以形成方法候选。",
      toolCalls: [{ toolName: "apply_patch", success: true, durationMs: 80 }],
      artifactPaths: ["docs/a.md"],
      startedAt: now,
      finishedAt: now,
      createdAt: now,
      updatedAt: now,
    });
    manager.promoteTaskToMethodCandidate("task_draft_1");

    (manager as any).store.createTask({
      id: "task_target_1",
      conversationId: "conv_target_1",
      sessionKey: "agent:default:main",
      agentId: "default",
      source: "chat",
      status: "success",
      title: "待沉淀 workflow",
      summary: "这次收口已经形成稳定流程。",
      reflection: "可以沉淀成 method/skill。",
      toolCalls: [{ toolName: "memory_search", success: true, durationMs: 50 }],
      artifactPaths: ["docs/target.md"],
      startedAt: now,
      finishedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const result = await buildLearningReviewNudgePrelude({
      stateDir,
      agentId: "default",
      sessionKey: "agent:default:main",
      currentTurnText: "帮我整理这轮任务的经验候选、方法沉淀和技能草案",
      manager,
    });

    expect(result?.prependContext).toContain("<learning-review-nudge");
    expect(result?.prependContext).toContain("experience_candidate_list");
    expect(result?.prependContext).toContain("task_promote_method");
    expect(result?.prependContext).toContain("task_promote_skill_draft");
    expect(result?.deltas?.[0]?.metadata).toMatchObject({
      blockTag: "learning-review-nudge",
    });
  });

  it("adds goal review queue nudges in goal sessions", async () => {
    const result = await buildLearningReviewNudgePrelude({
      stateDir,
      agentId: "default",
      sessionKey: "goal:goal_123",
      manager,
      getGoalReviewNudgeSummary: async () => ({
        pendingReviewCount: 2,
        needsRevisionCount: 1,
      }),
    });

    expect(result?.prependContext).toContain("goal_suggestion_review_list");
    expect(result?.prependContext).toContain("goal_review_governance_summary");
    expect(result?.prependContext).toContain("pending 2 / needs_revision 1");
  });

  it("does not inject nudges for ordinary chat turns without explicit learning/review intent", async () => {
    const now = "2026-04-09T16:00:00.000Z";
    (manager as any).store.createTask({
      id: "task_target_2",
      conversationId: "conv_target_2",
      sessionKey: "agent:default:main",
      agentId: "default",
      source: "chat",
      status: "success",
      title: "已有可沉淀任务",
      summary: "这次实现已经形成稳定流程。",
      reflection: "理论上可以继续做经验沉淀。",
      toolCalls: [{ toolName: "apply_patch", success: true, durationMs: 50 }],
      artifactPaths: ["docs/target-2.md"],
      startedAt: now,
      finishedAt: now,
      createdAt: now,
      updatedAt: now,
    });

    const result = await buildLearningReviewNudgePrelude({
      stateDir,
      agentId: "default",
      sessionKey: "agent:default:main",
      currentTurnText: "最近有什么事吗？",
      manager,
    });

    expect(result).toBeUndefined();
  });
});
