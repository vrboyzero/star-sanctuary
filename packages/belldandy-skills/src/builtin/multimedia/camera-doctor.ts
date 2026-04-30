import { DEFAULT_POLICY } from "../../executor.js";
import type {
  CameraPermissionState,
  CameraProviderCapabilities,
  CameraProviderContext,
  CameraProviderDiagnostic,
  CameraProviderHealthCheck,
  CameraProviderDiagnosticIssue,
  CameraProviderId,
  CameraProviderSelectionTrace,
  CameraProviderRuntimeHealth,
  CameraProviderStatus,
} from "./camera-contract.js";
import { browserLoopbackCameraProvider } from "./camera-browser-loopback-provider.js";
import { observeCameraDeviceAliasMemory } from "./camera-device-alias-state.js";
import { buildCameraProviderHealthCheck, buildCameraRecoveryActions } from "./camera-governance.js";
import type { CameraNativeDesktopHelperConfig } from "./camera-native-desktop-contract.js";
import { NativeDesktopCameraProvider } from "./camera-native-desktop-provider.js";
import { CameraProviderRegistry, getDefaultCameraProviderRegistry } from "./camera-provider-registry.js";
import {
  BELLDANDY_CAMERA_NATIVE_HELPER_COMMAND_ENV,
  BELLDANDY_CAMERA_NATIVE_HELPER_IDLE_SHUTDOWN_MS_ENV,
  readNativeDesktopHelperConfigFromEnv,
} from "./camera-native-desktop-stdio-client.js";
import {
  isLikelyNodeCommand,
  resolveNativeDesktopHelperLaunch,
} from "./camera-native-desktop-launch.js";
import {
  DEFAULT_CAMERA_RUNTIME_HEALTH_RETENTION_POLICY,
  inspectCameraRuntimeHealthSnapshot,
  type CameraRuntimeHealthSnapshot,
  type CameraRuntimeHealthRetentionPolicy,
  type CameraRuntimeHealthSnapshotIssue,
} from "./camera-runtime-health-state.js";
import {
  BELLDANDY_CAMERA_NATIVE_HELPER_FFMPEG_COMMAND_ENV,
  BELLDANDY_CAMERA_NATIVE_HELPER_POWERSHELL_COMMAND_ENV,
} from "./camera-native-desktop-helper-runtime.js";

type CameraRuntimeDoctorProviderStatus =
  | CameraProviderStatus
  | "not_checked"
  | "not_configured";

export type CameraRuntimeDoctorRuntimeHealthFreshness = {
  source: "memory" | "snapshot" | "memory+snapshot" | "none";
  level: "fresh" | "aging" | "stale" | "unavailable";
  stale: boolean;
  staleAfterMs: number;
  retention: CameraRuntimeHealthRetentionPolicy;
  evaluatedAt: string;
  ageMs?: number;
  referenceAt?: string;
  snapshotSavedAt?: string;
  snapshotPath?: string;
  snapshotIssue?: CameraRuntimeHealthSnapshotIssue;
};

export type CameraRuntimeDoctorLaunchConfig = {
  transport: string;
  command: string;
  helperEntry?: string;
  resolvedCommand?: string;
  resolvedHelperEntry?: string;
  cwd?: string;
  runtimeDir?: string;
  startupTimeoutMs?: number;
  requestTimeoutMs?: number;
  idleShutdownMs?: number;
  powershellCommand?: string;
  ffmpegCommand?: string;
};

export type CameraRuntimeDoctorDeviceCounts = {
  total: number;
  available: number;
  unavailable: number;
  busy: number;
  external: number;
  integrated: number;
  virtual: number;
  captureCard: number;
};

export type CameraRuntimeDoctorProvider = {
  id: CameraProviderId;
  registered: boolean;
  configured: boolean;
  defaultSelected: boolean;
  diagnoseSupported: boolean;
  status: CameraRuntimeDoctorProviderStatus;
  permissionState?: CameraPermissionState;
  helperStatus?: string;
  issueCounts: {
    info: number;
    warning: number;
    error: number;
  };
  healthCheck?: CameraProviderHealthCheck;
  issues: CameraProviderDiagnosticIssue[];
  recoveryHints: string[];
  headline: string;
  fix?: string;
  capabilities?: CameraProviderCapabilities;
  deviceCounts?: CameraRuntimeDoctorDeviceCounts;
  sampleDevices?: string[];
  launchConfig?: CameraRuntimeDoctorLaunchConfig;
  runtimeHealth?: CameraProviderRuntimeHealth;
  runtimeHealthFreshness?: CameraRuntimeDoctorRuntimeHealthFreshness;
  metadata?: Record<string, unknown>;
};

export type CameraRuntimeDoctorGovernanceSummary = {
  headline: string;
  blockedProviderCount: number;
  permissionBlockedProviderCount: number;
  permissionPromptProviderCount: number;
  fallbackActiveProviderCount: number;
  recentFailureCount: number;
  recentRecoveredCount: number;
  failureProviderCount: number;
  repeatedFallback: boolean;
  dominantFailureCode?: string;
  whyUnhealthy?: string;
  whyFallback?: string;
  recommendedAction?: string;
};

