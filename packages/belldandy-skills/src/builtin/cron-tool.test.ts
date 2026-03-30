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

  it("creates dailyAt jobs", async () => {
    const add = vi.fn(async (input) => ({
      id: "job_daily_at",
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
      name: "每日站会提醒",
      payloadKind: "systemEvent",
      text: "提醒今天的站会",
      scheduleKind: "dailyAt",
      time: "09:00",
      timezone: "Asia/Shanghai",
    }, context);

    expect(result.success).toBe(true);
    expect(result.output).toContain("每天 09:00 @ Asia/Shanghai");
    expect(add).toHaveBeenCalledWith(expect.objectContaining({
      schedule: {
        kind: "dailyAt",
        time: "09:00",
        timezone: "Asia/Shanghai",
      },
    }));
  });

  it("rejects invalid weekdays for weeklyAt jobs", async () => {
    const tool = createCronTool({
      store: {
        list: vi.fn(async () => []),
        add: vi.fn(),
        remove: vi.fn(async () => false),
      },
    });

    const result = await tool.execute({
      action: "add",
      name: "每周巡检",
      payloadKind: "systemEvent",
      text: "执行巡检",
      scheduleKind: "weeklyAt",
      time: "10:30",
      timezone: "Asia/Shanghai",
      weekdays: [1, 1, 3],
    }, context);

    expect(result.success).toBe(false);
    expect(result.error).toContain("weekdays 不允许重复");
  });

  it("renders weeklyAt schedules in cron list output", async () => {
    const tool = createCronTool({
      store: {
        list: vi.fn(async () => [{
          id: "job_weekly_at",
          name: "周历巡检",
          enabled: true,
          schedule: {
            kind: "weeklyAt" as const,
            weekdays: [1, 3, 5],
            time: "10:30",
            timezone: "Asia/Shanghai",
          },
          payload: {
            kind: "systemEvent" as const,
            text: "执行周历巡检",
          },
          state: {
            nextRunAtMs: Date.parse("2026-04-01T02:30:00.000Z"),
            lastRunAtMs: Date.parse("2026-03-30T02:30:00.000Z"),
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
    expect(result.output).toContain("每周 Mon/Wed/Fri 10:30 @ Asia/Shanghai");
  });
});
