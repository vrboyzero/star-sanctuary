import { describe, expect, it, vi } from "vitest";
import { createCronTool } from "./cron-tool.js";
import type { ToolContext } from "../types.js";

const context: ToolContext = {
  conversationId: "conv-cron",
  workspaceRoot: "E:/project/star-sanctuary",
  policy: {
    allowedPaths: [],
    deniedPaths: [],
    allowedDomains: [],
    deniedDomains: [],
    maxTimeoutMs: 30_000,
    maxResponseBytes: 512_000,
  },
};

describe("createCronTool", () => {
  it("creates goal approval scan jobs", async () => {
    const add = vi.fn(async (input) => ({
      id: "job_approval_scan",
      name: input.name,
      enabled: true,
      schedule: input.schedule,
      payload: input.payload,
      state: {},
    }));
    const tool = createCronTool({
      store: {
        list: vi.fn(async () => []),
        add,
        remove: vi.fn(async () => false),
      },
    });

    const result = await tool.execute({
      action: "add",
      name: "审批巡检",
      payloadKind: "goalApprovalScan",
      goalId: "goal_alpha",
      autoEscalate: true,
      scheduleKind: "every",
      everyMs: 300_000,
    }, context);

    expect(result.success).toBe(true);
    expect(result.output).toContain("审批巡检");
    expect(result.output).toContain("approval scan");
    expect(add).toHaveBeenCalledWith(expect.objectContaining({
      name: "审批巡检",
      payload: {
        kind: "goalApprovalScan",
        goalId: "goal_alpha",
        allGoals: false,
        autoEscalate: true,
      },
    }));
  });

  it("renders approval scan payloads in cron list output", async () => {
    const tool = createCronTool({
      store: {
        list: vi.fn(async () => [{
          id: "job_approval_scan",
          name: "审批巡检",
          enabled: true,
          schedule: {
            kind: "every",
            everyMs: 300_000,
          },
          payload: {
            kind: "goalApprovalScan" as const,
            allGoals: true,
            autoEscalate: true,
          },
          state: {
            nextRunAtMs: Date.parse("2026-03-21T09:00:00.000Z"),
            lastRunAtMs: Date.parse("2026-03-21T08:55:00.000Z"),
            lastStatus: "ok",
          },
        }]),
        add: vi.fn(),
        remove: vi.fn(async () => false),
      },
      scheduler: {
        status: () => ({
          running: true,
          activeRuns: 0,
        }),
      },
    });

    const result = await tool.execute({ action: "list" }, context);

    expect(result.success).toBe(true);
    expect(result.output).toContain("审批巡检");
    expect(result.output).toContain("approval scan / all goals / autoEscalate=true");
  });
});
