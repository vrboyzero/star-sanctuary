import { describe, expect, test } from "vitest";
import type { CronJob } from "../../cron/index.js";

import {
  filterCronJobsForOrganize,
  filterCronJobsByCriteria,
  getCronOrganizePreset,
  listCronOrganizePresets,
  parseBooleanEnv,
  removeModelFallbackProfiles,
  removeModelFallbackProfile,
  removeWebhookRule,
  sortModelFallbackProfiles,
  validateOptionalNonNegativeInt,
  validateOptionalActiveHours,
  validateOptionalPositiveInt,
  validateOptionalUrl,
  validateHeartbeatInterval,
  validateHttpUrl,
  validateWebhookId,
  upsertModelFallbackProfile,
  upsertWebhookRule,
} from "./advanced-modules-shared.js";

describe("advanced-modules-shared", () => {
  test("upsertModelFallbackProfile updates existing fallback by id", () => {
    const next = upsertModelFallbackProfile({
      fallbacks: [{
        id: "backup",
        baseUrl: "https://old.example/v1",
        apiKey: "sk-old",
        model: "old-model",
      }],
    }, {
      id: "backup",
      displayName: "Backup Route",
      baseUrl: "https://new.example/v1",
      apiKey: "sk-new",
      model: "new-model",
    });

    expect(next.fallbacks).toEqual([{
      id: "backup",
      displayName: "Backup Route",
      baseUrl: "https://new.example/v1",
      apiKey: "sk-new",
      model: "new-model",
    }]);
  });

  test("upsertWebhookRule appends new rules and preserves version", () => {
    const next = upsertWebhookRule({
      version: 1,
      webhooks: [],
    }, {
      id: "audit",
      enabled: true,
      token: "secret-token",
      defaultAgentId: "default",
    });

    expect(next).toEqual({
      version: 1,
      webhooks: [{
        id: "audit",
        enabled: true,
        token: "secret-token",
        defaultAgentId: "default",
      }],
    });
  });

  test("removeModelFallbackProfile removes a single fallback by id", () => {
    const next = removeModelFallbackProfile({
      fallbacks: [
        {
          id: "backup-a",
          baseUrl: "https://a.example/v1",
          apiKey: "sk-a",
          model: "model-a",
        },
        {
          id: "backup-b",
          baseUrl: "https://b.example/v1",
          apiKey: "sk-b",
          model: "model-b",
        },
      ],
    }, "backup-a");

    expect(next.fallbacks).toEqual([{
      id: "backup-b",
      baseUrl: "https://b.example/v1",
      apiKey: "sk-b",
      model: "model-b",
    }]);
  });

  test("removeModelFallbackProfiles removes multiple fallbacks by id", () => {
    const next = removeModelFallbackProfiles({
      fallbacks: [
        {
          id: "backup-a",
          baseUrl: "https://a.example/v1",
          apiKey: "sk-a",
          model: "model-a",
        },
        {
          id: "backup-b",
          baseUrl: "https://b.example/v1",
          apiKey: "sk-b",
          model: "model-b",
        },
        {
          id: "backup-c",
          baseUrl: "https://c.example/v1",
          apiKey: "sk-c",
          model: "model-c",
        },
      ],
    }, ["backup-a", "backup-c"]);

    expect(next.fallbacks).toEqual([{
      id: "backup-b",
      baseUrl: "https://b.example/v1",
      apiKey: "sk-b",
      model: "model-b",
    }]);
  });

  test("sortModelFallbackProfiles supports sorting by displayName", () => {
    const next = sortModelFallbackProfiles({
      fallbacks: [
        {
          id: "zeta",
          displayName: "Zulu",
          baseUrl: "https://z.example/v1",
          apiKey: "sk-z",
          model: "model-z",
        },
        {
          id: "alpha",
          displayName: "Alpha",
          baseUrl: "https://a.example/v1",
          apiKey: "sk-a",
          model: "model-a",
        },
      ],
    }, "displayName");

    expect(next.fallbacks.map((item) => item.id)).toEqual(["alpha", "zeta"]);
  });

  test("removeWebhookRule removes a single rule by id", () => {
    const next = removeWebhookRule({
      version: 1,
      webhooks: [
        {
          id: "audit",
          enabled: true,
          token: "token-a",
        },
        {
          id: "sync",
          enabled: false,
          token: "token-b",
        },
      ],
    }, "audit");

    expect(next).toEqual({
      version: 1,
      webhooks: [{
        id: "sync",
        enabled: false,
        token: "token-b",
      }],
    });
  });

  test("parseBooleanEnv falls back for unsupported values", () => {
    expect(parseBooleanEnv("true", false)).toBe(true);
    expect(parseBooleanEnv("false", true)).toBe(false);
    expect(parseBooleanEnv("maybe", true)).toBe(true);
    expect(parseBooleanEnv(undefined, false)).toBe(false);
  });

  test("validateHttpUrl accepts http(s) urls and rejects invalid values", () => {
    expect(validateHttpUrl("https://api.openai.com/v1", "Base URL")).toBeUndefined();
    expect(validateHttpUrl("http://127.0.0.1:8787", "Base URL")).toBeUndefined();
    expect(validateHttpUrl("ftp://example.com", "Base URL")).toBe("Base URL must use http or https");
    expect(validateHttpUrl("not-a-url", "Base URL")).toBe("Base URL must be a valid http(s) URL");
  });

  test("validateWebhookId rejects unsafe path fragments", () => {
    expect(validateWebhookId("audit")).toBeUndefined();
    expect(validateWebhookId("release_hook.v2")).toBeUndefined();
    expect(validateWebhookId("audit/run")).toBe("Webhook id may only contain letters, numbers, dot, underscore, or dash");
    expect(validateWebhookId("")).toBe("Webhook id is required");
  });

  test("validateHeartbeatInterval matches gateway parser format", () => {
    expect(validateHeartbeatInterval("30m")).toBeUndefined();
    expect(validateHeartbeatInterval("1h")).toBeUndefined();
    expect(validateHeartbeatInterval("45s")).toBeUndefined();
    expect(validateHeartbeatInterval("15")).toBeUndefined();
    expect(validateHeartbeatInterval("0m")).toBe("Heartbeat interval must be greater than 0");
    expect(validateHeartbeatInterval("every 5 minutes")).toBe("Heartbeat interval must be like 30m, 1h, or 45s");
  });

  test("validateOptionalPositiveInt allows blank and rejects invalid input", () => {
    expect(validateOptionalPositiveInt("", "Timeout")).toBeUndefined();
    expect(validateOptionalPositiveInt("15000", "Timeout")).toBeUndefined();
    expect(validateOptionalPositiveInt("0", "Timeout")).toBe("Timeout must be greater than 0");
    expect(validateOptionalPositiveInt("1.5", "Timeout")).toBe("Timeout must be a positive integer");
  });

  test("validateOptionalNonNegativeInt allows blank and zero", () => {
    expect(validateOptionalNonNegativeInt("", "Retries")).toBeUndefined();
    expect(validateOptionalNonNegativeInt("0", "Retries")).toBeUndefined();
    expect(validateOptionalNonNegativeInt("3", "Retries")).toBeUndefined();
    expect(validateOptionalNonNegativeInt("-1", "Retries")).toBe("Retries must be a non-negative integer");
  });

  test("validateOptionalUrl allows blank and parseable urls", () => {
    expect(validateOptionalUrl("", "Proxy URL")).toBeUndefined();
    expect(validateOptionalUrl("http://127.0.0.1:7890", "Proxy URL")).toBeUndefined();
    expect(validateOptionalUrl("socks5://127.0.0.1:1080", "Proxy URL")).toBeUndefined();
    expect(validateOptionalUrl("not-a-url", "Proxy URL")).toBe("Proxy URL must be a valid URL");
  });

  test("validateOptionalActiveHours allows blank and validates time ranges", () => {
    expect(validateOptionalActiveHours("", "Heartbeat active hours")).toBeUndefined();
    expect(validateOptionalActiveHours("08:00-23:00", "Heartbeat active hours")).toBeUndefined();
    expect(validateOptionalActiveHours("22:00-06:00", "Heartbeat active hours")).toBeUndefined();
    expect(validateOptionalActiveHours("24:00-06:00", "Heartbeat active hours")).toBeUndefined();
    expect(validateOptionalActiveHours("08:00", "Heartbeat active hours")).toBe("Heartbeat active hours must be like 08:00-23:00");
    expect(validateOptionalActiveHours("24:30-06:00", "Heartbeat active hours")).toBe("Heartbeat active hours must be like 08:00-23:00");
    expect(validateOptionalActiveHours("08:00-08:00", "Heartbeat active hours")).toBe("Heartbeat active hours must not use the same start and end time");
  });

  test("filterCronJobsForOrganize supports common cron triage filters", () => {
    const jobs: CronJob[] = [
      {
        id: "job-a",
        name: "Job A",
        enabled: true,
        createdAtMs: 1,
        updatedAtMs: 1,
        schedule: { kind: "every", everyMs: 60_000 },
        payload: { kind: "systemEvent", text: "A" },
        sessionTarget: "main" as const,
        delivery: { mode: "none" as const },
        failureDestination: { mode: "none" as const },
        state: { lastStatus: "error" as const, lastError: "network timeout" },
      },
      {
        id: "job-b",
        name: "Job B",
        enabled: true,
        createdAtMs: 1,
        updatedAtMs: 1,
        schedule: { kind: "dailyAt", time: "09:00", timezone: "Asia/Shanghai" },
        payload: { kind: "goalApprovalScan", allGoals: true },
        sessionTarget: "isolated" as const,
        delivery: { mode: "user" as const },
        failureDestination: { mode: "user" as const },
        state: { lastStatus: "ok" as const, nextRunAtMs: Date.now() + 1000 },
      },
      {
        id: "job-c",
        name: "Job C",
        enabled: false,
        createdAtMs: 1,
        updatedAtMs: 1,
        schedule: { kind: "weeklyAt", weekdays: [1], time: "10:00", timezone: "Asia/Shanghai" },
        payload: { kind: "systemEvent", text: "C" },
        sessionTarget: "main" as const,
        delivery: { mode: "none" as const },
        failureDestination: { mode: "none" as const },
        state: { lastStatus: "skipped" as const },
      },
      {
        id: "job-d",
        name: "Job D",
        enabled: true,
        createdAtMs: 1,
        updatedAtMs: 1,
        schedule: { kind: "every", everyMs: 120_000 },
        payload: { kind: "systemEvent", text: "D" },
        sessionTarget: "main" as const,
        delivery: { mode: "user" as const },
        failureDestination: { mode: "none" as const },
        state: {},
      },
    ];

    expect(filterCronJobsForOrganize(jobs, "failed").map((job) => job.id)).toEqual(["job-a"]);
    expect(filterCronJobsForOrganize(jobs, "goal_approval_scan").map((job) => job.id)).toEqual(["job-b"]);
    expect(filterCronJobsForOrganize(jobs, "silent").map((job) => job.id)).toEqual(["job-a", "job-c"]);
    expect(filterCronJobsForOrganize(jobs, "missing_next_run").map((job) => job.id)).toEqual(["job-a", "job-d"]);
    expect(filterCronJobsForOrganize(jobs, "disabled").map((job) => job.id)).toEqual(["job-c"]);
  });

  test("filterCronJobsByCriteria combines multiple cron triage conditions", () => {
    const jobs: CronJob[] = [
      {
        id: "job-a",
        name: "Job A",
        enabled: true,
        createdAtMs: 1,
        updatedAtMs: 1,
        schedule: { kind: "every", everyMs: 60_000 },
        payload: { kind: "goalApprovalScan", allGoals: true },
        sessionTarget: "main",
        delivery: { mode: "none" },
        failureDestination: { mode: "none" },
        state: { lastStatus: "error", lastError: "approval store unavailable" },
      },
      {
        id: "job-b",
        name: "Job B",
        enabled: true,
        createdAtMs: 1,
        updatedAtMs: 1,
        schedule: { kind: "every", everyMs: 60_000 },
        payload: { kind: "goalApprovalScan", allGoals: true },
        sessionTarget: "main",
        delivery: { mode: "user" },
        failureDestination: { mode: "user" },
        state: { lastStatus: "error", lastError: "approval store unavailable" },
      },
      {
        id: "job-c",
        name: "Job C",
        enabled: false,
        createdAtMs: 1,
        updatedAtMs: 1,
        schedule: { kind: "at", at: "2026-04-13T09:00:00+08:00" },
        payload: { kind: "systemEvent", text: "cleanup" },
        sessionTarget: "main",
        delivery: { mode: "none" },
        failureDestination: { mode: "none" },
        state: {},
      },
    ];

    const filtered = filterCronJobsByCriteria(jobs, {
      enabled: "enabled",
      lastStatus: "error",
      payloadKind: "goalApprovalScan",
      silentOnly: true,
      missingNextRunOnly: false,
      failureDeliveryOffOnly: true,
      oneShotOnly: false,
    });

    expect(filtered.map((job) => job.id)).toEqual(["job-a"]);
  });

  test("cron organize presets expose recommended actions and criteria", () => {
    const presets = listCronOrganizePresets();
    expect(presets.some((item) => item.id === "disable_silent_failed")).toBe(true);
    expect(getCronOrganizePreset("remove_disabled_one_shot")).toMatchObject({
      action: "remove_multiple",
      criteria: {
        enabled: "disabled",
        oneShotOnly: true,
      },
    });
  });
});
