import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MemoryManager } from "@belldandy/memory";

import { buildSkillFreshnessSnapshot } from "./skill-freshness.js";
import { updateSkillFreshnessManualMark } from "./skill-freshness-state.js";

describe("skill freshness", () => {
  let stateDir: string;
  let workspaceRoot: string;
  let manager: MemoryManager;

  beforeEach(async () => {
    stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-skill-freshness-state-"));
    workspaceRoot = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-skill-freshness-workspace-"));
    manager = new MemoryManager({
      workspaceRoot,
      stateDir,
      taskMemoryEnabled: true,
    });
  });

  afterEach(async () => {
    manager.close();
    await fs.rm(workspaceRoot, { recursive: true, force: true }).catch(() => {});
    await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  });

  it("marks an accepted skill as needs_patch when recent failures and patch candidates accumulate", async () => {
    const acceptedCandidateId = "exp-skill-accepted-1";
    const skillName = "Automation Skill";
    const acceptedPublishedPath = path.join(workspaceRoot, "skills", "automation-skill", "SKILL.md");

    (manager as any).store.createExperienceCandidate({
      id: acceptedCandidateId,
      taskId: "task-source-1",
      type: "skill",
      status: "accepted",
      title: skillName,
      slug: "automation-skill",
      content: `name: ${skillName}\n# Automation Skill`,
      sourceTaskSnapshot: {
        taskId: "task-source-1",
        conversationId: "conv-source-1",
        source: "chat",
        status: "success",
        startedAt: "2026-04-10T00:00:00.000Z",
      },
      publishedPath: acceptedPublishedPath,
      createdAt: "2026-04-10T00:00:00.000Z",
      acceptedAt: "2026-04-10T00:05:00.000Z",
    });

    const tasks = [
      { id: "task-use-failed-1", status: "failed" as const, createdAt: "2026-04-10T01:00:00.000Z" },
      { id: "task-use-failed-2", status: "partial" as const, createdAt: "2026-04-10T02:00:00.000Z" },
      { id: "task-use-success-1", status: "success" as const, createdAt: "2026-04-10T03:00:00.000Z" },
      { id: "task-use-failed-3", status: "failed" as const, createdAt: "2026-04-10T04:00:00.000Z" },
    ];
    for (const task of tasks) {
      (manager as any).store.createTask({
        id: task.id,
        conversationId: `conv-${task.id}`,
        sessionKey: `session-${task.id}`,
        source: "chat",
        status: task.status,
        title: task.id,
        startedAt: task.createdAt,
        finishedAt: task.createdAt,
        createdAt: task.createdAt,
        updatedAt: task.createdAt,
      });
      manager.recordSkillUsage(task.id, skillName, {
        sourceCandidateId: acceptedCandidateId,
        usedVia: "tool",
      });
    }

    (manager as any).store.createExperienceCandidate({
      id: "exp-skill-patch-1",
      taskId: "task-patch-1",
      type: "skill",
      status: "draft",
      title: skillName,
      slug: "automation-skill",
      content: `name: ${skillName}\n# Patch candidate`,
      sourceTaskSnapshot: {
        taskId: "task-patch-1",
        conversationId: "conv-patch-1",
        source: "chat",
        status: "failed",
        startedAt: "2026-04-10T05:00:00.000Z",
      },
      createdAt: "2026-04-10T05:00:00.000Z",
    });

    const snapshot = await buildSkillFreshnessSnapshot({
      manager,
      stateDir,
    });
    const acceptedAssessment = snapshot.bySourceCandidateId[acceptedCandidateId];

    expect(snapshot.summary.needsPatchCount).toBeGreaterThanOrEqual(1);
    expect(acceptedAssessment.status).toBe("needs_patch");
    expect(acceptedAssessment.signals.map((item) => item.code)).toEqual(expect.arrayContaining([
      "pending_update_candidate",
      "recent_failures",
      "high_usage_low_success",
    ]));
    expect(acceptedAssessment.usage?.usageCount).toBe(4);
  });

  it("keeps manual stale marks and flags unmatched pending skill candidates as needs_new_skill", async () => {
    const acceptedCandidateId = "exp-skill-accepted-2";
    const skillName = "Stable Skill";
    (manager as any).store.createExperienceCandidate({
      id: acceptedCandidateId,
      taskId: "task-source-2",
      type: "skill",
      status: "accepted",
      title: skillName,
      slug: "stable-skill",
      content: `name: ${skillName}\n# Stable Skill`,
      sourceTaskSnapshot: {
        taskId: "task-source-2",
        conversationId: "conv-source-2",
        source: "chat",
        status: "success",
        startedAt: "2026-04-10T00:00:00.000Z",
      },
      publishedPath: path.join(workspaceRoot, "skills", "stable-skill", "SKILL.md"),
      createdAt: "2026-04-10T00:00:00.000Z",
      acceptedAt: "2026-04-10T00:05:00.000Z",
    });

    (manager as any).store.createExperienceCandidate({
      id: "exp-skill-new-1",
      taskId: "task-new-skill-1",
      type: "skill",
      status: "draft",
      title: "Browser Recovery Skill",
      slug: "browser-recovery-skill",
      content: "name: Browser Recovery Skill\n# New Skill",
      sourceTaskSnapshot: {
        taskId: "task-new-skill-1",
        conversationId: "conv-new-skill-1",
        source: "chat",
        status: "failed",
        startedAt: "2026-04-10T06:00:00.000Z",
      },
      createdAt: "2026-04-10T06:00:00.000Z",
    });

    await updateSkillFreshnessManualMark(stateDir, {
      skillKey: skillName,
      sourceCandidateId: acceptedCandidateId,
      reason: "真实手测后怀疑说明已过时",
      markedBy: "tester",
      stale: true,
    });

    const snapshot = await buildSkillFreshnessSnapshot({
      manager,
      stateDir,
    });

    expect(snapshot.bySourceCandidateId[acceptedCandidateId].status).toBe("warn_stale");
    expect(snapshot.bySourceCandidateId[acceptedCandidateId].manualStaleMark?.reason).toContain("已过时");
    expect(snapshot.items.some((item) => item.pendingCandidateId === "exp-skill-new-1" && item.status === "needs_new_skill")).toBe(true);
    expect(snapshot.summary.needsNewSkillCount).toBeGreaterThanOrEqual(1);
  });

  it("surfaces manual stale marks for usage-only skills without accepted candidates", async () => {
    const taskId = "task-usage-only-1";
    (manager as any).store.createTask({
      id: taskId,
      conversationId: "conv-usage-only-1",
      sessionKey: "session-usage-only-1",
      source: "chat",
      status: "success",
      title: "usage-only skill",
      startedAt: "2026-04-10T07:00:00.000Z",
      finishedAt: "2026-04-10T07:00:00.000Z",
      createdAt: "2026-04-10T07:00:00.000Z",
      updatedAt: "2026-04-10T07:00:00.000Z",
    });
    manager.recordSkillUsage(taskId, "web-monitor", {
      usedVia: "tool",
    });

    await updateSkillFreshnessManualMark(stateDir, {
      skillKey: "web-monitor",
      reason: "真实手测发现需要补说明",
      markedBy: "tester",
      stale: true,
    });

    const snapshot = await buildSkillFreshnessSnapshot({
      manager,
      stateDir,
    });

    expect(snapshot.bySkillKey["web-monitor"]?.status).toBe("warn_stale");
    expect(snapshot.bySkillKey["web-monitor"]?.manualStaleMark?.reason).toContain("需要补说明");
    expect(snapshot.summary.warnCount).toBeGreaterThanOrEqual(1);
  });
});
