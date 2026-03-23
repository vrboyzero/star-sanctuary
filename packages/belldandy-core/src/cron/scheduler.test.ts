import { afterEach, describe, expect, it, vi } from "vitest";
import { startCronScheduler } from "./scheduler.js";
import type { CronJob } from "./types.js";

describe("startCronScheduler", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("executes goalApprovalScan payloads without requiring an agent prompt", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-03-21T08:00:00.000Z");
    vi.setSystemTime(now);
    const job: CronJob = {
      id: "cron_approval_scan",
      name: "approval scan",
      enabled: true,
      createdAtMs: now.getTime() - 60_000,
      updatedAtMs: now.getTime() - 60_000,
      schedule: {
        kind: "every",
        everyMs: 60_000,
        anchorMs: now.getTime() - 60_000,
      },
      payload: {
        kind: "goalApprovalScan",
        allGoals: true,
        autoEscalate: true,
      },
      state: {
        nextRunAtMs: now.getTime() - 1,
      },
    };
    const jobs = [job];
    const store = {
      list: vi.fn(async () => jobs),
      saveJobs: vi.fn(async (nextJobs: CronJob[]) => {
        jobs.splice(0, jobs.length, ...nextJobs);
      }),
    };
    const runGoalApprovalScan = vi.fn(async () => ({
      summary: "approval_scan goals=2 ok=2 failed=0 review_overdue=1 review_escalated=1 checkpoint_overdue=0 checkpoint_escalated=0 notifications=2",
      notifyMessage: "审批扫描完成：存在 1 条超时审批",
    }));
    const deliverToUser = vi.fn(async () => {});

    const scheduler = startCronScheduler({
      store: store as never,
      runGoalApprovalScan,
      deliverToUser,
      log: () => {},
    });

    await vi.advanceTimersByTimeAsync(30_000);
    scheduler.stop();

    expect(runGoalApprovalScan).toHaveBeenCalledWith({
      kind: "goalApprovalScan",
      allGoals: true,
      autoEscalate: true,
    });
    expect(deliverToUser).toHaveBeenCalledWith(expect.stringContaining("审批扫描完成"));
    expect(store.saveJobs).toHaveBeenCalledTimes(1);
    expect(job.state.lastStatus).toBe("ok");
    expect(job.state.lastError).toBeUndefined();
    expect(job.state.lastDurationMs).toBeTypeOf("number");
    expect(job.state.nextRunAtMs).toBeGreaterThan(now.getTime());
  });

  it("marks systemEvent job as error when no agent executor is available", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-03-21T08:10:00.000Z");
    vi.setSystemTime(now);
    const job: CronJob = {
      id: "cron_system_event",
      name: "system event",
      enabled: true,
      createdAtMs: now.getTime() - 60_000,
      updatedAtMs: now.getTime() - 60_000,
      schedule: {
        kind: "at",
        at: new Date(now.getTime() - 1_000).toISOString(),
      },
      payload: {
        kind: "systemEvent",
        text: "ping",
      },
      state: {
        nextRunAtMs: now.getTime() - 1,
      },
    };
    const jobs = [job];
    const store = {
      list: vi.fn(async () => jobs),
      saveJobs: vi.fn(async (nextJobs: CronJob[]) => {
        jobs.splice(0, jobs.length, ...nextJobs);
      }),
    };

    const scheduler = startCronScheduler({
      store: store as never,
      log: () => {},
    });

    await vi.advanceTimersByTimeAsync(30_000);
    scheduler.stop();

    expect(job.state.lastStatus).toBe("error");
    expect(job.state.lastError).toContain("Cron systemEvent executor is not available");
    expect(job.enabled).toBe(false);
    expect(job.state.nextRunAtMs).toBeUndefined();
  });

  it("does not overlap scheduler ticks while a previous job is still running", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-03-21T08:20:00.000Z");
    vi.setSystemTime(now);
    const job: CronJob = {
      id: "cron_overlap_guard",
      name: "slow system event",
      enabled: true,
      createdAtMs: now.getTime() - 60_000,
      updatedAtMs: now.getTime() - 60_000,
      schedule: {
        kind: "every",
        everyMs: 60_000,
        anchorMs: now.getTime() - 60_000,
      },
      payload: {
        kind: "systemEvent",
        text: "slow run",
      },
      state: {
        nextRunAtMs: now.getTime() - 1,
      },
    };
    const jobs = [job];
    const store = {
      list: vi.fn(async () => jobs),
      saveJobs: vi.fn(async (nextJobs: CronJob[]) => {
        jobs.splice(0, jobs.length, ...nextJobs);
      }),
    };

    let releaseRun: (() => void) | undefined;
    const sendMessage = vi.fn().mockImplementation(() => new Promise<string>((resolve) => {
      releaseRun = () => resolve("done");
    }));

    const scheduler = startCronScheduler({
      store: store as never,
      sendMessage,
      log: () => {},
    });

    await vi.advanceTimersByTimeAsync(30_000);
    expect(sendMessage).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(30_000);
    expect(sendMessage).toHaveBeenCalledTimes(1);

    releaseRun?.();
    await vi.runOnlyPendingTimersAsync();
    scheduler.stop();
  });
});