export type CameraRuntimeDoctorReport = {
  observedAt: string;
  summary: {
    available: boolean;
    defaultProviderId?: CameraProviderId;
    defaultSelection?: CameraProviderSelectionTrace;
    registeredProviderIds: CameraProviderId[];
    warningCount: number;
    errorCount: number;
    headline: string;
    governance?: CameraRuntimeDoctorGovernanceSummary;
    fix?: string;
  };
  providers: CameraRuntimeDoctorProvider[];
};

export type BuildCameraRuntimeDoctorReportOptions = {
  env?: NodeJS.ProcessEnv;
  includeBrowserLoopbackOnly?: boolean;
  context?: Partial<CameraProviderContext>;
  runtimeHealthRegistry?: CameraProviderRegistry;
  runtimeHealthStaleAfterMs?: number;
  now?: string | number | Date;
};

type CountSummary = {
  info: number;
  warning: number;
  error: number;
};

type ResolvedRuntimeHealth = {
  runtimeHealth?: CameraProviderRuntimeHealth;
  runtimeHealthFreshness?: CameraRuntimeDoctorRuntimeHealthFreshness;
};

const DEFAULT_RUNTIME_HEALTH_STALE_AFTER_MS = 30 * 60 * 1_000;
const GOVERNANCE_BLOCKING_REASON_CODES = new Set([
  "device_busy",
  "permission_denied",
  "helper_not_configured",
  "helper_unavailable",
  "protocol_mismatch",
  "device_not_found",
  "driver_error",
  "capture_failed",
]);
const GOVERNANCE_NON_FAILURE_REASON_CODES = new Set([
  "fallback_active",
  "not_checked",
]);

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeDate(value: string | number | Date | undefined): Date {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? new Date() : value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const normalized = new Date(value);
    return Number.isNaN(normalized.getTime()) ? new Date() : normalized;
  }
  return new Date();
}

function incrementDoctorReasonCount(record: Record<string, number>, code: string | undefined, count = 1): void {
  const normalizedCode = normalizeString(code);
  if (!normalizedCode || !Number.isFinite(count) || count <= 0) {
    return;
  }
  record[normalizedCode] = (record[normalizedCode] ?? 0) + count;
}

function resolveDoctorDominantFailureCode(record: Record<string, number>): string | undefined {
  const entries = Object.entries(record)
    .filter(([code, count]) => !GOVERNANCE_NON_FAILURE_REASON_CODES.has(code) && Number.isFinite(count) && count > 0)
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }
      return left[0].localeCompare(right[0]);
    });
  return entries[0]?.[0];
}

function isGovernanceBlockedProvider(provider: CameraRuntimeDoctorProvider): boolean {
  const healthCheck = provider.healthCheck;
  if (!healthCheck) {
    return false;
  }
  if (healthCheck.permission.gating === "blocked") {
    return true;
  }
  if (healthCheck.primaryReasonCode && GOVERNANCE_BLOCKING_REASON_CODES.has(healthCheck.primaryReasonCode)) {
    return true;
  }
  return healthCheck.status === "fail";
}

function buildGovernanceWhyFallback(
  defaultSelection: CameraProviderSelectionTrace | undefined,
): string | undefined {
  if (!defaultSelection?.fallbackApplied) {
    return undefined;
  }
  const skippedAttempts = defaultSelection.attempts.filter((attempt) => attempt.outcome === "skipped");
  if (!skippedAttempts.length) {
    return `默认 provider 已回退到 ${defaultSelection.selectedProvider}。`;
  }
  const firstAttempt = skippedAttempts[0];
  return `默认 provider 已从 ${skippedAttempts.map((attempt) => attempt.provider).join(", ")} 回退到 ${defaultSelection.selectedProvider}；首个跳过原因=${firstAttempt.reason}${firstAttempt.detail ? ` (${firstAttempt.detail})` : ""}。`;
}

