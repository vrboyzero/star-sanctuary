import { describe, expect, test, vi } from "vitest";
import type { CronJob } from "../../cron/index.js";

import {
  buildCronOrganizePreview,
  buildCronOrganizePreviewLines,
  buildCronOrganizeRecommendations,
  clearCronOrganizeCustomPresets,
  removeCronOrganizeCustomPreset,
  renameCronOrganizeCustomPreset,
  storeCronOrganizeLastSelection,
  storeCronOrganizeLastPreview,
} from "./advanced-modules-cron-organize.js";

function createCronJob(input: Partial<CronJob> & Pick<CronJob, "id" | "name">): CronJob {
  return {
    id: input.id,
    name: input.name,
    enabled: input.enabled ?? true,
    createdAtMs: input.createdAtMs ?? 1,
    updatedAtMs: input.updatedAtMs ?? 1,
    schedule: input.schedule ?? { kind: "every", everyMs: 3_600_000 },
    payload: input.payload ?? { kind: "systemEvent", text: input.name },
    sessionTarget: input.sessionTarget ?? "main",
    delivery: input.delivery ?? { mode: "none" },
    failureDestination: input.failureDestination ?? { mode: "none" },
    state: input.state ?? {},
    ...(input.deleteAfterRun !== undefined ? { deleteAfterRun: input.deleteAfterRun } : {}),
  };
}

