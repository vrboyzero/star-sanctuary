import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  DreamStore,
  buildDreamFilePath,
  buildDreamIndexPath,
  buildDreamRuntimePath,
} from "./dream-store.js";

describe("DreamStore", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true }).catch(() => {})));
    tempDirs.length = 0;
  });

  it("creates default runtime state and standard paths", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-dream-store-"));
    tempDirs.push(stateDir);
    const store = new DreamStore({
      stateDir,
      agentId: "coder",
    });

    const state = await store.getState();

    expect(state.agentId).toBe("coder");
    expect(state.status).toBe("idle");
    expect(store.getRuntimePath()).toBe(buildDreamRuntimePath(stateDir));
    expect(store.getDreamIndexPath()).toBe(buildDreamIndexPath(stateDir));
    expect(store.buildDreamFilePath({
      occurredAt: "2026-04-19T12:00:00.000Z",
      dreamId: "Dream_0001",
    })).toBe(buildDreamFilePath({
      stateDir,
      occurredAt: "2026-04-19T12:00:00.000Z",
      dreamId: "Dream_0001",
    }));
  });

  it("persists recent runs and last input summary", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-dream-store-"));
    tempDirs.push(stateDir);
    const store = new DreamStore({
      stateDir,
      agentId: "agent-alpha",
      settings: {
        maxRecentRuns: 2,
      },
    });

    await store.recordRun({
      id: "dream-001",
      agentId: "agent-alpha",
      status: "completed",
      triggerMode: "manual",
      requestedAt: "2026-04-19T01:00:00.000Z",
      finishedAt: "2026-04-19T01:05:00.000Z",
      input: {
        collectedAt: "2026-04-19T00:59:00.000Z",
        windowHours: 72,
        sourceCounts: {
          recentTaskCount: 3,
          recentWorkCount: 2,
          recentWorkRecapCount: 1,
          recentResumeContextCount: 1,
          recentDurableMemoryCount: 4,
          recentPrivateMemoryCount: 3,
          recentSharedMemoryCount: 1,
          recentExperienceUsageCount: 2,
          sessionDigestAvailable: true,
          sessionMemoryAvailable: true,
          mindProfileAvailable: true,
          learningReviewAvailable: false,
        },
      },
    }, {
      lastDreamCursor: {
        digestGeneration: 1,
        sessionMemoryMessageCount: 3,
        sessionMemoryToolCursor: 1,
        taskChangeSeq: 2,
        memoryChangeSeq: 4,
      },
    });
    await store.recordRun({
      id: "dream-002",
      agentId: "agent-alpha",
      status: "failed",
      triggerMode: "heartbeat",
      requestedAt: "2026-04-19T06:00:00.000Z",
      finishedAt: "2026-04-19T06:03:00.000Z",
      error: "model timeout",
    });
    await store.recordRun({
      id: "dream-003",
      agentId: "agent-alpha",
      status: "completed",
      triggerMode: "cron",
      requestedAt: "2026-04-19T12:00:00.000Z",
      finishedAt: "2026-04-19T12:02:00.000Z",
    });
    await store.recordAutoTrigger({
      triggerMode: "heartbeat",
      attemptedAt: "2026-04-19T12:10:00.000Z",
      executed: false,
      skipCode: "cooldown_active",
    });
    await store.recordAutoTrigger({
      triggerMode: "cron",
      attemptedAt: "2026-04-19T12:20:00.000Z",
      executed: true,
      status: "completed",
      signalGateCode: "change_budget",
    });

    const reloaded = new DreamStore({
      stateDir,
      agentId: "agent-alpha",
      settings: {
        maxRecentRuns: 2,
      },
    });
    const state = await reloaded.getState();

    expect(state.lastRunId).toBe("dream-003");
    expect(state.lastDreamAt).toBe("2026-04-19T12:02:00.000Z");
    expect(state.lastFailedAt).toBe("2026-04-19T06:03:00.000Z");
    expect(state.recentRuns.map((item) => item.id)).toEqual(["dream-003", "dream-002"]);
    expect(state.lastInput?.sourceCounts.recentDurableMemoryCount).toBe(4);
    expect(state.lastDreamCursor).toMatchObject({
      digestGeneration: 1,
      sessionMemoryMessageCount: 3,
      sessionMemoryToolCursor: 1,
      taskChangeSeq: 2,
      memoryChangeSeq: 4,
    });
    expect(state.autoStats).toMatchObject({
      attemptedCount: 2,
      executedCount: 1,
      skippedCount: 1,
      skipCodeCounts: {
        cooldown_active: 1,
      },
      signalGateCounts: {
        change_budget: 1,
      },
      byTriggerMode: {
        heartbeat: {
          attemptedCount: 1,
          executedCount: 0,
          skippedCount: 1,
          skipCodeCounts: {
            cooldown_active: 1,
          },
        },
        cron: {
          attemptedCount: 1,
          executedCount: 1,
          skippedCount: 0,
          signalGateCounts: {
            change_budget: 1,
          },
        },
      },
    });
  });

  it("retries transient rename failures before replacing runtime state", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-dream-store-"));
    tempDirs.push(stateDir);
    const store = new DreamStore({
      stateDir,
      agentId: "agent-retry",
    });

    const originalRename = fs.rename.bind(fs);
    const renameSpy = vi.spyOn(fs, "rename");
    let attempts = 0;

    renameSpy.mockImplementation(async (sourcePath, destinationPath) => {
      attempts += 1;
      if (attempts <= 2) {
        const error = new Error("file is temporarily locked") as NodeJS.ErrnoException;
        error.code = "EPERM";
        throw error;
      }
      return originalRename(sourcePath, destinationPath);
    });

    try {
      const nextState = await store.recordAutoTrigger({
        triggerMode: "heartbeat",
        attemptedAt: "2026-04-22T00:00:00.000Z",
        executed: false,
        skipCode: "insufficient_signal",
      });

      expect(attempts).toBe(3);
      expect(nextState.lastAutoTrigger?.triggerMode).toBe("heartbeat");

      const persistedRaw = await fs.readFile(store.getRuntimePath(), "utf-8");
      const persisted = JSON.parse(persistedRaw) as { lastAutoTrigger?: { triggerMode?: string }, autoStats?: { attemptedCount?: number } };
      expect(persisted.lastAutoTrigger?.triggerMode).toBe("heartbeat");
      expect(persisted.autoStats?.attemptedCount).toBe(1);

      const leftoverTemps = (await fs.readdir(stateDir)).filter((name) => name.endsWith(".tmp"));
      expect(leftoverTemps).toEqual([]);
    } finally {
      renameSpy.mockRestore();
    }
  });
});