function buildGovernanceSummary(
  providers: readonly CameraRuntimeDoctorProvider[],
  defaultSelection: CameraProviderSelectionTrace | undefined,
): CameraRuntimeDoctorGovernanceSummary | undefined {
  if (!providers.length) {
    return undefined;
  }

  const blockedProviders = providers.filter((provider) => isGovernanceBlockedProvider(provider));
  const permissionBlockedProviderCount = providers.filter((provider) => provider.healthCheck?.permission.gating === "blocked").length;
  const permissionPromptProviderCount = providers.filter((provider) => provider.healthCheck?.permission.gating === "needs_prompt").length;
  const fallbackActiveProviderCount = providers.filter((provider) => provider.healthCheck?.fallbackApplied).length;
  const aggregatedReasonCounts: Record<string, number> = {};
  let recentFailureCount = 0;
  let recentRecoveredCount = 0;
  let failureProviderCount = 0;

  for (const provider of providers) {
    const failureStats = provider.healthCheck?.failureStats;
    if (failureStats) {
      for (const [code, count] of Object.entries(failureStats.reasonCodeCounts)) {
        incrementDoctorReasonCount(aggregatedReasonCounts, code, count);
      }
    }
    const runtimeWindow = failureStats?.runtimeWindow;
    if (runtimeWindow) {
      recentFailureCount += runtimeWindow.failureCount;
      recentRecoveredCount += runtimeWindow.recoveredSuccessCount;
      if (runtimeWindow.failureCount > 0) {
        failureProviderCount += 1;
      }
    }
  }

  const dominantFailureCode = resolveDoctorDominantFailureCode(aggregatedReasonCounts);
  const repeatedFallback = fallbackActiveProviderCount > 0 && recentFailureCount > 1;
  const prioritizedProviders = [...providers].sort((left, right) => {
    const leftBlocked = isGovernanceBlockedProvider(left) ? 1 : 0;
    const rightBlocked = isGovernanceBlockedProvider(right) ? 1 : 0;
    if (leftBlocked !== rightBlocked) {
      return rightBlocked - leftBlocked;
    }
    const leftActionable = left.healthCheck?.actionable ? 1 : 0;
    const rightActionable = right.healthCheck?.actionable ? 1 : 0;
    if (leftActionable !== rightActionable) {
      return rightActionable - leftActionable;
    }
    const leftDefault = left.defaultSelected ? 1 : 0;
    const rightDefault = right.defaultSelected ? 1 : 0;
    if (leftDefault !== rightDefault) {
      return rightDefault - leftDefault;
    }
    return left.id.localeCompare(right.id);
  });
  const primaryProvider = prioritizedProviders[0];
  const recommendedAction = primaryProvider?.healthCheck?.recoveryActions[0]?.label ?? primaryProvider?.fix;
  const whyUnhealthy = blockedProviders.length > 0
    ? `${blockedProviders[0].id} 当前需要优先处理；依据=${blockedProviders[0].healthCheck?.sources.join(" + ") || "-"}；主因=${blockedProviders[0].healthCheck?.primaryReasonCode ?? "-"}` + "。"
    : undefined;
  const whyFallback = buildGovernanceWhyFallback(defaultSelection);

  let headline: string;
  if (blockedProviders.length > 0) {
    headline = `${blockedProviders.length} 个 provider 需要优先处理；主失败码=${dominantFailureCode ?? "-"}。`;
  } else if (fallbackActiveProviderCount > 0) {
    headline = `当前存在 fallback provider；近期失败=${recentFailureCount}，恢复=${recentRecoveredCount}。`;
  } else if (permissionPromptProviderCount > 0) {
    headline = `${permissionPromptProviderCount} 个 provider 正等待摄像头授权。`;
  } else {
    headline = "当前没有需要立即处理的 camera governance 告警。";
  }

  return {
    headline,
    blockedProviderCount: blockedProviders.length,
    permissionBlockedProviderCount,
    permissionPromptProviderCount,
    fallbackActiveProviderCount,
    recentFailureCount,
    recentRecoveredCount,
    failureProviderCount,
    repeatedFallback,
    ...(dominantFailureCode ? { dominantFailureCode } : {}),
    ...(whyUnhealthy ? { whyUnhealthy } : {}),
    ...(whyFallback ? { whyFallback } : {}),
    ...(recommendedAction ? { recommendedAction } : {}),
  };
}

function summarizeIssueCounts(issues: readonly CameraProviderDiagnosticIssue[]): CountSummary {
  const counts: CountSummary = {
    info: 0,
    warning: 0,
    error: 0,
  };
  for (const issue of issues) {
    if (issue.severity === "info") {
      counts.info += 1;
      continue;
    }
    if (issue.severity === "warning") {
      counts.warning += 1;
      continue;
    }
    counts.error += 1;
  }
  return counts;
}

function summarizeDevices(
  diagnostic: Pick<CameraProviderDiagnostic, "devices">,
): {
  counts: CameraRuntimeDoctorDeviceCounts;
  samples: string[];
} | undefined {
  if (!diagnostic.devices?.length) {
    return undefined;
  }
  const counts: CameraRuntimeDoctorDeviceCounts = {
    total: diagnostic.devices.length,
    available: 0,
    unavailable: 0,
    busy: 0,
    external: 0,
    integrated: 0,
    virtual: 0,
    captureCard: 0,
  };
  const samples: string[] = [];
  for (const device of diagnostic.devices) {
    if (device.available) {
      counts.available += 1;
    } else {
      counts.unavailable += 1;
    }
    if (device.metadata?.busy === true) {
      counts.busy += 1;
    }
    switch (device.source) {
      case "external":
        counts.external += 1;
        break;
      case "integrated":
        counts.integrated += 1;
        break;
      case "virtual":
        counts.virtual += 1;
        break;
      case "capture_card":
        counts.captureCard += 1;
        break;
      default:
        break;
    }
    if (samples.length >= 4) {
      continue;
    }
    const tags = [
      device.available ? "available" : "unavailable",
      device.external ? "external" : device.source,
      device.metadata?.busy === true ? "busy" : "",
      device.favorite === true ? "favorite" : "",
      device.stableKey ? `stable=${device.stableKey}` : "",
    ].filter(Boolean);
    const displayLabel = device.alias && device.alias !== device.label
      ? `${device.alias} => ${device.label}`
      : device.label;
    samples.push(`${displayLabel} [${tags.join(", ")}]`);
  }
  return {
    counts,
    samples,
  };
}

