import { describe, expect, it, vi } from "vitest";

import { createTaskWorkSurface } from "./task-work-surface.js";
import type { TaskExperienceDetail } from "./experience-types.js";
import type { TaskWorkShortcutItem } from "./manager.js";

describe("createTaskWorkSurface", () => {
  it("delegates recent/resume/similar lookups through one surface", () => {
    const recentItem = buildShortcutItem({
      taskId: "task-surface-1",
      conversationId: "conv-surface-1",
      title: "统一高层接入壳",
      status: "partial",
      updatedAt: "2026-04-17T12:00:00.000Z",
    });
    const resumeItem = buildShortcutItem({
      taskId: "task-surface-2",
      conversationId: "conv-surface-2",
      title: "继续补 explainSources",
      status: "partial",
      updatedAt: "2026-04-17T12:10:00.000Z",
    });
    const similarItem = buildShortcutItem({
      taskId: "task-surface-3",
      conversationId: "conv-surface-3",
      title: "之前补过 task short path",
      status: "success",
      updatedAt: "2026-04-16T08:00:00.000Z",
    });

    const delegate = {
      getRecentWork: vi.fn(() => [recentItem]),
      getResumeContext: vi.fn(() => resumeItem),
      findSimilarPastWork: vi.fn(() => [similarItem]),
    };
    const surface = createTaskWorkSurface(delegate);

    expect(surface.recentWork({ query: "Step 5", limit: 3 })).toEqual([recentItem]);
    expect(surface.resumeContext({ query: "继续 Step 5" })).toEqual(resumeItem);
    expect(surface.findSimilarWork({ query: "task short path", limit: 2 })).toEqual([similarItem]);
    expect(delegate.getRecentWork).toHaveBeenCalledWith({ query: "Step 5", limit: 3 });
    expect(delegate.getResumeContext).toHaveBeenCalledWith({ query: "继续 Step 5" });
    expect(delegate.findSimilarPastWork).toHaveBeenCalledWith({ query: "task short path", limit: 2 });
  });

  it("explains task work sources from structured recap, resume context, and activity log", () => {
    const detail = buildTaskDetail();
    const delegate = {
      getTaskDetail: vi.fn(() => detail),
    };
    const surface = createTaskWorkSurface(delegate);

    const explanation = surface.explainSources({ taskId: detail.id });

    expect(delegate.getTaskDetail).toHaveBeenCalledWith(detail.id);
    expect(explanation?.taskId).toBe(detail.id);
    expect(explanation?.sourceRefs.map((item) => item.kind)).toEqual([
      "task_summary",
      "work_recap",
      "resume_context",
      "activity_worklog",
    ]);
    expect(explanation?.sourceRefs[1].activityIds).toEqual(["act-2", "act-3"]);
    expect(explanation?.sourceRefs[2].activityIds).toEqual(["act-2", "act-3"]);
    expect(explanation?.sourceRefs[3].previews.some((item) => item.includes("已执行工具"))).toBe(true);
  });
});

function buildShortcutItem(overrides: Partial<TaskWorkShortcutItem>): TaskWorkShortcutItem {
  return {
    taskId: "task-default",
    conversationId: "conv-default",
    title: "默认任务",
    status: "partial",
    source: "chat",
    startedAt: "2026-04-17T10:00:00.000Z",
    updatedAt: "2026-04-17T10:05:00.000Z",
    toolNames: [],
    artifactPaths: [],
    recentActivityTitles: [],
    ...overrides,
  };
}

function buildTaskDetail(): TaskExperienceDetail {
  return {
    id: "task-explain-1",
    conversationId: "conv-explain-1",
    sessionKey: "session-explain-1",
    source: "chat",
    title: "统一高层接入壳",
    objective: "让 Gateway / Skills / context injection 复用同一层",
    status: "partial",
    summary: "已补统一高层接入壳，当前停在 explain_sources RPC 接线。",
    toolCalls: [
      {
        toolName: "apply_patch",
        success: true,
      },
    ],
    artifactPaths: ["packages/belldandy-memory/src/task-work-surface.ts"],
    startedAt: "2026-04-17T11:00:00.000Z",
    createdAt: "2026-04-17T11:00:00.000Z",
    updatedAt: "2026-04-17T11:30:00.000Z",
    workRecap: {
      taskId: "task-explain-1",
      conversationId: "conv-explain-1",
      sessionKey: "session-explain-1",
      headline: "已确认 4 条执行事实；当前停在：已完成 surface，待补 explain_sources RPC。",
      confirmedFacts: ["已新增 createTaskWorkSurface", "已收口 recentWork / resumeContext / findSimilarWork"],
      derivedFromActivityIds: ["act-2", "act-3"],
      updatedAt: "2026-04-17T11:30:00.000Z",
    },
    resumeContext: {
      taskId: "task-explain-1",
      conversationId: "conv-explain-1",
      sessionKey: "session-explain-1",
      currentStopPoint: "已完成 surface，待补 explain_sources RPC。",
      nextStep: "继续补 Gateway RPC 与定向测试。",
      derivedFromActivityIds: ["act-2", "act-3"],
      updatedAt: "2026-04-17T11:30:00.000Z",
    },
    metadata: {},
    activities: [
      {
        id: "act-1",
        taskId: "task-explain-1",
        conversationId: "conv-explain-1",
        sessionKey: "session-explain-1",
        source: "chat",
        kind: "task_started",
        state: "completed",
        sequence: 1,
        happenedAt: "2026-04-17T11:00:00.000Z",
        recordedAt: "2026-04-17T11:00:00.000Z",
        title: "开始统一高层接入壳",
      },
      {
        id: "act-2",
        taskId: "task-explain-1",
        conversationId: "conv-explain-1",
        sessionKey: "session-explain-1",
        source: "chat",
        kind: "tool_called",
        state: "completed",
        sequence: 2,
        happenedAt: "2026-04-17T11:10:00.000Z",
        recordedAt: "2026-04-17T11:10:00.000Z",
        title: "已执行工具 apply_patch",
        toolName: "apply_patch",
      },
      {
        id: "act-3",
        taskId: "task-explain-1",
        conversationId: "conv-explain-1",
        sessionKey: "session-explain-1",
        source: "chat",
        kind: "file_changed",
        state: "completed",
        sequence: 3,
        happenedAt: "2026-04-17T11:20:00.000Z",
        recordedAt: "2026-04-17T11:20:00.000Z",
        title: "已变更文件：packages/belldandy-memory/src/task-work-surface.ts",
        files: ["packages/belldandy-memory/src/task-work-surface.ts"],
      },
    ],
    memoryLinks: [],
    usedMethods: [],
    usedSkills: [],
  };
}
