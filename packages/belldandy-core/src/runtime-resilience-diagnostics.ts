import type { RuntimeResilienceDoctorReport } from "./runtime-resilience.js";

export type RuntimeResilienceAlertLevel = "pass" | "warn" | "fail";
export type RuntimeResilienceAlertCode =
  | "healthy"
  | "no_signal"
  | "stale"
  | "recent_degrade"
  | "repeated_degrade"
  | "recent_failure"
  | "repeated_failure";

export type RuntimeResilienceDiagnosticSummary = {
  alertLevel: RuntimeResilienceAlertLevel;
  alertCode: RuntimeResilienceAlertCode;
  alertMessage: string;
  dominantReason: string | null;
  reasonClusterSummary: string | null;
  mixedSignalHint: string | null;
  recoveryHint: string | null;
  latestSignal: string | null;
  latestRouteBehavior: string | null;
  latestReasonSummary: string | null;
  overallReasonSummary: string | null;
  totalsSummary: string;
};

export function summarizeRuntimeResilienceReasonCounts(
  reasonCounts: Record<string, number> | undefined,
  limit = 3,
): string | null {
  const entries = Object.entries(reasonCounts ?? {})
    .filter(([key, value]) => key.trim() && typeof value === "number" && Number.isFinite(value) && value > 0)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "en"));
  if (entries.length === 0) {
    return null;
  }
  const rendered = entries.slice(0, limit).map(([reason, count]) => `${reason}=${count}`);
  if (entries.length > limit) {
    rendered.push(`+${entries.length - limit} more`);
  }
  return rendered.join(", ");
}

export function buildRuntimeResilienceDiagnosticSummary(
  report: RuntimeResilienceDoctorReport,
  options: {
    now?: number;
    staleAfterMs?: number;
    repeatedDegradeMinRuns?: number;
    repeatedDegradeRate?: number;
    repeatedFailureMinRuns?: number;
    repeatedFailureRate?: number;
  } = {},
): RuntimeResilienceDiagnosticSummary {
  const latest = report.latest;
  const now = typeof options.now === "number" && Number.isFinite(options.now) ? options.now : Date.now();
  const staleAfterMs = options.staleAfterMs ?? 6 * 60 * 60 * 1000;
  const repeatedDegradeMinRuns = options.repeatedDegradeMinRuns ?? 3;
  const repeatedDegradeRate = options.repeatedDegradeRate ?? 0.5;
  const repeatedFailureMinRuns = options.repeatedFailureMinRuns ?? 2;
  const repeatedFailureRate = options.repeatedFailureRate ?? 0.5;
  const latestSignal = latest
    ? [
      `${latest.source}/${latest.phase}`,
      latest.agentId ? `agent=${latest.agentId}` : "",
      latest.conversationId ? `conv=${latest.conversationId}` : "",
    ].filter(Boolean).join(" | ")
    : null;
  const latestRouteBehavior = latest
    ? buildLatestRouteBehavior(report)
    : null;
  const reasonSignal = buildReasonSignalSnapshot(latest?.reasonCounts, report.reasonCounts);
  const observedRuns = Math.max(report.totals.observedRuns, 0);
  const failedRuns = Math.max(report.totals.failedRuns, 0);
  const degradedRuns = Math.max(report.totals.degradedRuns, 0);
  const failureRate = observedRuns > 0 ? failedRuns / observedRuns : 0;
  const degradeRate = observedRuns > 0 ? degradedRuns / observedRuns : 0;
  const ageMs = Math.max(0, now - report.updatedAt);
  const ageSummary = formatDurationSummary(ageMs);

  let alertLevel: RuntimeResilienceAlertLevel = "pass";
  let alertCode: RuntimeResilienceAlertCode = "healthy";
  let alertMessage = "Runtime resilience looks healthy.";
  if (!latest || observedRuns <= 0) {
    alertLevel = "warn";
    alertCode = "no_signal";
    alertMessage = "No runtime resilience signal has been observed yet.";
  } else if (ageMs >= staleAfterMs) {
    alertLevel = "warn";
    alertCode = "stale";
    alertMessage = `Latest runtime resilience signal is stale (${ageSummary} old).`;
  } else if (failedRuns >= repeatedFailureMinRuns && failureRate >= repeatedFailureRate) {
    alertLevel = "fail";
    alertCode = "repeated_failure";
    alertMessage = `Repeated runtime failures observed (${failedRuns}/${observedRuns} runs failed).`;
  } else if (latest.finalStatus !== "success") {
    alertLevel = "warn";
    alertCode = "recent_failure";
    alertMessage = `Latest runtime ended as ${latest.finalStatus}.`;
  } else if (degradedRuns >= repeatedDegradeMinRuns && degradeRate >= repeatedDegradeRate) {
    alertLevel = "warn";
    alertCode = "repeated_degrade";
    alertMessage = `Repeated runtime degrade observed (${degradedRuns}/${observedRuns} runs degraded).`;
  } else if (latest.degraded) {
    alertLevel = "warn";
    alertCode = "recent_degrade";
    alertMessage = "Latest runtime required retry/fallback to recover.";
  }

  return {
    alertLevel,
    alertCode,
    alertMessage,
    dominantReason: reasonSignal.dominantReason,
    reasonClusterSummary: reasonSignal.reasonClusterSummary,
    mixedSignalHint: buildMixedSignalHint(alertCode, reasonSignal.clusterReasons),
    recoveryHint: buildRecoveryHint(alertCode, reasonSignal.clusterReasons),
    latestSignal,
    latestRouteBehavior,
    latestReasonSummary: summarizeRuntimeResilienceReasonCounts(latest?.reasonCounts),
    overallReasonSummary: summarizeRuntimeResilienceReasonCounts(report.reasonCounts),
    totalsSummary: [
      `observed=${report.totals.observedRuns}`,
      `degraded=${report.totals.degradedRuns}`,
      `failed=${report.totals.failedRuns}`,
      `retry=${report.totals.sameProfileRetries}`,
      `switch=${report.totals.crossProfileFallbacks}`,
      `cooldown=${report.totals.cooldownSkips}`,
    ].join(", "),
  };
}