function parseErrorCode(message: string): {
  code?: string;
  detail: string;
} {
  const separatorIndex = message.indexOf(":");
  if (separatorIndex <= 0) {
    return { detail: message };
  }
  const code = message.slice(0, separatorIndex).trim();
  if (!/^[a-z_]+$/u.test(code)) {
    return { detail: message };
  }
  return {
    code,
    detail: message.slice(separatorIndex + 1).trim(),
  };
}

function buildFailureIssue(error: unknown): CameraProviderDiagnosticIssue {
  const message = error instanceof Error ? error.message : String(error);
  const parsed = parseErrorCode(message);
  return {
    code: parsed.code ?? "helper_unavailable",
    severity: "error",
    message: parsed.detail,
  };
}

function buildRecoveryHints(
  providerId: CameraProviderId,
  issues: readonly CameraProviderDiagnosticIssue[],
  options: {
    launchConfig?: CameraRuntimeDoctorLaunchConfig;
    permissionState?: CameraPermissionState;
    runtimeHealth?: CameraProviderRuntimeHealth;
    selection?: CameraProviderSelectionTrace;
    source?: "diagnostic" | "selection" | "not_checked";
  } = {},
): string[] {
  const reasonCodes = [
    ...issues.map((issue) => issue.code),
    ...(options.runtimeHealth?.lastFailure?.code ? [options.runtimeHealth.lastFailure.code] : []),
  ];
  const actionLabels = buildCameraRecoveryActions({
    reasonCodes,
    selection: options.selection,
    permissionState: options.permissionState,
  }).map((action) => action.label);

  if (providerId === "native_desktop" && actionLabels.length === 0 && options.launchConfig) {
    actionLabels.push(
      `当前 helper 由 ${options.launchConfig.command} 拉起；若改过部署方式，请同时核对 cwd、helper entry、runtimeDir 和 ${BELLDANDY_CAMERA_NATIVE_HELPER_IDLE_SHUTDOWN_MS_ENV}。`,
    );
  }
  return actionLabels;
}

async function buildLaunchConfigSummary(
  config: CameraNativeDesktopHelperConfig | null,
  env: NodeJS.ProcessEnv,
): Promise<CameraRuntimeDoctorLaunchConfig | undefined> {
  if (!config) {
    return undefined;
  }
  const resolvedLaunch = await resolveNativeDesktopHelperLaunch(config, { env });
  const helperEntry = isLikelyNodeCommand(config.command)
    ? resolvedLaunch.helperEntry?.value
    : undefined;
  return {
    transport: config.transport,
    command: config.command,
    ...(helperEntry ? { helperEntry } : {}),
    ...(resolvedLaunch.resolvedCommandPath
      && resolvedLaunch.resolvedCommandPath.resolvedPath !== config.command
      ? { resolvedCommand: resolvedLaunch.resolvedCommandPath.resolvedPath }
      : {}),
    ...(resolvedLaunch.helperEntry
      && resolvedLaunch.helperEntry.resolvedPath !== resolvedLaunch.helperEntry.value
      ? { resolvedHelperEntry: resolvedLaunch.helperEntry.resolvedPath }
      : {}),
    ...(config.cwd ? { cwd: config.cwd } : {}),
    ...(resolvedLaunch.runtimeDir ? { runtimeDir: resolvedLaunch.runtimeDir } : {}),
    ...(config.startupTimeoutMs !== undefined ? { startupTimeoutMs: config.startupTimeoutMs } : {}),
    ...(config.requestTimeoutMs !== undefined ? { requestTimeoutMs: config.requestTimeoutMs } : {}),
    ...(config.idleShutdownMs !== undefined ? { idleShutdownMs: config.idleShutdownMs } : {}),
    powershellCommand: normalizeString(env[BELLDANDY_CAMERA_NATIVE_HELPER_POWERSHELL_COMMAND_ENV]) || "powershell.exe",
    ffmpegCommand: normalizeString(env[BELLDANDY_CAMERA_NATIVE_HELPER_FFMPEG_COMMAND_ENV]) || "ffmpeg",
  };
}

function buildProviderHeadline(input: {
  providerId: CameraProviderId;
  status: CameraRuntimeDoctorProviderStatus;
  issueCounts: CountSummary;
  deviceCounts?: CameraRuntimeDoctorDeviceCounts;
  helperStatus?: string;
  configured: boolean;
}): string {
  if (!input.configured && input.providerId === "native_desktop") {
    return "native_desktop helper 未配置，当前 doctor 不会启用本机摄像头链路。";
  }
  if (input.providerId === "browser_loopback" && input.status === "not_checked") {
    return "browser_loopback 已注册；doctor 当前不主动拉起浏览器，会在真实浏览器会话中补充运行时状态。";
  }
  const issueSummary = input.issueCounts.error > 0 || input.issueCounts.warning > 0
    ? `issues error=${input.issueCounts.error}, warning=${input.issueCounts.warning}`
    : "no issues";
  const helperStatus = input.helperStatus ? `helper=${input.helperStatus}` : "";
  const deviceSummary = input.deviceCounts
    ? `devices ${input.deviceCounts.available}/${input.deviceCounts.total} available`
      + (input.deviceCounts.busy > 0 ? `, busy=${input.deviceCounts.busy}` : "")
    : "";
  return [input.providerId, `status=${input.status}`, helperStatus, deviceSummary, issueSummary]
    .filter(Boolean)
    .join("; ");
}

