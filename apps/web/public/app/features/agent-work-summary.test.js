// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import { buildAgentWorkSummary } from "./agent-work-summary.js";

describe("agent work summary", () => {
  it("builds a clickable continuation-focused summary when continuation target exists", () => {
    const summary = buildAgentWorkSummary({
      status: "running",
      continuationState: {
        targetType: "conversation",
        recommendedTargetId: "conv-1",
        summary: "继续跟进长期任务审批",
      },
      sharedGovernance: {
        pendingCount: 2,
      },
    }, (_key, _params, fallback) => fallback ?? "");

    expect(summary.title).toBe("工作摘要");
    expect(summary.action).toEqual({ kind: "conversation", conversationId: "conv-1" });
    expect(summary.lines[0].value).toBe("运行中");
    expect(summary.lines[1].value).toContain("继续跟进长期任务审批");
    expect(summary.lines[2].value).toContain("待审阅 2 项");
    expect(summary.lines[3].value).toContain("conversation:conv-1");
  });

  it("falls back to task or subtask targets when continuation target is absent", () => {
    const summary = buildAgentWorkSummary({
      status: "idle",
      recentSubtaskDigest: {
        latestTaskId: "subtask-1",
        latestSummary: "补齐回归测试",
        latestStatus: "running",
      },
    }, (_key, _params, fallback) => fallback ?? "");

    expect(summary.action).toEqual({ kind: "subtask", taskId: "subtask-1" });
    expect(summary.lines[3].value).toContain("subtask:subtask-1");
  });
});
