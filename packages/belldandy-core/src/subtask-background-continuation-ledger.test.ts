import { describe, expect, it, vi } from "vitest";

import type { BackgroundContinuationRecord } from "./background-continuation-runtime.js";
import { createSubTaskBackgroundContinuationLedgerHandler } from "./subtask-background-continuation-ledger.js";
import type { SubTaskRecord } from "./task-runtime.js";

function createSubTaskRecord(partial: Partial<SubTaskRecord> = {}): SubTaskRecord {
  return {
    id: partial.id ?? "task_sub_1",
    kind: "sub_agent",
    parentConversationId: partial.parentConversationId ?? "conv-parent",
    sessionId: partial.sessionId,
    agentId: partial.agentId ?? "coder",
    launchSpec: partial.launchSpec ?? {
      agentId: "coder",
      profileId: "coder",
      background: true,
      timeoutMs: 60_000,
      channel: "subtask",
    },
    background: partial.background ?? true,
    status: partial.status ?? "running",
    instruction: partial.instruction ?? "Implement runtime bridge",
    summary: partial.summary ?? "Implement runtime bridge",
    progress: partial.progress ?? {
      phase: partial.status ?? "running",
      message: "Task is running.",
      lastActivityAt: partial.updatedAt ?? 1_710_000_000_000,
    },
    createdAt: partial.createdAt ?? 1_710_000_000_000,
    updatedAt: partial.updatedAt ?? 1_710_000_000_100,
    finishedAt: partial.finishedAt,
    stopRequestedAt: partial.stopRequestedAt,
    stopReason: partial.stopReason,
    archivedAt: partial.archivedAt,
    archiveReason: partial.archiveReason,
    outputPath: partial.outputPath,
    outputPreview: partial.outputPreview,
    error: partial.error,
    steering: partial.steering ?? [],
    takeover: partial.takeover ?? [],
    resume: partial.resume ?? [],
    notifications: partial.notifications ?? [],
  };
}