function createBrowserLoopbackDoctorProvider(
  defaultProviderId: CameraProviderId | undefined,
  defaultSelection: CameraProviderSelectionTrace | undefined,
): CameraRuntimeDoctorProvider {
  const issueCounts = summarizeIssueCounts([]);
  const selection = defaultSelection?.selectedProvider === "browser_loopback"
    ? defaultSelection
    : undefined;
  const healthCheck = buildCameraProviderHealthCheck({
    providerId: "browser_loopback",
    source: selection ? "selection" : "not_checked",
    checkedAt: new Date().toISOString(),
    selection,
  });
  return {
    id: "browser_loopback",
    registered: true,
    configured: true,
    defaultSelected: defaultProviderId === "browser_loopback",
    diagnoseSupported: false,
    status: "not_checked",
    issueCounts,
    healthCheck,
    issues: [],
    recoveryHints: healthCheck.recoveryActions.map((action) => action.label),
    headline: buildProviderHeadline({
      providerId: "browser_loopback",
      status: "not_checked",
      issueCounts,
      configured: true,
    }),
  };
}

function readRuntimeHealthFromRegistry(
  registry: CameraProviderRegistry | undefined,
  providerId: CameraProviderId,
): CameraProviderRuntimeHealth | undefined {
  const provider = registry?.get(providerId);
  if (!provider || typeof provider.getRuntimeHealth !== "function") {
    return undefined;
  }
  return provider.getRuntimeHealth();
}

async function readPersistedRuntimeHealth(
  stateDir: string | undefined,
  providerId: CameraProviderId,
): Promise<{
  snapshot?: CameraRuntimeHealthSnapshot;
  snapshotPath?: string;
  retention: CameraRuntimeHealthRetentionPolicy;
  issue?: CameraRuntimeHealthSnapshotIssue;
}> {
  const normalizedStateDir = normalizeString(stateDir);
  if (!normalizedStateDir) {
    return {
      retention: DEFAULT_CAMERA_RUNTIME_HEALTH_RETENTION_POLICY,
    };
  }
  const inspected = await inspectCameraRuntimeHealthSnapshot(normalizedStateDir, providerId);
  return {
    retention: inspected?.retention ?? DEFAULT_CAMERA_RUNTIME_HEALTH_RETENTION_POLICY,
    snapshotPath: inspected?.snapshotPath,
    ...(inspected?.snapshot ? { snapshot: inspected.snapshot } : {}),
    ...(inspected?.issue ? { issue: inspected.issue } : {}),
  };
}

function resolveRuntimeHealthFreshnessLevel(
  ageMs: number | undefined,
  staleAfterMs: number,
): CameraRuntimeDoctorRuntimeHealthFreshness["level"] {
  if (typeof ageMs !== "number") {
    return "fresh";
  }
  if (ageMs > staleAfterMs) {
    return "stale";
  }
  if (ageMs > Math.floor(staleAfterMs / 2)) {
    return "aging";
  }
  return "fresh";
}

function resolveRuntimeHealth(input: {
  runtimeHealth?: CameraProviderRuntimeHealth;
  snapshot?: CameraRuntimeHealthSnapshot;
  snapshotPath?: string;
  snapshotIssue?: CameraRuntimeHealthSnapshotIssue;
  retention: CameraRuntimeHealthRetentionPolicy;
  now: Date;
  staleAfterMs: number;
}): ResolvedRuntimeHealth {
  const runtimeHealth = input.runtimeHealth ?? input.snapshot?.runtimeHealth;
  if (!runtimeHealth && !input.snapshotIssue) {
    return {};
  }
  const referenceAt = normalizeString(input.snapshot?.savedAt) || normalizeString(runtimeHealth?.observedAt);
  const referenceDate = referenceAt ? new Date(referenceAt) : undefined;
  const ageMs = referenceDate && !Number.isNaN(referenceDate.getTime())
    ? Math.max(0, input.now.getTime() - referenceDate.getTime())
    : undefined;
  const level = runtimeHealth
    ? resolveRuntimeHealthFreshnessLevel(ageMs, input.staleAfterMs)
    : "unavailable";
  return {
    runtimeHealth,
    runtimeHealthFreshness: {
      source: runtimeHealth
        ? (input.runtimeHealth
          ? (input.snapshot ? "memory+snapshot" : "memory")
          : "snapshot")
        : "none",
      level,
      stale: level === "stale" || level === "unavailable",
      staleAfterMs: input.staleAfterMs,
      retention: input.retention,
      evaluatedAt: input.now.toISOString(),
      ...(typeof ageMs === "number" ? { ageMs } : {}),
      ...(referenceAt ? { referenceAt } : {}),
      ...(input.snapshot?.savedAt ? { snapshotSavedAt: input.snapshot.savedAt } : {}),
      ...(input.snapshotPath ? { snapshotPath: input.snapshotPath } : {}),
      ...(input.snapshotIssue ? { snapshotIssue: input.snapshotIssue } : {}),
    },
  };
}

