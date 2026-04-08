import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  BackgroundContinuationLedger,
  buildBackgroundContinuationRuntimeDoctorReport,
} from "./background-continuation-runtime.js";
import { buildSubTaskContinuationState } from "./continuation-state.js";

describe("background continuation runtime", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  it("persists recent cron, heartbeat, and subtask entries into a unified doctor report", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-background-runtime-"));
    tempDirs.push(stateDir);
    const ledger = new BackgroundContinuationLedger(stateDir);

    await ledger.startRun({
      runId: "cron-run-1",
      kind: "cron",
      sourceId: "cron-job-1",
      label: "Digest",
      sessionTarget: "main",
      startedAt: 1_710_000_000_000,
    });
    await ledger.finishRun({
      runId: "cron-run-1",
      kind: "cron",
      sourceId: "cron-job-1",
      label: "Digest",
      status: "ran",
      summary: "digest ready",
      conversationId: "cron-main:cron-job-1",
      sessionTarget: "main",
      startedAt: 1_710_000_000_000,
      finishedAt: 1_710_000_000_800,
      nextRunAtMs: 1_710_000_060_000,
    });
    await ledger.startRun({
      runId: "heartbeat-run-1",
      kind: "heartbeat",
      sourceId: "heartbeat",
      label: "Heartbeat",
      conversationId: "heartbeat-1710000100000",
      startedAt: 1_710_000_100_000,
    });
    await ledger.finishRun({
      runId: "heartbeat-run-1",
      kind: "heartbeat",
      sourceId: "heartbeat",
      label: "Heartbeat",
      status: "skipped",
      reason: "duplicate",
      conversationId: "heartbeat-1710000100000",
      startedAt: 1_710_000_100_000,
      finishedAt: 1_710_000_100_100,
    });
    await ledger.finishRun({
      runId: "subtask:task_sub_1",
      kind: "subtask",
      sourceId: "task_sub_1",
      label: "Implement runtime bridge",
      status: "ran",
      summary: "patch delivered",
      conversationId: "conv-parent",
      startedAt: 1_710_000_200_000,
      finishedAt: 1_710_000_201_000,
      continuationState: buildSubTaskContinuationState({
        id: "task_sub_1",
        kind: "sub_agent",
        parentConversationId: "conv-parent",
        sessionId: "sub-session-1",
        agentId: "coder",
        launchSpec: {
          agentId: "coder",
          profileId: "coder",
          background: true,
          timeoutMs: 60_000,
          channel: "subtask",
        },
        background: true,
        status: "done",
        instruction: "Implement runtime bridge",
        summary: "patch delivered",
        progress: {
          phase: "done",
          message: "Task completed.",
          lastActivityAt: 1_710_000_201_000,
        },
        createdAt: 1_710_000_200_000,
        updatedAt: 1_710_000_201_000,
        finishedAt: 1_710_000_201_000,
        outputPreview: "patch delivered",
        steering: [],
        resume: [],
        notifications: [],
      }),
    });

    const report = await buildBackgroundContinuationRuntimeDoctorReport({ ledger, recentLimit: 6 });

    expect(report.totals).toMatchObject({
      totalRuns: 3,
      runningRuns: 0,
      skippedRuns: 1,
      failedRuns: 0,
      conversationLinkedRuns: 3,
    });
    expect(report.kindCounts).toEqual({
      cron: 1,
      heartbeat: 1,
      subtask: 1,
    });
    expect(report.sessionTargetCounts).toEqual({
      main: 1,
      isolated: 0,
    });
    expect(report.recentEntries[0]).toMatchObject({
      kind: "subtask",
      status: "ran",
      continuationState: {
        scope: "subtask",
        recommendedTargetId: "sub-session-1",
        targetType: "session",
      },
    });
    expect(report.recentEntries[1]).toMatchObject({
      kind: "heartbeat",
      status: "skipped",
      continuationState: {
        scope: "background",
        recommendedTargetId: "heartbeat-1710000100000",
        targetType: "conversation",
      },
    });
    expect(report.recentEntries[2]).toMatchObject({
      kind: "cron",
      status: "ran",
      continuationState: {
        scope: "background",
        recommendedTargetId: "cron-main:cron-job-1",
        targetType: "conversation",
      },
    });
  });
});
