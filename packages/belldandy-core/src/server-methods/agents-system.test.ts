import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { handleAgentsSystemMethod } from "./agents-system.js";

describe("handleAgentsSystemMethod", () => {
  let stateDir: string;

  beforeEach(async () => {
    vi.useFakeTimers();
    stateDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), "belldandy-agents-system-"));
  });

  afterEach(async () => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
    vi.restoreAllMocks();
    await fs.promises.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  });

  it("broadcasts a countdown before exiting on system.restart", async () => {
    const broadcast = vi.fn();
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((code?: number | string | null) => {
      return undefined as never;
    }) as typeof process.exit);

    const res = await handleAgentsSystemMethod(
      {
        type: "req",
        id: "restart-1",
        method: "system.restart",
        params: { reason: "settings updated" },
      },
      {
        stateDir,
        clientId: "client-1",
        log: { warn: vi.fn() },
        broadcast,
        agentRegistry: undefined,
        residentAgentRuntime: {} as any,
        residentMemoryManagers: [],
        conversationStore: {} as any,
        subTaskRuntimeStore: undefined,
        inspectAgentPrompt: undefined,
      },
    );

    expect(res).toMatchObject({ type: "res", id: "restart-1", ok: true });
    expect(broadcast).toHaveBeenCalledTimes(0);

    await vi.advanceTimersByTimeAsync(0);
    expect(broadcast).toHaveBeenNthCalledWith(1, {
      type: "event",
      event: "agent.status",
      payload: { status: "restarting", reason: "settings updated", countdown: 3 },
    });

    await vi.advanceTimersByTimeAsync(1000);
    expect(broadcast).toHaveBeenNthCalledWith(2, {
      type: "event",
      event: "agent.status",
      payload: { status: "restarting", reason: "settings updated", countdown: 2 },
    });

    await vi.advanceTimersByTimeAsync(1000);
    expect(broadcast).toHaveBeenNthCalledWith(3, {
      type: "event",
      event: "agent.status",
      payload: { status: "restarting", reason: "settings updated", countdown: 1 },
    });

    await vi.advanceTimersByTimeAsync(1000);
    expect(broadcast).toHaveBeenNthCalledWith(4, {
      type: "event",
      event: "agent.status",
      payload: { status: "restarting", reason: "settings updated", countdown: 0 },
    });

    await vi.advanceTimersByTimeAsync(300);
    expect(exitSpy).toHaveBeenCalledWith(100);
  });
});