function createNativeDesktopConfigErrorProvider(
  error: unknown,
  defaultProviderId: CameraProviderId | undefined,
  runtimeHealth?: CameraProviderRuntimeHealth,
  runtimeHealthFreshness?: CameraRuntimeDoctorRuntimeHealthFreshness,
): CameraRuntimeDoctorProvider {
  const issue = buildFailureIssue(error);
  const issues = [issue];
  const issueCounts = summarizeIssueCounts(issues);
  const healthCheck = buildCameraProviderHealthCheck({
    providerId: "native_desktop",
    source: "diagnostic",
    checkedAt: runtimeHealth?.observedAt,
    providerStatus: "unavailable",
    issues,
    runtimeHealth,
  });
  const recoveryHints = healthCheck.recoveryActions.map((action) => action.label);
  return {
    id: "native_desktop",
    registered: false,
    configured: true,
    defaultSelected: defaultProviderId === "native_desktop",
    diagnoseSupported: false,
    status: "unavailable",
    issueCounts,
    issues,
    healthCheck,
    recoveryHints,
    ...(runtimeHealth ? { runtimeHealth } : {}),
    ...(runtimeHealthFreshness ? { runtimeHealthFreshness } : {}),
    fix: recoveryHints[0],
    headline: `native_desktop helper 配置无效: ${issue.message}`,
  };
}

function mapDiagnosticToDoctorProvider(
  providerId: CameraProviderId,
  diagnostic: CameraProviderDiagnostic,
  options: {
    defaultProviderId?: CameraProviderId;
    configured: boolean;
    launchConfig?: CameraRuntimeDoctorLaunchConfig;
    runtimeHealth?: CameraProviderRuntimeHealth;
    runtimeHealthFreshness?: CameraRuntimeDoctorRuntimeHealthFreshness;
  },
): CameraRuntimeDoctorProvider {
  const issues = diagnostic.issues ?? [];
  const issueCounts = summarizeIssueCounts(issues);
  const deviceSummary = summarizeDevices(diagnostic);
  const helperStatus = normalizeString(diagnostic.metadata?.helperStatus);
  const runtimeHealth = options.runtimeHealth ?? diagnostic.runtimeHealth;
  const healthCheck = buildCameraProviderHealthCheck({
    providerId,
    source: "diagnostic",
    checkedAt: diagnostic.observedAt,
    providerStatus: diagnostic.status,
    permissionState: diagnostic.permissionState,
    issues,
    runtimeHealth,
  });
  const recoveryHints = buildRecoveryHints(providerId, issues, {
    launchConfig: options.launchConfig,
    permissionState: diagnostic.permissionState,
    runtimeHealth,
  });
  return {
    id: providerId,
    registered: true,
    configured: options.configured,
    defaultSelected: options.defaultProviderId === providerId,
    diagnoseSupported: true,
    status: diagnostic.status,
    permissionState: diagnostic.permissionState,
    ...(helperStatus ? { helperStatus } : {}),
    issueCounts,
    healthCheck,
    issues,
    recoveryHints,
    ...(recoveryHints[0] ? { fix: recoveryHints[0] } : {}),
    headline: buildProviderHeadline({
      providerId,
      status: diagnostic.status,
      issueCounts,
      deviceCounts: deviceSummary?.counts,
      helperStatus,
      configured: options.configured,
    }),
    capabilities: diagnostic.capabilities,
    ...(deviceSummary ? { deviceCounts: deviceSummary.counts, sampleDevices: deviceSummary.samples } : {}),
    ...(options.launchConfig ? { launchConfig: options.launchConfig } : {}),
    ...(runtimeHealth ? { runtimeHealth } : {}),
    ...(options.runtimeHealthFreshness ? { runtimeHealthFreshness: options.runtimeHealthFreshness } : {}),
    ...(diagnostic.metadata ? { metadata: diagnostic.metadata } : {}),
  };
}

function mapFailureToDoctorProvider(
  providerId: CameraProviderId,
  error: unknown,
  options: {
    defaultProviderId?: CameraProviderId;
    configured: boolean;
    launchConfig?: CameraRuntimeDoctorLaunchConfig;
    runtimeHealth?: CameraProviderRuntimeHealth;
    runtimeHealthFreshness?: CameraRuntimeDoctorRuntimeHealthFreshness;
  },
): CameraRuntimeDoctorProvider {
  const issues = [buildFailureIssue(error)];
  const issueCounts = summarizeIssueCounts(issues);
  const healthCheck = buildCameraProviderHealthCheck({
    providerId,
    source: "diagnostic",
    checkedAt: options.runtimeHealth?.observedAt,
    providerStatus: "unavailable",
    issues,
    runtimeHealth: options.runtimeHealth,
  });
  const recoveryHints = buildRecoveryHints(providerId, issues, {
    launchConfig: options.launchConfig,
    runtimeHealth: options.runtimeHealth,
  });
  return {
    id: providerId,
    registered: true,
    configured: options.configured,
    defaultSelected: options.defaultProviderId === providerId,
    diagnoseSupported: true,
    status: "unavailable",
    permissionState: "unknown",
    issueCounts,
    healthCheck,
    issues,
    recoveryHints,
    ...(recoveryHints[0] ? { fix: recoveryHints[0] } : {}),
    headline: `${providerId} doctor 诊断失败: ${issues[0].message}`,
    ...(options.launchConfig ? { launchConfig: options.launchConfig } : {}),
    ...(options.runtimeHealth ? { runtimeHealth: options.runtimeHealth } : {}),
    ...(options.runtimeHealthFreshness ? { runtimeHealthFreshness: options.runtimeHealthFreshness } : {}),
  };
}