function buildReasonSignalSnapshot(
  preferredReasonCounts: Record<string, number> | undefined,
  fallbackReasonCounts: Record<string, number> | undefined,
): {
  dominantReason: string | null;
  reasonClusterSummary: string | null;
  clusterReasons: string[];
} {
  const preferred = listOrderedReasons(preferredReasonCounts);
  const fallback = listOrderedReasons(fallbackReasonCounts);
  const entries = preferred.length > 0 ? preferred : fallback;
  if (entries.length === 0) {
    return {
      dominantReason: null,
      reasonClusterSummary: null,
      clusterReasons: [],
    };
  }
  const clusterEntries = pickReasonClusterEntries(entries);
  const reasonClusterSummary = clusterEntries.length === 0
    ? null
    : clusterEntries.length === 1
      ? clusterEntries[0].reason
      : [
        `${clusterEntries[0].reason} + ${clusterEntries[1].reason}`,
        clusterEntries.length > 2 ? `+${clusterEntries.length - 2} more` : "",
      ].filter(Boolean).join(", ");
  return {
    dominantReason: clusterEntries[0]?.reason ?? entries[0]?.reason ?? null,
    reasonClusterSummary,
    clusterReasons: clusterEntries.map((entry) => entry.reason),
  };
}

function listOrderedReasons(
  reasonCounts: Record<string, number> | undefined,
): Array<{ reason: string; count: number }> {
  return Object.entries(reasonCounts ?? {})
    .filter(([key, value]) => key.trim() && typeof value === "number" && Number.isFinite(value) && value > 0)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "en"))
    .map(([reason, count]) => ({ reason, count }));
}

function pickReasonClusterEntries(
  entries: Array<{ reason: string; count: number }>,
): Array<{ reason: string; count: number }> {
  if (entries.length <= 1) {
    return entries.slice(0, 1);
  }
  const primary = entries[0];
  const cluster = [primary];
  for (const entry of entries.slice(1, 3)) {
    if (entry.count >= Math.max(1, Math.ceil(primary.count * 0.5))) {
      cluster.push(entry);
    }
  }
  return cluster;
}