describe("subtask background continuation ledger handler", () => {
  it("writes milestone-level subtask states without rewriting unchanged deltas", async () => {
    const startRun = vi.fn(async (input): Promise<BackgroundContinuationRecord> => ({
      runId: input.runId ?? "subtask:task_sub_1",
      kind: input.kind,
      sourceId: input.sourceId,
      label: input.label,
      status: "running",
      startedAt: input.startedAt ?? 0,
      updatedAt: input.updatedAt ?? input.startedAt ?? 0,
      conversationId: input.conversationId,
      sessionTarget: input.sessionTarget,
      summary: input.summary,
      continuationState: input.continuationState,
    }));
    const finishRun = vi.fn(async (input): Promise<BackgroundContinuationRecord> => ({
      runId: input.runId,
      kind: input.kind,
      sourceId: input.sourceId,
      label: input.label,
      status: input.status,
      startedAt: input.startedAt ?? 0,
      updatedAt: input.finishedAt ?? input.startedAt ?? 0,
      finishedAt: input.finishedAt,
      durationMs: typeof input.finishedAt === "number" && typeof input.startedAt === "number"
        ? Math.max(0, input.finishedAt - input.startedAt)
        : undefined,
      conversationId: input.conversationId,
      sessionTarget: input.sessionTarget,
      summary: input.summary,
      reason: input.reason,
      nextRunAtMs: input.nextRunAtMs,
      continuationState: input.continuationState,
    }));
    const handler = createSubTaskBackgroundContinuationLedgerHandler({
      ledger: { startRun, finishRun },
    });

    const runningRecord = createSubTaskRecord({
      status: "running",
      sessionId: "sub-session-1",
      updatedAt: 1_710_000_000_100,
      progress: {
        phase: "running",
        message: "delta 1",
        lastActivityAt: 1_710_000_000_100,
      },
    });
    handler({ kind: "updated", item: runningRecord });
    handler({
      kind: "updated",
      item: createSubTaskRecord({
        ...runningRecord,
        updatedAt: 1_710_000_000_200,
        progress: {
          phase: "running",
          message: "delta 2",
          lastActivityAt: 1_710_000_000_200,
        },
      }),
    });
    handler({
      kind: "completed",
      item: createSubTaskRecord({
        status: "done",
        sessionId: "sub-session-1",
        updatedAt: 1_710_000_000_400,
        finishedAt: 1_710_000_000_400,
        outputPreview: "Patch delivered",
        progress: {
          phase: "done",
          message: "Task completed.",
          lastActivityAt: 1_710_000_000_400,
        },
      }),
    });

    await Promise.resolve();

    expect(startRun).toHaveBeenCalledTimes(1);
    const firstStartCall = startRun.mock.calls[0];
    expect(firstStartCall?.[0]).toMatchObject({
      runId: "subtask:task_sub_1",
      kind: "subtask",
      sourceId: "task_sub_1",
      updatedAt: 1_710_000_000_100,
      continuationState: {
        scope: "subtask",
        recommendedTargetId: "sub-session-1",
        targetType: "session",
      },
    });
    expect(finishRun).toHaveBeenCalledTimes(1);
    const firstFinishCall = finishRun.mock.calls[0];
    expect(firstFinishCall?.[0]).toMatchObject({
      runId: "subtask:task_sub_1",
      kind: "subtask",
      status: "ran",
      continuationState: {
        scope: "subtask",
        recommendedTargetId: "sub-session-1",
        targetType: "session",
      },
      summary: "Patch delivered",
    });
  });

  it("forwards failed subtask records into the background recovery callback", async () => {
    const startRun = vi.fn();
    const finishRun = vi.fn(async (input): Promise<BackgroundContinuationRecord> => ({
      runId: input.runId,
      kind: input.kind,
      sourceId: input.sourceId,
      label: input.label,
      status: input.status,
      startedAt: input.startedAt ?? 0,
      updatedAt: input.finishedAt ?? input.startedAt ?? 0,
      finishedAt: input.finishedAt,
      summary: input.summary,
      reason: input.reason,
      continuationState: input.continuationState,
    }));
    const onFailedRecord = vi.fn();
    const handler = createSubTaskBackgroundContinuationLedgerHandler({
      ledger: { startRun, finishRun },
      onFailedRecord,
    });

    handler({
      kind: "completed",
      item: createSubTaskRecord({
        status: "error",
        sessionId: "sub-session-err",
        error: "integration failed",
        updatedAt: 1_710_000_000_400,
        finishedAt: 1_710_000_000_400,
        progress: {
          phase: "error",
          message: "integration failed",
          lastActivityAt: 1_710_000_000_400,
        },
      }),
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(finishRun).toHaveBeenCalledTimes(1);
    expect(onFailedRecord).toHaveBeenCalledWith(expect.objectContaining({
      runId: "subtask:task_sub_1",
      kind: "subtask",
      status: "failed",
      reason: "integration failed",
    }));
  });

  it("does not re-dispatch failed recovery for resume metadata churn on the same terminal failure", async () => {
    const startRun = vi.fn();
    const finishRun = vi.fn(async (input): Promise<BackgroundContinuationRecord> => ({
      runId: input.runId,
      kind: input.kind,
      sourceId: input.sourceId,
      label: input.label,
      status: input.status,
      startedAt: input.startedAt ?? 0,
      updatedAt: input.finishedAt ?? input.startedAt ?? 0,
      finishedAt: input.finishedAt,
      summary: input.summary,
      reason: input.reason,
      continuationState: input.continuationState,
    }));
    const onFailedRecord = vi.fn();
    const handler = createSubTaskBackgroundContinuationLedgerHandler({
      ledger: { startRun, finishRun },
      onFailedRecord,
    });

    const baseFailedRecord = createSubTaskRecord({
      kind: "bridge_session",
      status: "error",
      sessionId: "bridge-session-1",
      error: "Bridge session runtime lost before the session could be resumed.",
      summary: "Bridge session closed (runtime-lost).",
      outputPreview: "Bridge session closed (runtime-lost).",
      updatedAt: 1_710_000_000_400,
      finishedAt: 1_710_000_000_400,
      progress: {
        phase: "error",
        message: "Bridge session runtime lost before the session could be resumed.",
        lastActivityAt: 1_710_000_000_400,
      },
      bridgeSessionRuntime: {
        state: "runtime-lost",
        closeReason: "runtime-lost",
        artifactPath: "artifact.json",
        transcriptPath: "transcript.json",
      },
    });

    handler({
      kind: "completed",
      item: baseFailedRecord,
    });
    handler({
      kind: "updated",
      item: createSubTaskRecord({
        ...baseFailedRecord,
        updatedAt: 1_710_000_000_500,
        resume: [
          {
            id: "task_resume_1",
            message: "Recover this failed background subtask from the latest recorded failure state.",
            status: "failed",
            requestedAt: 1_710_000_000_450,
            requestedSessionId: "bridge-session-1",
            error: "工具 bridge_session_start 不在当前 Agent 白名单内",
          },
        ],
        notifications: [
          {
            id: "task_notification_1",
            kind: "resume_requested",
            message: "Resume accepted.",
            createdAt: 1_710_000_000_451,
          },
          {
            id: "task_notification_2",
            kind: "resume_failed",
            message: "Resume failed: 工具 bridge_session_start 不在当前 Agent 白名单内",
            createdAt: 1_710_000_000_452,
          },
        ],
      }),
    });

    await Promise.resolve();
    await Promise.resolve();

    expect(finishRun).toHaveBeenCalledTimes(2);
    expect(onFailedRecord).toHaveBeenCalledTimes(1);
    expect(onFailedRecord).toHaveBeenCalledWith(expect.objectContaining({
      runId: "subtask:task_sub_1",
      status: "failed",
    }));
  });

  it("treats takeover changes as meaningful ledger signature updates", async () => {
    const startRun = vi.fn(async (input): Promise<BackgroundContinuationRecord> => ({
      runId: input.runId ?? "subtask:task_sub_1",
      kind: input.kind,
      sourceId: input.sourceId,
      label: input.label,
      status: "running",
      startedAt: input.startedAt ?? 0,
      updatedAt: input.updatedAt ?? input.startedAt ?? 0,
      conversationId: input.conversationId,
      summary: input.summary,
      continuationState: input.continuationState,
    }));
    const finishRun = vi.fn();
    const handler = createSubTaskBackgroundContinuationLedgerHandler({
      ledger: { startRun, finishRun },
    });

    handler({
      kind: "updated",
      item: createSubTaskRecord({
        status: "running",
        sessionId: "sub-session-takeover-1",
        updatedAt: 1_710_000_000_100,
      }),
    });
    handler({
      kind: "updated",
      item: createSubTaskRecord({
        status: "running",
        sessionId: "sub-session-takeover-2",
        agentId: "researcher",
        updatedAt: 1_710_000_000_200,
        takeover: [
          {
            id: "task_takeover_1",
            agentId: "researcher",
            mode: "safe_point",
            message: "Take over this subtask as agent researcher.",
            status: "delivered",
            requestedAt: 1_710_000_000_120,
            deliveredAt: 1_710_000_000_180,
            requestedSessionId: "sub-session-takeover-1",
            deliveredSessionId: "sub-session-takeover-2",
            resumedFromSessionId: "sub-session-takeover-1",
          },
        ],
      }),
    });

    await Promise.resolve();

    expect(startRun).toHaveBeenCalledTimes(2);
    expect(startRun.mock.calls[1]?.[0]).toMatchObject({
      runId: "subtask:task_sub_1",
      updatedAt: 1_710_000_000_200,
      continuationState: {
        resumeMode: "safe_point_takeover",
        recommendedTargetId: "sub-session-takeover-2",
      },
    });
  });
});
