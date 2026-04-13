import { describe, expect, test } from "vitest";

import {
  buildRuntimeResilienceDiagnosticSummary,
  summarizeRuntimeResilienceReasonCounts,
} from "./runtime-resilience-diagnostics.js";
import type { RuntimeResilienceDoctorReport } from "./runtime-resilience.js";

const SAMPLE_NOW = 1712736000000;

function createReport(): RuntimeResilienceDoctorReport {
  return {
    version: 1,
    updatedAt: SAMPLE_NOW,
    routing: {
      primary: {
        profileId: "primary",
        provider: "openai.com",
        model: "gpt-4.1",
      },
      fallbacks: [
        {
          profileId: "backup",
          provider: "moonshot.ai",
          model: "kimi-k2",
        },
      ],
      compaction: {
        configured: true,
        sharesPrimaryRoute: false,
        route: {
          profileId: "compaction",
          provider: "openai.com",
          model: "gpt-4.1-mini",
        },
      },
    },
    totals: {
      observedRuns: 3,
      degradedRuns: 1,
      failedRuns: 1,
      sameProfileRetries: 1,
      crossProfileFallbacks: 1,
      cooldownSkips: 2,
      terminalFailures: 1,
    },
    summary: {
      available: true,
      configuredFallbackCount: 1,
      lastOutcome: "success",
      headline: "Primary openai.com/gpt-4.1, 1 fallback profile(s) configured.",
    },
    reasonCounts: {
      rate_limit: 3,
      server_error: 2,
      timeout: 1,
      auth: 1,
    },
    latest: {
      source: "openai_chat",
      phase: "primary_chat",
      agentId: "default",
      conversationId: "conv-1",
      finalStatus: "success",
      finalProfileId: "backup",
      finalProvider: "moonshot.ai",
      finalModel: "kimi-k2",
      finalReason: "server_error",
      requestCount: 2,
      failedStageCount: 1,
      degraded: true,
      stepCounts: {
        cooldownSkips: 0,
        sameProfileRetries: 1,
        crossProfileFallbacks: 1,
        terminalFailures: 0,
      },
      reasonCounts: {
        server_error: 1,
        timeout: 1,
      },
      updatedAt: SAMPLE_NOW,
      headline: "Latest run recovered via fallback.",
    },
  };
}

describe("runtime-resilience-diagnostics", () => {
  test("summarizes reason counts in descending order", () => {
    expect(summarizeRuntimeResilienceReasonCounts({
      timeout: 1,
      rate_limit: 4,
      server_error: 2,
      auth: 1,
    })).toBe("rate_limit=4, server_error=2, auth=1, +1 more");
  });

  test("builds richer runtime resilience diagnostic summary", () => {
    expect(buildRuntimeResilienceDiagnosticSummary(createReport(), { now: SAMPLE_NOW + 60_000 })).toEqual({
      alertLevel: "warn",
      alertCode: "recent_degrade",
      alertMessage: "Latest runtime required retry/fallback to recover.",
      dominantReason: "server_error",
      reasonClusterSummary: "server_error + timeout",
      mixedSignalHint: "Mixed 5xx + timeout signals suggest upstream instability; verify provider health and network latency before widening retries.",
      recoveryHint: "5xx instability dominates; keep fallback ready and verify provider health before trusting the primary route.",
      latestSignal: "openai_chat/primary_chat | agent=default | conv=conv-1",
      latestRouteBehavior: "switched primary/gpt-4.1 -> backup/kimi-k2",
      latestReasonSummary: "server_error=1, timeout=1",
      overallReasonSummary: "rate_limit=3, server_error=2, auth=1, +1 more",
      totalsSummary: "observed=3, degraded=1, failed=1, retry=1, switch=1, cooldown=2",
    });
  });

  test("classifies no-signal, stale, repeated degrade and repeated failure alerts", () => {
    const noSignal = createReport();
    noSignal.totals.observedRuns = 0;
    noSignal.totals.degradedRuns = 0;
    noSignal.totals.failedRuns = 0;
    noSignal.latest = undefined;

    expect(buildRuntimeResilienceDiagnosticSummary(noSignal, { now: SAMPLE_NOW + 60_000 })).toMatchObject({
      alertLevel: "warn",
      alertCode: "no_signal",
      recoveryHint: "Run one real chat/tool request first so runtime resilience can capture a signal.",
    });

    const stale = createReport();
    stale.updatedAt = SAMPLE_NOW;
    stale.latest = {
      ...stale.latest!,
      updatedAt: SAMPLE_NOW,
      finalStatus: "success",
      degraded: false,
      stepCounts: {
        cooldownSkips: 0,
        sameProfileRetries: 0,
        crossProfileFallbacks: 0,
        terminalFailures: 0,
      },
      reasonCounts: {},
    };
    stale.totals.degradedRuns = 0;
    stale.totals.failedRuns = 0;

    expect(buildRuntimeResilienceDiagnosticSummary(stale, {
      now: SAMPLE_NOW + 8 * 60 * 60 * 1000,
    })).toMatchObject({
      alertLevel: "warn",
      alertCode: "stale",
      recoveryHint: "Exercise the runtime again before trusting this signal; current diagnostics are too old.",
    });

    const repeatedDegrade = createReport();
    repeatedDegrade.totals.observedRuns = 6;
    repeatedDegrade.totals.degradedRuns = 4;
    repeatedDegrade.totals.failedRuns = 0;
    repeatedDegrade.latest = {
      ...repeatedDegrade.latest!,
      finalStatus: "success",
      degraded: false,
      stepCounts: {
        cooldownSkips: 0,
        sameProfileRetries: 0,
        crossProfileFallbacks: 0,
        terminalFailures: 0,
      },
      reasonCounts: {},
    };

    expect(buildRuntimeResilienceDiagnosticSummary(repeatedDegrade, { now: SAMPLE_NOW + 60_000 })).toMatchObject({
      alertLevel: "warn",
      alertCode: "repeated_degrade",
      dominantReason: "rate_limit",
      reasonClusterSummary: "rate_limit + server_error",
      mixedSignalHint: "Mixed rate-limit + 5xx signals suggest provider saturation; shift traffic to fallback routes and reduce bursty retry patterns.",
      recoveryHint: "Rate limits dominate; lower concurrency or move quota-sensitive traffic to a preferred fallback/provider.",
    });

    const repeatedFailure = createReport();
    repeatedFailure.totals.observedRuns = 4;
    repeatedFailure.totals.failedRuns = 3;
    repeatedFailure.latest = {
      ...repeatedFailure.latest!,
      finalStatus: "exhausted",
      degraded: true,
    };

    expect(buildRuntimeResilienceDiagnosticSummary(repeatedFailure, { now: SAMPLE_NOW + 60_000 })).toMatchObject({
      alertLevel: "fail",
      alertCode: "repeated_failure",
      dominantReason: "server_error",
      reasonClusterSummary: "server_error + timeout",
      mixedSignalHint: "Mixed 5xx + timeout signals suggest upstream instability; verify provider health and network latency before widening retries.",
      recoveryHint: "5xx instability dominates; keep fallback ready and verify provider health before trusting the primary route.",
    });
  });
});