function buildReportSummary(
  providers: readonly CameraRuntimeDoctorProvider[],
  defaultSelection: CameraProviderSelectionTrace | undefined,
): CameraRuntimeDoctorReport["summary"] {
  const registeredProviderIds = providers.filter((item) => item.registered).map((item) => item.id);
  const warningCount = providers.reduce((total, item) => total + item.issueCounts.warning, 0);
  const errorCount = providers.reduce((total, item) => total + item.issueCounts.error, 0);
  const nativeDesktop = providers.find((item) => item.id === "native_desktop");
  const defaultProviderId = defaultSelection?.selectedProvider;
  const headline = nativeDesktop?.headline
    ?? `${registeredProviderIds.length} camera provider(s) registered; default=${defaultProviderId ?? "-"}.`;
  const governance = buildGovernanceSummary(providers, defaultSelection);
  const fix = providers.find((item) => item.fix)?.fix;
  return {
    available: registeredProviderIds.length > 0,
    ...(defaultProviderId ? { defaultProviderId } : {}),
    ...(defaultSelection ? { defaultSelection } : {}),
    registeredProviderIds,
    warningCount,
    errorCount,
    headline,
    ...(governance ? { governance } : {}),
    ...(fix ? { fix } : {}),
  };
}

function buildProviderContext(
  context: Partial<CameraProviderContext> | undefined,
): CameraProviderContext {
  return {
    conversationId: context?.conversationId ?? "doctor-camera-runtime",
    workspaceRoot: context?.workspaceRoot ?? process.cwd(),
    stateDir: context?.stateDir,
    logger: context?.logger,
    policy: context?.policy ?? DEFAULT_POLICY,
    abortSignal: context?.abortSignal,
  };
}

