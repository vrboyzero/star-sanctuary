import { describe, expect, it, vi } from "vitest";

import { DreamAutomationRuntime } from "./dream-automation-runtime.js";

describe("dream automation runtime", () => {
  it("runs automatic dream for the oldest eligible agent", async () => {
    const runtimes = new Map<string, any>([
      ["default", {
        getState: vi.fn(async () => ({
          lastDreamAt: "2026-04-19T12:00:00.000Z",
        })),
        maybeAutoRun: vi.fn(async () => ({
          executed: false,
          triggerMode: "heartbeat",
          state: { status: "idle" },
          skipCode: "cooldown_active",
          skipReason: "cooldown active",
        })),
      }],
      ["coder", {
        getState: vi.fn(async () => ({
          lastDreamAt: "2026-04-18T12:00:00.000Z",
        })),
        maybeAutoRun: vi.fn(async () => ({
          executed: true,
          triggerMode: "heartbeat",
          state: { status: "idle" },
          record: {
            id: "dream-1",
          },
        })),
      }],
    ]);

    const runtime = new DreamAutomationRuntime({
      heartbeatEnabled: true,
      cronEnabled: false,
      agentIds: ["default", "coder"],
      resolveDreamRuntime: (agentId) => runtimes.get(agentId ?? "default") ?? null,
      resolveDefaultConversationId: (agentId) => `agent:${agentId ?? "default"}:main`,
    });

    const result = await runtime.handleHeartbeatEvent({
      status: "ran",
      conversationId: "heartbeat-1",
    });

    expect(result).toMatchObject({
      source: "heartbeat",
      attempted: true,
      executed: true,
      agentId: "coder",
      runId: "dream-1",
    });
    expect(runtimes.get("coder").maybeAutoRun).toHaveBeenCalledWith(expect.objectContaining({
      triggerMode: "heartbeat",
      conversationId: "agent:coder:main",
    }));
  });

  it("skips automatic dream when cron driver is disabled", async () => {
    const runtime = new DreamAutomationRuntime({
      heartbeatEnabled: false,
      cronEnabled: false,
      agentIds: ["default"],
      resolveDreamRuntime: () => null,
      resolveDefaultConversationId: () => "agent:default:main",
    });

    const result = await runtime.handleCronEvent({
      status: "ok",
      sourceId: "job-1",
    });

    expect(result).toMatchObject({
      source: "cron",
      attempted: false,
      executed: false,
      skipCode: "driver_disabled",
    });
  });
});