describe("advanced-modules-cron-organize", () => {
  test("renameCronOrganizeCustomPreset updates label and sort order", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-13T10:00:00.000Z"));

    const next = renameCronOrganizeCustomPreset({
      version: 1,
      customPresets: [
        {
          id: "b",
          label: "Bravo",
          action: "disable_multiple",
          criteria: {
            enabled: "enabled",
            lastStatus: "error",
            payloadKind: "any",
            silentOnly: false,
            missingNextRunOnly: false,
            failureDeliveryOffOnly: false,
            oneShotOnly: false,
          },
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: "a",
          label: "Alpha",
          action: "enable_multiple",
          criteria: {
            enabled: "disabled",
            lastStatus: "any",
            payloadKind: "goalApprovalScan",
            silentOnly: false,
            missingNextRunOnly: false,
            failureDeliveryOffOnly: false,
            oneShotOnly: false,
          },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    }, "b", "Able");

    expect(next.customPresets.map((item) => item.label)).toEqual(["Able", "Alpha"]);
    expect(next.customPresets[0]?.updatedAt).toBe(new Date("2026-04-13T10:00:00.000Z").getTime());

    vi.useRealTimers();
  });

  test("removeCronOrganizeCustomPreset removes one preset by id", () => {
    const next = removeCronOrganizeCustomPreset({
      version: 1,
      customPresets: [
        {
          id: "keep",
          label: "Keep",
          action: "enable_multiple",
          criteria: {
            enabled: "disabled",
            lastStatus: "any",
            payloadKind: "any",
            silentOnly: false,
            missingNextRunOnly: false,
            failureDeliveryOffOnly: false,
            oneShotOnly: false,
          },
          createdAt: 1,
          updatedAt: 1,
        },
        {
          id: "remove",
          label: "Remove",
          action: "disable_multiple",
          criteria: {
            enabled: "enabled",
            lastStatus: "error",
            payloadKind: "any",
            silentOnly: true,
            missingNextRunOnly: false,
            failureDeliveryOffOnly: false,
            oneShotOnly: false,
          },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
    }, "remove");

    expect(next.customPresets).toEqual([
      expect.objectContaining({ id: "keep" }),
    ]);
  });

  test("clearCronOrganizeCustomPresets keeps other state and empties preset list", () => {
    const next = clearCronOrganizeCustomPresets({
      version: 1,
      customPresets: [
        {
          id: "one",
          label: "One",
          action: "disable_multiple",
          criteria: {
            enabled: "enabled",
            lastStatus: "error",
            payloadKind: "any",
            silentOnly: false,
            missingNextRunOnly: false,
            failureDeliveryOffOnly: false,
            oneShotOnly: false,
          },
          createdAt: 1,
          updatedAt: 1,
        },
      ],
      lastSelection: {
        label: "Last selection",
        jobIds: ["job-a"],
        storedAt: 2,
      },
    });

    expect(next.customPresets).toEqual([]);
    expect(next.lastSelection).toEqual({
      label: "Last selection",
      jobIds: ["job-a"],
      storedAt: 2,
    });
  });

  test("buildCronOrganizeRecommendations returns matching presets ordered by hit count", () => {
    const recommendations = buildCronOrganizeRecommendations([
      createCronJob({
        id: "job-failed-a",
        name: "Job Failed A",
        payload: { kind: "systemEvent", text: "failed-a" },
        delivery: { mode: "none" },
        failureDestination: { mode: "none" },
        state: { lastRunAtMs: 1_700_000_000_000, nextRunAtMs: 1_700_000_000_000, lastStatus: "error", lastError: "timeout", lastDurationMs: 45_000 },
      }),
      createCronJob({
        id: "job-failed-b",
        name: "Job Failed B",
        payload: { kind: "systemEvent", text: "failed-b" },
        delivery: { mode: "none" },
        failureDestination: { mode: "none" },
        state: { lastRunAtMs: 1_700_000_000_001, nextRunAtMs: 1_700_000_000_001, lastStatus: "error", lastError: "timeout" },
      }),
      createCronJob({
        id: "job-goal-disabled",
        name: "Job Goal Disabled",
        enabled: false,
        payload: { kind: "goalApprovalScan", allGoals: true },
        delivery: { mode: "user" },
        failureDestination: { mode: "user" },
      }),
      createCronJob({
        id: "job-one-shot",
        name: "Job One Shot",
        enabled: false,
        schedule: { kind: "at", at: "2026-04-13T09:00:00+08:00" },
        payload: { kind: "systemEvent", text: "cleanup" },
      }),
    ]);

    expect(recommendations).toEqual([
      expect.objectContaining({
        id: "disable_silent_failed",
        matchCount: 2,
        historySummary: "failures 2, silent failures 2, slow runs 1",
        sampleSummary: "Job Failed A, Job Failed B",
      }),
      expect.objectContaining({
        id: "enable_disabled_goal_scans",
        matchCount: 1,
      }),
      expect.objectContaining({
        id: "remove_disabled_one_shot",
        matchCount: 1,
      }),
    ]);
  });

  test("buildCronOrganizePreview and lines summarize dry-run impact", () => {
    const jobs = [
      createCronJob({
        id: "job-a",
        name: "Job A",
        enabled: true,
        delivery: { mode: "none" },
        failureDestination: { mode: "none" },
        state: { lastStatus: "error", lastError: "timeout" },
      }),
      createCronJob({
        id: "job-b",
        name: "Job B",
        enabled: false,
        schedule: { kind: "at", at: "2026-04-13T09:00:00+08:00" },
        delivery: { mode: "none" },
        failureDestination: { mode: "none" },
      }),
    ];

    expect(buildCronOrganizePreview({
      action: "disable_multiple",
      jobs,
    })).toEqual({
      matchedCount: 2,
      changeCount: 1,
      unchangedCount: 1,
      enabledCount: 1,
      disabledCount: 1,
      silentCount: 2,
      oneShotCount: 1,
      missingNextRunCount: 1,
      recentFailureCount: 1,
    });

    expect(buildCronOrganizePreviewLines({
      action: "disable_multiple",
      selectionLabel: "Filter all jobs: Job A, Job B",
      jobs,
    })).toEqual(expect.arrayContaining([
      "Selection: Filter all jobs: Job A, Job B",
      "Action preview: disable",
      "Matched jobs: 2",
      "Would disable 1 job(s).",
      "Already disabled: 1",
      "Current state mix: enabled 1, disabled 1",
      "Recent failures in selection: 1",
      "Enabled jobs missing next run: 1",
      "Silent jobs in selection: 2",
      "One-shot jobs in selection: 1",
      "Matched job names: Job A, Job B",
    ]));
  });

  test("storeCronOrganizeLastPreview records reusable preview metadata", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-13T11:00:00.000Z"));

    const next = storeCronOrganizeLastPreview({
      version: 1,
      customPresets: [],
    }, {
      label: "Filter failed jobs: Job A, Job B",
      action: "disable_multiple",
      jobIds: ["job-a", "job-b"],
    });

    expect(next.lastPreview).toEqual({
      label: "Filter failed jobs: Job A, Job B",
      action: "disable_multiple",
      jobIds: ["job-a", "job-b"],
      storedAt: new Date("2026-04-13T11:00:00.000Z").getTime(),
    });

    vi.useRealTimers();
  });

  test("storeCronOrganizeLastSelection records reusable selection metadata", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-13T12:00:00.000Z"));

    const next = storeCronOrganizeLastSelection({
      version: 1,
      customPresets: [],
    }, {
      label: "Saved selection: Job A, Job B",
      jobIds: ["job-a", "job-b"],
    });

    expect(next.lastSelection).toEqual({
      label: "Saved selection: Job A, Job B",
      jobIds: ["job-a", "job-b"],
      storedAt: new Date("2026-04-13T12:00:00.000Z").getTime(),
    });

    vi.useRealTimers();
  });
});
