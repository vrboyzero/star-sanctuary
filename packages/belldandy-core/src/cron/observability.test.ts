import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { buildCronRuntimeDoctorReport } from "./observability.js";
import { CronStore } from "./store.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true }).catch(() => {})));
});

describe("buildCronRuntimeDoctorReport", () => {
  it("summarizes cron job routing, delivery, stagger, and scheduler status", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "cron-observability-"));
    tempDirs.push(stateDir);

    const store = new CronStore(stateDir);
    await store.add({
      name: "Main digest",
      schedule: { kind: "every", everyMs: 60_000, anchorMs: Date.now(), staggerMs: 15_000 },
      payload: { kind: "systemEvent", text: "refresh digest" },
      sessionTarget: "main",
      delivery: { mode: "user" },
      failureDestination: { mode: "user" },
    });
    await store.add({
      name: "Goal scan",
      schedule: { kind: "dailyAt", time: "09:00", timezone: "Asia/Shanghai" },
      payload: { kind: "goalApprovalScan", allGoals: true },
      sessionTarget: "isolated",
      delivery: { mode: "none" },
    });

    const report = await buildCronRuntimeDoctorReport({
      enabled: true,
      store,
      scheduler: {
        status: () => ({
          running: true,
          activeRuns: 1,
          lastTickAtMs: 1_710_000_000_000,
        }),
      },
    });

    expect(report.scheduler).toMatchObject({
      enabled: true,
      running: true,
      activeRuns: 1,
      lastTickAtMs: 1_710_000_000_000,
    });
    expect(report.totals).toMatchObject({
      totalJobs: 2,
      enabledJobs: 2,
      disabledJobs: 0,
      staggeredJobs: 1,
      invalidNextRunJobs: 0,
    });
    expect(report.sessionTargetCounts).toEqual({
      main: 1,
      isolated: 1,
    });
    expect(report.deliveryModeCounts).toEqual({
      user: 1,
      none: 1,
    });
    expect(report.failureDestinationModeCounts).toEqual({
      user: 1,
      none: 1,
    });
    expect(report.recentJobs).toEqual(expect.arrayContaining([
      expect.objectContaining({
        name: "Main digest",
        sessionTarget: "main",
        deliveryMode: "user",
        failureDestinationMode: "user",
        staggerMs: 15_000,
      }),
      expect.objectContaining({
        name: "Goal scan",
        sessionTarget: "isolated",
        deliveryMode: "none",
        failureDestinationMode: "none",
      }),
    ]));
    expect(report.headline).toContain("jobs=2/2");
    expect(report.headline).toContain("session main=1");
    expect(report.headline).toContain("stagger=1");
    expect(report.headline).toContain("activeRuns=1");
  });
});