export async function buildCameraRuntimeDoctorReport(
  options: BuildCameraRuntimeDoctorReportOptions = {},
): Promise<CameraRuntimeDoctorReport | null> {
  const env = options.env ?? process.env;
  const now = normalizeDate(options.now);
  const observedAt = now.toISOString();
  const runtimeHealthStaleAfterMs = Number.isFinite(options.runtimeHealthStaleAfterMs)
    && Number(options.runtimeHealthStaleAfterMs) > 0
    ? Number(options.runtimeHealthStaleAfterMs)
    : DEFAULT_RUNTIME_HEALTH_STALE_AFTER_MS;
  const registry = new CameraProviderRegistry();
  registry.register(browserLoopbackCameraProvider, { makeDefault: true });

  let nativeDesktopConfig: CameraNativeDesktopHelperConfig | null = null;
  let nativeDesktopConfigError: unknown;
  try {
    nativeDesktopConfig = readNativeDesktopHelperConfigFromEnv(env);
  } catch (error) {
    nativeDesktopConfigError = error;
  }

  if (nativeDesktopConfig) {
    registry.register(new NativeDesktopCameraProvider({
      helper: nativeDesktopConfig,
    }));
  }

  const runtimeHealthRegistry = options.runtimeHealthRegistry ?? getDefaultCameraProviderRegistry();
  const defaultSelection = registry.resolveProviderSelection({}, {
    healthSourceRegistry: runtimeHealthRegistry,
    now,
  });
  const defaultProviderId = defaultSelection?.selectedProvider;
  const hasNativeDesktopSurface = Boolean(nativeDesktopConfig || nativeDesktopConfigError || registry.has("native_desktop"));
  if (!hasNativeDesktopSurface && !options.includeBrowserLoopbackOnly) {
    return null;
  }

  const providerContext = buildProviderContext(options.context);
  const nativeDesktopPersistedHealth = await readPersistedRuntimeHealth(providerContext.stateDir, "native_desktop");
  const providers: CameraRuntimeDoctorProvider[] = [
    createBrowserLoopbackDoctorProvider(defaultProviderId, defaultSelection),
  ];

  if (nativeDesktopConfigError) {
    const resolvedRuntimeHealth = resolveRuntimeHealth({
      runtimeHealth: readRuntimeHealthFromRegistry(runtimeHealthRegistry, "native_desktop"),
      snapshot: nativeDesktopPersistedHealth.snapshot,
      snapshotPath: nativeDesktopPersistedHealth.snapshotPath,
      snapshotIssue: nativeDesktopPersistedHealth.issue,
      retention: nativeDesktopPersistedHealth.retention,
      now,
      staleAfterMs: runtimeHealthStaleAfterMs,
    });
    const provider = createNativeDesktopConfigErrorProvider(
      nativeDesktopConfigError,
      defaultProviderId,
      resolvedRuntimeHealth.runtimeHealth,
      resolvedRuntimeHealth.runtimeHealthFreshness,
    );
    const nativeDesktopLaunchConfig = await buildLaunchConfigSummary(nativeDesktopConfig, env);
    if (nativeDesktopLaunchConfig) {
      provider.launchConfig = nativeDesktopLaunchConfig;
    }
    providers.push(provider);
  } else if (registry.has("native_desktop")) {
    const nativeDesktopLaunchConfig = await buildLaunchConfigSummary(nativeDesktopConfig, env);
    const nativeDesktopProvider = registry.get("native_desktop");
    if (!nativeDesktopProvider) {
      providers.push({
        id: "native_desktop",
        registered: false,
        configured: true,
        defaultSelected: defaultProviderId === "native_desktop",
        diagnoseSupported: false,
        status: "unavailable",
        issueCounts: {
          info: 0,
          warning: 0,
          error: 1,
        },
        healthCheck: buildCameraProviderHealthCheck({
          providerId: "native_desktop",
          source: "diagnostic",
          providerStatus: "unavailable",
          issues: [{
            code: "helper_unavailable",
            severity: "error",
            message: "native_desktop provider 未注册成功。",
          }],
        }),
        issues: [{
          code: "helper_unavailable",
          severity: "error",
          message: "native_desktop provider 未注册成功。",
        }],
        recoveryHints: [
          `确认 ${BELLDANDY_CAMERA_NATIVE_HELPER_COMMAND_ENV} 与 helper entry 配置有效后重试。`,
        ],
        fix: `确认 ${BELLDANDY_CAMERA_NATIVE_HELPER_COMMAND_ENV} 与 helper entry 配置有效后重试。`,
        headline: "native_desktop provider 未注册成功。",
        ...(resolveRuntimeHealth({
          runtimeHealth: readRuntimeHealthFromRegistry(runtimeHealthRegistry, "native_desktop"),
          snapshot: nativeDesktopPersistedHealth.snapshot,
          snapshotPath: nativeDesktopPersistedHealth.snapshotPath,
          snapshotIssue: nativeDesktopPersistedHealth.issue,
          retention: nativeDesktopPersistedHealth.retention,
          now,
          staleAfterMs: runtimeHealthStaleAfterMs,
        })),
        ...(nativeDesktopLaunchConfig ? { launchConfig: nativeDesktopLaunchConfig } : {}),
      });
    } else if (typeof nativeDesktopProvider.diagnose === "function") {
      try {
        const diagnostic = await nativeDesktopProvider.diagnose(providerContext);
        const aliasObservation = diagnostic.devices?.length
          ? await observeCameraDeviceAliasMemory(providerContext.stateDir, diagnostic.devices, { now })
          : null;
        const diagnosticWithAliases = aliasObservation
          ? {
            ...diagnostic,
            devices: aliasObservation.devices,
            metadata: {
              ...(diagnostic.metadata ?? {}),
              aliasMemory: aliasObservation.summary,
            },
          }
          : diagnostic;
        const refreshedPersistedHealth = await readPersistedRuntimeHealth(providerContext.stateDir, "native_desktop");
        const resolvedRuntimeHealth = resolveRuntimeHealth({
          runtimeHealth: readRuntimeHealthFromRegistry(runtimeHealthRegistry, "native_desktop") ?? diagnostic.runtimeHealth,
          snapshot: refreshedPersistedHealth.snapshot,
          snapshotPath: refreshedPersistedHealth.snapshotPath,
          snapshotIssue: refreshedPersistedHealth.issue,
          retention: refreshedPersistedHealth.retention,
          now,
          staleAfterMs: runtimeHealthStaleAfterMs,
        });
        providers.push(mapDiagnosticToDoctorProvider("native_desktop", diagnosticWithAliases, {
          defaultProviderId,
          configured: true,
          launchConfig: nativeDesktopLaunchConfig,
          runtimeHealth: resolvedRuntimeHealth.runtimeHealth,
          runtimeHealthFreshness: resolvedRuntimeHealth.runtimeHealthFreshness,
        }));
      } catch (error) {
        const resolvedRuntimeHealth = resolveRuntimeHealth({
          runtimeHealth: readRuntimeHealthFromRegistry(runtimeHealthRegistry, "native_desktop"),
          snapshot: nativeDesktopPersistedHealth.snapshot,
          snapshotPath: nativeDesktopPersistedHealth.snapshotPath,
          snapshotIssue: nativeDesktopPersistedHealth.issue,
          retention: nativeDesktopPersistedHealth.retention,
          now,
          staleAfterMs: runtimeHealthStaleAfterMs,
        });
        providers.push(mapFailureToDoctorProvider("native_desktop", error, {
          defaultProviderId,
          configured: true,
          launchConfig: nativeDesktopLaunchConfig,
          runtimeHealth: resolvedRuntimeHealth.runtimeHealth,
          runtimeHealthFreshness: resolvedRuntimeHealth.runtimeHealthFreshness,
        }));
      }
    }
  }

  return {
    observedAt,
    summary: buildReportSummary(providers, defaultSelection),
    providers,
  };
}
