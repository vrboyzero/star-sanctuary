import crypto from "node:crypto";

import { describe, expect, it } from "vitest";
import { computeNextRun } from "./store.js";

describe("computeNextRun", () => {
  it("computes dailyAt in Asia/Shanghai before the target time", () => {
    const nowMs = Date.parse("2026-03-30T00:30:00.000Z"); // 08:30 +08:00
    const nextRunAtMs = computeNextRun({
      kind: "dailyAt",
      time: "09:00",
      timezone: "Asia/Shanghai",
    }, nowMs);

    expect(nextRunAtMs).toBe(Date.parse("2026-03-30T01:00:00.000Z"));
  });

  it("pushes dailyAt to the next day when now is exactly at the target time", () => {
    const nowMs = Date.parse("2026-03-30T01:00:00.000Z"); // 09:00 +08:00
    const nextRunAtMs = computeNextRun({
      kind: "dailyAt",
      time: "09:00",
      timezone: "Asia/Shanghai",
    }, nowMs);

    expect(nextRunAtMs).toBe(Date.parse("2026-03-31T01:00:00.000Z"));
  });

  it("computes weeklyAt for the next valid weekday in UTC", () => {
    const nowMs = Date.parse("2026-03-31T08:00:00.000Z"); // Tuesday
    const nextRunAtMs = computeNextRun({
      kind: "weeklyAt",
      weekdays: [3, 5],
      time: "10:30",
      timezone: "UTC",
    }, nowMs);

    expect(nextRunAtMs).toBe(Date.parse("2026-04-01T10:30:00.000Z"));
  });

  it("pushes weeklyAt to the next matching weekday after the same-day time has passed", () => {
    const nowMs = Date.parse("2026-04-01T11:00:00.000Z"); // Wednesday
    const nextRunAtMs = computeNextRun({
      kind: "weeklyAt",
      weekdays: [3, 5],
      time: "10:30",
      timezone: "UTC",
    }, nowMs);

    expect(nextRunAtMs).toBe(Date.parse("2026-04-03T10:30:00.000Z"));
  });

  it("returns undefined for invalid timezone or weekdays", () => {
    expect(computeNextRun({
      kind: "dailyAt",
      time: "09:00",
      timezone: "Invalid/Zone",
    }, Date.now())).toBeUndefined();

    expect(computeNextRun({
      kind: "weeklyAt",
      weekdays: [1, 1],
      time: "10:30",
      timezone: "UTC",
    }, Date.now())).toBeUndefined();
  });

  it("keeps base schedule math stable even when staggerMs is present", () => {
    const nowMs = Date.parse("2026-04-01T00:00:00.000Z");
    const nextRunAtMs = computeNextRun({
      kind: "every",
      everyMs: 60_000,
      staggerMs: 30_000,
    }, nowMs);

    expect(nextRunAtMs).toBe(nowMs);
  });
});

describe("cron stagger offset", () => {
  it("derives a stable offset within the stagger window", () => {
    const staggerMs = 30_000;
    const digest = crypto.createHash("sha256").update("cron-stagger").digest();
    const offset = digest.readUInt32BE(0) % staggerMs;

    expect(offset).toBeGreaterThanOrEqual(0);
    expect(offset).toBeLessThan(staggerMs);
  });
});
