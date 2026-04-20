import { describe, expect, it, vi } from "vitest";

import { handleDreamMethod } from "./dreams.js";

describe("handleDreamMethod", () => {
  it("returns dream status payload", async () => {
    const runtime = {
      getAvailability: () => ({ enabled: true, available: true, model: "gpt-test" }),
      getState: vi.fn(async () => ({
        version: 1,
        agentId: "coder",
        status: "idle",
        updatedAt: "2026-04-19T12:00:00.000Z",
        settings: {
          inputWindowHours: 72,
          cooldownHours: 12,
          failureBackoffMinutes: 30,
          maxRecentRuns: 20,
        },
        recentRuns: [],
      })),
    };

    const res = await handleDreamMethod({
      type: "req",
      id: "req-1",
      method: "dream.status.get",
      params: {
        agentId: "coder",
      },
    }, {
      resolveDreamRuntime: () => runtime as any,
      resolveDefaultConversationId: () => "agent:coder:main",
    });

    expect(res?.ok).toBe(true);
    expect(res && "payload" in res ? res.payload?.defaultConversationId : undefined).toBe("agent:coder:main");
    expect(runtime.getState).toHaveBeenCalledTimes(1);
  });

  it("runs dream with default conversation fallback", async () => {
    const runtime = {
      getAvailability: () => ({ enabled: true, available: true, model: "gpt-test" }),
      run: vi.fn(async () => ({
        record: {
          id: "dream-1",
          agentId: "coder",
          status: "completed",
          triggerMode: "manual",
          requestedAt: "2026-04-19T12:00:00.000Z",
        },
        state: {
          version: 1,
          agentId: "coder",
          status: "idle",
          updatedAt: "2026-04-19T12:01:00.000Z",
          settings: {
            inputWindowHours: 72,
            cooldownHours: 12,
            failureBackoffMinutes: 30,
            maxRecentRuns: 20,
          },
          recentRuns: [],
        },
        draft: {
          stableInsights: [],
          corrections: [],
          openQuestions: [],
          shareCandidates: [],
          nextFocus: [],
        },
      })),
    };

    const res = await handleDreamMethod({
      type: "req",
      id: "req-2",
      method: "dream.run",
      params: {
        agentId: "coder",
        reason: "manual-smoke",
      },
    }, {
      resolveDreamRuntime: () => runtime as any,
      resolveDefaultConversationId: () => "agent:coder:main",
    });

    expect(res?.ok).toBe(true);
    expect(runtime.run).toHaveBeenCalledWith({
      conversationId: "agent:coder:main",
      triggerMode: "manual",
      reason: "manual-smoke",
    });
  });

  it("runs commons export through dream.commons.export_now", async () => {
    const commonsRuntime = {
      getAvailability: () => ({ enabled: true, available: true, vaultPath: "E:/Obsidian" }),
      runNow: vi.fn(async () => ({
        exported: true,
        state: {
          version: 1,
          status: "completed",
          updatedAt: "2026-04-19T15:00:00.000Z",
          approvedCount: 2,
          revokedCount: 1,
          targetPath: "E:/Obsidian/Star Sanctuary/Commons",
          indexPath: "E:/Obsidian/Star Sanctuary/Commons/INDEX.md",
        },
      })),
    };

    const res = await handleDreamMethod({
      type: "req",
      id: "req-3",
      method: "dream.commons.export_now",
      params: {
        agentId: "coder",
      },
    }, {
      resolveDreamRuntime: () => null as any,
      resolveDefaultConversationId: () => "agent:coder:main",
      resolveCommonsExportRuntime: () => commonsRuntime as any,
    });

    const payload = res && "payload" in res ? res.payload as any : undefined;
    expect(res?.ok).toBe(true);
    expect(commonsRuntime.runNow).toHaveBeenCalledTimes(1);
    expect(payload?.state?.approvedCount).toBe(2);
  });

  it("returns commons export status through dream.commons.status.get", async () => {
    const commonsRuntime = {
      getAvailability: () => ({ enabled: true, available: true, vaultPath: "E:/Obsidian", sharedStateDir: "E:/state/team-memory" }),
      getState: vi.fn(async () => ({
        version: 1,
        status: "completed",
        updatedAt: "2026-04-19T15:00:00.000Z",
        lastAttemptAt: "2026-04-19T14:59:00.000Z",
        lastSuccessAt: "2026-04-19T15:00:00.000Z",
        approvedCount: 2,
        revokedCount: 1,
        noteCount: 3,
        agentPageCount: 2,
        targetPath: "E:/Obsidian/Star Sanctuary/Commons",
        indexPath: "E:/Obsidian/Star Sanctuary/Commons/INDEX.md",
      })),
    };

    const res = await handleDreamMethod({
      type: "req",
      id: "req-4",
      method: "dream.commons.status.get",
      params: {},
    }, {
      resolveDreamRuntime: () => null as any,
      resolveDefaultConversationId: () => "agent:coder:main",
      resolveCommonsExportRuntime: () => commonsRuntime as any,
    });

    const payload = res && "payload" in res ? res.payload as any : undefined;
    expect(res?.ok).toBe(true);
    expect(commonsRuntime.getState).toHaveBeenCalledTimes(1);
    expect(payload?.availability?.vaultPath).toBe("E:/Obsidian");
    expect(payload?.state?.noteCount).toBe(3);
    expect(payload?.headline).toContain("last completed");
  });
});
