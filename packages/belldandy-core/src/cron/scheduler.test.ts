import { afterEach, describe, expect, it, vi } from "vitest";
import { startCronScheduler } from "./scheduler.js";
import { computeNextRunForJob } from "./store.js";
import type { CronJob } from "./types.js";

function createCronJob(partial: Omit<CronJob, "sessionTarget" | "delivery"> & Partial<Pick<CronJob, "sessionTarget" | "delivery" | "failureDestination">>): CronJob {
  return {
    sessionTarget: partial.sessionTarget ?? "main",
    delivery: partial.delivery ?? { mode: "user" },
    ...partial,
  };
}

describe("startCronScheduler", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("executes goalApprovalScan payloads without requiring an agent prompt", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-03-21T08:00:00.000Z");
    vi.setSystemTime(now);
    const job: CronJob = createCronJob({
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
    });
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
    const job: CronJob = createCronJob({
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
    });
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
    const job: CronJob = createCronJob({
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
    });
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

  it("executes dailyAt jobs and advances to the next day", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-03-30T09:01:00.000Z");
    vi.setSystemTime(now);
    const job: CronJob = createCronJob({
      id: "cron_daily_at",
      name: "daily sync",
      enabled: true,
      createdAtMs: now.getTime() - 60_000,
      updatedAtMs: now.getTime() - 60_000,
      schedule: {
        kind: "dailyAt",
        time: "09:00",
        timezone: "UTC",
      },
      payload: {
        kind: "systemEvent",
        text: "daily check",
      },
      state: {
        nextRunAtMs: now.getTime() - 1,
      },
    });
    const jobs = [job];
    const store = {
      list: vi.fn(async () => jobs),
      saveJobs: vi.fn(async (nextJobs: CronJob[]) => {
        jobs.splice(0, jobs.length, ...nextJobs);
      }),
    };
    const sendMessage = vi.fn(async () => "done");

    const scheduler = startCronScheduler({
      store: store as never,
      sendMessage,
      log: () => {},
    });

    await vi.advanceTimersByTimeAsync(30_000);
    scheduler.stop();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(job.state.lastStatus).toBe("ok");
    expect(job.state.nextRunAtMs).toBe(Date.parse("2026-03-31T09:00:00.000Z"));
  });

  it("executes weeklyAt jobs and advances to the next matching weekday", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-04-03T10:31:00.000Z"); // Friday
    vi.setSystemTime(now);
    const job: CronJob = createCronJob({
      id: "cron_weekly_at",
      name: "weekly sync",
      enabled: true,
      createdAtMs: now.getTime() - 60_000,
      updatedAtMs: now.getTime() - 60_000,
      schedule: {
        kind: "weeklyAt",
        weekdays: [1, 3, 5],
        time: "10:30",
        timezone: "UTC",
      },
      payload: {
        kind: "systemEvent",
        text: "weekly check",
      },
      state: {
        nextRunAtMs: now.getTime() - 1,
      },
    });
    const jobs = [job];
    const store = {
      list: vi.fn(async () => jobs),
      saveJobs: vi.fn(async (nextJobs: CronJob[]) => {
        jobs.splice(0, jobs.length, ...nextJobs);
      }),
    };
    const sendMessage = vi.fn(async () => "done");

    const scheduler = startCronScheduler({
      store: store as never,
      sendMessage,
      log: () => {},
    });

    await vi.advanceTimersByTimeAsync(30_000);
    scheduler.stop();

    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(job.state.lastStatus).toBe("ok");
    expect(job.state.nextRunAtMs).toBe(Date.parse("2026-04-06T10:30:00.000Z"));
  });

  it("passes a stable conversation to main jobs and a new one to isolated jobs", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-04-03T10:31:00.000Z");
    vi.setSystemTime(now);
    const mainJob = createCronJob({
      id: "cron_main_job",
      name: "main sync",
      enabled: true,
      createdAtMs: now.getTime() - 60_000,
      updatedAtMs: now.getTime() - 60_000,
      sessionTarget: "main",
      schedule: { kind: "at", at: new Date(now.getTime() - 1_000).toISOString() },
      payload: { kind: "systemEvent", text: "main check" },
      state: { nextRunAtMs: now.getTime() - 1 },
    });
    const isolatedJob = createCronJob({
      id: "cron_isolated_job",
      name: "isolated sync",
      enabled: true,
      createdAtMs: now.getTime() - 60_000,
      updatedAtMs: now.getTime() - 60_000,
      sessionTarget: "isolated",
      schedule: { kind: "at", at: new Date(now.getTime() - 1_000).toISOString() },
      payload: { kind: "systemEvent", text: "isolated check" },
      state: { nextRunAtMs: now.getTime() - 1 },
    });
    const jobs = [mainJob, isolatedJob];
    const store = {
      list: vi.fn(async () => jobs),
      saveJobs: vi.fn(async () => {}),
    };
    const sendMessage = vi.fn(async (job: CronJob) => `done:${job.id}`);

    const scheduler = startCronScheduler({
      store: store as never,
      sendMessage,
      log: () => {},
    });

    await vi.advanceTimersByTimeAsync(30_000);
    scheduler.stop();

    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ id: "cron_main_job", sessionTarget: "main" }), "main check");
    expect(sendMessage).toHaveBeenCalledWith(expect.objectContaining({ id: "cron_isolated_job", sessionTarget: "isolated" }), "isolated check");
  });

  it("suppresses success delivery when delivery.mode is none and sends failure notices when configured", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-04-03T10:31:00.000Z");
    vi.setSystemTime(now);
    const silentJob = createCronJob({
      id: "cron_silent_job",
      name: "silent sync",
      enabled: true,
      createdAtMs: now.getTime() - 60_000,
      updatedAtMs: now.getTime() - 60_000,
      delivery: { mode: "none" },
      schedule: { kind: "at", at: new Date(now.getTime() - 1_000).toISOString() },
      payload: { kind: "systemEvent", text: "silent check" },
      state: { nextRunAtMs: now.getTime() - 1 },
    });
    const failingJob = createCronJob({
      id: "cron_failure_job",
      name: "failing sync",
      enabled: true,
      createdAtMs: now.getTime() - 60_000,
      updatedAtMs: now.getTime() - 60_000,
      failureDestination: { mode: "user" },
      schedule: { kind: "at", at: new Date(now.getTime() - 1_000).toISOString() },
      payload: { kind: "systemEvent", text: "failing check" },
      state: { nextRunAtMs: now.getTime() - 1 },
    });
    const jobs = [silentJob, failingJob];
    const store = {
      list: vi.fn(async () => jobs),
      saveJobs: vi.fn(async () => {}),
    };
    const sendMessage = vi.fn()
      .mockResolvedValueOnce("silent done")
      .mockRejectedValueOnce(new Error("boom"));
    const deliverToUser = vi.fn(async () => {});

    const scheduler = startCronScheduler({
      store: store as never,
      sendMessage,
      deliverToUser,
      log: () => {},
    });

    await vi.advanceTimersByTimeAsync(30_000);
    scheduler.stop();

    expect(deliverToUser).toHaveBeenCalledTimes(1);
    expect(deliverToUser).toHaveBeenCalledWith(expect.stringContaining("执行失败"));
  });

  it("keeps staggered schedules on subsequent nextRun recalculation", async () => {
    vi.useFakeTimers();
    const now = new Date("2026-04-03T10:31:00.000Z");
    vi.setSystemTime(now);
    const job = createCronJob({
      id: "cron_staggered_job",
      name: "staggered sync",
      enabled: true,
      createdAtMs: now.getTime() - 60_000,
      updatedAtMs: now.getTime() - 60_000,
      schedule: {
        kind: "every",
        everyMs: 60_000,
        anchorMs: now.getTime() - 60_000,
        staggerMs: 15_000,
      },
      payload: {
        kind: "systemEvent",
        text: "staggered check",
      },
      state: {
        nextRunAtMs: now.getTime() - 1,
      },
    });
    const jobs = [job];
    const store = {
      list: vi.fn(async () => jobs),
      saveJobs: vi.fn(async (nextJobs: CronJob[]) => {
        jobs.splice(0, jobs.length, ...nextJobs);
      }),
    };
    const sendMessage = vi.fn(async () => "done");

    const scheduler = startCronScheduler({
      store: store as never,
      sendMessage,
      log: () => {},
    });

    await vi.advanceTimersByTimeAsync(30_000);
    scheduler.stop();

    const expectedNextRunAtMs = computeNextRunForJob(job, Date.now());
    expect(job.state.lastStatus).toBe("ok");
    expect(job.state.nextRunAtMs).toBe(expectedNextRunAtMs);
    expect(job.state.nextRunAtMs).toBeGreaterThan(Date.now());
  });

  it("marks due jobs as skipped when scheduler is blocked by active hours or busy state", async () => {
    vi.useFakeTimers();
    const outsideHoursNow = new Date("2026-04-03T03:31:00.000Z");
    vi.setSystemTime(outsideHoursNow);
    const outsideHoursJob = createCronJob({
      id: "cron_outside_hours",
      name: "outside hours sync",
      enabled: true,
      createdAtMs: outsideHoursNow.getTime() - 60_000,
      updatedAtMs: outsideHoursNow.getTime() - 60_000,
      schedule: {
        kind: "every",
        everyMs: 60_000,
        anchorMs: outsideHoursNow.getTime() - 60_000,
      },
      payload: {
        kind: "systemEvent",
        text: "should wait for active window",
      },
      state: {
        nextRunAtMs: outsideHoursNow.getTime() - 1,
      },
    });
    const activeHoursJobs = [outsideHoursJob];
    const activeHoursStore = {
      list: vi.fn(async () => activeHoursJobs),
      saveJobs: vi.fn(async (nextJobs: CronJob[]) => {
        activeHoursJobs.splice(0, activeHoursJobs.length, ...nextJobs);
      }),
    };
    const activeHoursScheduler = startCronScheduler({
      store: activeHoursStore as never,
      sendMessage: vi.fn(async () => "done"),
      activeHours: { start: "08:00", end: "23:00" },
      timezone: "UTC",
      log: () => {},
    });

    await vi.advanceTimersByTimeAsync(30_000);
    activeHoursScheduler.stop();

    expect(outsideHoursJob.state.lastStatus).toBe("skipped");
    expect(outsideHoursJob.state.lastError).toBe("Skipped: outside active hours.");
    expect(outsideHoursJob.state.lastDurationMs).toBe(0);
    expect(outsideHoursJob.state.nextRunAtMs).toBe(outsideHoursNow.getTime() - 1);
    expect(activeHoursStore.saveJobs).toHaveBeenCalledTimes(1);

    const busyNow = new Date("2026-04-03T10:31:00.000Z");
    vi.setSystemTime(busyNow);
    const busyJob = createCronJob({
      id: "cron_busy",
      name: "busy sync",
      enabled: true,
      createdAtMs: busyNow.getTime() - 60_000,
      updatedAtMs: busyNow.getTime() - 60_000,
      schedule: {
        kind: "every",
        everyMs: 60_000,
        anchorMs: busyNow.getTime() - 60_000,
      },
      payload: {
        kind: "systemEvent",
        text: "should wait for idle state",
      },
      state: {
        nextRunAtMs: busyNow.getTime() - 1,
      },
    });
    const busyJobs = [busyJob];
    const busyStore = {
      list: vi.fn(async () => busyJobs),
      saveJobs: vi.fn(async (nextJobs: CronJob[]) => {
        busyJobs.splice(0, busyJobs.length, ...nextJobs);
      }),
    };
    const sendMessage = vi.fn(async () => "done");
    const busyScheduler = startCronScheduler({
      store: busyStore as never,
      sendMessage,
      isBusy: () => true,
      log: () => {},
    });

    await vi.advanceTimersByTimeAsync(30_000);
    busyScheduler.stop();

    expect(sendMessage).not.toHaveBeenCalled();
    expect(busyJob.state.lastStatus).toBe("skipped");
    expect(busyJob.state.lastError).toBe("Skipped: scheduler is busy.");
    expect(busyJob.state.lastDurationMs).toBe(0);
    expect(busyJob.state.nextRunAtMs).toBe(busyNow.getTime() - 1);
    expect(busyStore.saveJobs).toHaveBeenCalledTimes(1);
  });
});