function buildRecoveryHint(
  alertCode: RuntimeResilienceAlertCode,
  clusterReasons: string[],
): string | null {
  if (alertCode === "healthy") {
    return null;
  }
  if (alertCode === "no_signal") {
    return "Run one real chat/tool request first so runtime resilience can capture a signal.";
  }
  if (alertCode === "stale") {
    return "Exercise the runtime again before trusting this signal; current diagnostics are too old.";
  }
  const dominantReason = clusterReasons[0] ?? null;
  switch (dominantReason) {
    case "rate_limit":
      return "Rate limits dominate; lower concurrency or move quota-sensitive traffic to a preferred fallback/provider.";
    case "timeout":
      return "Timeouts dominate; check baseUrl/proxy latency and raise requestTimeoutMs for the affected profiles if needed.";
    case "server_error":
      return "5xx instability dominates; keep fallback ready and verify provider health before trusting the primary route.";
    case "auth":
      return "Auth failures dominate; verify API keys, token scopes, and profile selection for primary/fallback routes.";
    case "billing":
      return "Billing/quota failures dominate; verify provider balance or quota before retrying this route.";
    case "format":
      return "Request format mismatches dominate; verify protocol, wireApi, and model pairing instead of retrying.";
    case "unknown":
      return "Unclassified failures dominate; inspect the latest provider error payload before widening retries.";
    default:
      return alertCode === "recent_failure" || alertCode === "repeated_failure"
        ? "Recent runtime failures need manual inspection; review the latest provider response before retrying."
        : "Repeated degrade suggests this route is unstable; review provider health and fallback ordering.";
  }
}

function buildMixedSignalHint(
  alertCode: RuntimeResilienceAlertCode,
  clusterReasons: string[],
): string | null {
  if (alertCode === "healthy" || clusterReasons.length < 2) {
    return null;
  }
  const key = [...clusterReasons.slice(0, 2)].sort((left, right) => left.localeCompare(right, "en")).join("+");
  switch (key) {
    case "rate_limit+timeout":
      return "Mixed rate-limit + timeout signals suggest both quota pressure and latency; reduce burstiness and check network/proxy latency together.";
    case "rate_limit+server_error":
      return "Mixed rate-limit + 5xx signals suggest provider saturation; shift traffic to fallback routes and reduce bursty retry patterns.";
    case "server_error+timeout":
      return "Mixed 5xx + timeout signals suggest upstream instability; verify provider health and network latency before widening retries.";
    case "auth+billing":
      return "Mixed auth + billing signals suggest the route may be both under-scoped and out of quota; verify keys, scopes, and provider balance together.";
    default:
      return `Mixed signals (${clusterReasons.slice(0, 2).join(" + ")}) detected; inspect the latest provider errors before tuning retry/fallback policy.`;
  }
}

function buildLatestRouteBehavior(report: RuntimeResilienceDoctorReport): string | null {
  const latest = report.latest;
  if (!latest) {
    return null;
  }
  const primaryRoute = formatRoute(report.routing.primary.profileId, report.routing.primary.model);
  const finalRoute = latest.finalProfileId
    ? formatRoute(latest.finalProfileId, latest.finalModel)
    : null;
  if (latest.degraded && finalRoute && latest.finalProfileId !== report.routing.primary.profileId) {
    return `switched ${primaryRoute} -> ${finalRoute}`;
  }
  if (latest.degraded && finalRoute) {
    return `stayed on ${finalRoute} after retry`;
  }
  if (latest.finalStatus !== "success" && finalRoute) {
    return `stopped on ${finalRoute}`;
  }
  if (latest.finalStatus !== "success") {
    return `ended without a usable route after ${primaryRoute}`;
  }
  if (finalRoute) {
    return `stayed on ${finalRoute}`;
  }
  return `primary route ${primaryRoute}`;
}

function formatRoute(profileId: string | undefined, model: string | undefined): string {
  return `${profileId?.trim() || "-"}/${model?.trim() || "-"}`;
}

function formatDurationSummary(durationMs: number): string {
  if (!Number.isFinite(durationMs) || durationMs <= 0) {
    return "0m";
  }
  const minutes = Math.floor(durationMs / 60_000);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}
