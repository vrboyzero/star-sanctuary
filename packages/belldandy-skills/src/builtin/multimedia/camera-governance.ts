import type {
  CameraPermissionState,
  CameraProviderDiagnosticIssue,
  CameraProviderHealthCheck,
  CameraProviderHealthCheckSource,
  CameraProviderHealthSignalSource,
  CameraProviderHealthCheckStatus,
  CameraProviderId,
  CameraProviderRuntimeHealth,
  CameraProviderStatus,
  CameraProviderSelectionTrace,
  CameraRecoveryAction,
} from "./camera-contract.js";

type BuildCameraProviderHealthCheckInput = {
  providerId: CameraProviderId;
  source: CameraProviderHealthCheckSource;
  checkedAt?: string;
  providerStatus?: CameraProviderStatus;
  permissionState?: CameraPermissionState;
  issues?: readonly CameraProviderDiagnosticIssue[];
  runtimeHealth?: CameraProviderRuntimeHealth;
  selection?: CameraProviderSelectionTrace;
  mirrorStatus?: "booting" | "requesting-permission" | "ready" | "error";
};

const REASON_CODE_PRIORITY = [
  "device_busy",
  "permission_denied",
  "helper_not_configured",
  "helper_unavailable",
  "protocol_mismatch",
  "device_not_found",
  "timeout",
  "driver_error",
  "capture_failed",
  "provider_runtime_unhealthy",
  "provider_not_registered",
  "permission_prompt",
  "fallback_active",
  "not_checked",
] as const;
const SIGNAL_SOURCE_PRIORITY: CameraProviderHealthSignalSource[] = [
  "permission_state",
  "diagnostic_issue",
  "runtime_health",
  "selection_policy",
  "mirror_status",
  "not_checked",
];

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function dedupeStrings(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const value of values) {
    const normalized = normalizeString(value);
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    deduped.push(normalized);
  }
  return deduped;
}

function sortReasonCodes(codes: readonly string[]): string[] {
  return [...dedupeStrings(codes)].sort((left, right) => {
    const leftIndex = REASON_CODE_PRIORITY.indexOf(left as typeof REASON_CODE_PRIORITY[number]);
    const rightIndex = REASON_CODE_PRIORITY.indexOf(right as typeof REASON_CODE_PRIORITY[number]);
    if (leftIndex === -1 && rightIndex === -1) {
      return left.localeCompare(right);
    }
    if (leftIndex === -1) {
      return 1;
    }
    if (rightIndex === -1) {
      return -1;
    }
    return leftIndex - rightIndex;
  });
}

function sortSignalSources(sources: readonly CameraProviderHealthSignalSource[]): CameraProviderHealthSignalSource[] {
  return [...new Set(sources)].sort((left, right) => {
    const leftIndex = SIGNAL_SOURCE_PRIORITY.indexOf(left);
    const rightIndex = SIGNAL_SOURCE_PRIORITY.indexOf(right);
    return leftIndex - rightIndex;
  });
}

function incrementCount(record: Record<string, number>, key: string, count = 1): void {
  const normalized = normalizeString(key);
  if (!normalized || !Number.isFinite(count) || count <= 0) {
    return;
  }
  record[normalized] = (record[normalized] ?? 0) + count;
}

function resolveDominantReasonCode(counts: Record<string, number>): string | undefined {
  const entries = Object.entries(counts)
    .filter(([, count]) => Number.isFinite(count) && count > 0)
    .sort((left, right) => {
      if (right[1] !== left[1]) {
        return right[1] - left[1];
      }
      const leftIndex = REASON_CODE_PRIORITY.indexOf(left[0] as typeof REASON_CODE_PRIORITY[number]);
      const rightIndex = REASON_CODE_PRIORITY.indexOf(right[0] as typeof REASON_CODE_PRIORITY[number]);
      if (leftIndex === -1 && rightIndex === -1) {
        return left[0].localeCompare(right[0]);
      }
      if (leftIndex === -1) {
        return 1;
      }
      if (rightIndex === -1) {
        return -1;
      }
      return leftIndex - rightIndex;
    });
  return entries[0]?.[0];
}

function appendAction(
  actions: CameraRecoveryAction[],
  action: CameraRecoveryAction,
): void {
  if (actions.some((existing) => existing.kind === action.kind && existing.label === action.label)) {
    return;
  }
  actions.push(action);
}

function appendActionForReasonCode(
  actions: CameraRecoveryAction[],
  reasonCode: string,
): void {
  switch (reasonCode) {
    case "device_busy":
      appendAction(actions, {
        kind: "close_competing_app",
        priority: "now",
        label: "关闭正在占用摄像头的会议或录制软件后重试。",
      });
      appendAction(actions, {
        kind: "retry",
        priority: "next",
        label: "释放占用后最多重试一次，再观察 camera runtime 状态。",
      });
      break;
    case "permission_denied":
      appendAction(actions, {
        kind: "check_permission",
        priority: "now",
        label: "确认系统摄像头权限允许当前应用访问。",
      });
      break;
    case "permission_prompt":
      appendAction(actions, {
        kind: "check_permission",
        priority: "now",
        label: "接受浏览器或系统的摄像头授权提示后再重试。",
      });
      break;
    case "helper_not_configured":
    case "helper_unavailable":
    case "protocol_mismatch":
      appendAction(actions, {
        kind: "verify_helper_config",
        priority: "now",
        label: "核对 helper 启动命令、cwd、helper entry 与相关环境变量。",
      });
      appendAction(actions, {
        kind: "inspect_doctor",
        priority: "next",
        label: "查看 doctor 的 camera runtime 摘要和 helper launch 配置。",
      });
      break;
    case "device_not_found":
      appendAction(actions, {
        kind: "reconnect_device",
        priority: "now",
        label: "确认摄像头已连接并处于可枚举状态。",
      });
      appendAction(actions, {
        kind: "refresh_device_list",
        priority: "next",
        label: "重新执行 camera_list 获取新的 deviceRef 后再拍摄。",
      });
      break;
    case "timeout":
      appendAction(actions, {
        kind: "retry",
        priority: "now",
        label: "先重试一次；如果持续超时，再放宽 helper 超时配置。",
      });
      appendAction(actions, {
        kind: "inspect_doctor",
        priority: "next",
        label: "查看 doctor 中的 runtime health 与 helper 请求超时配置。",
      });
      break;
    case "driver_error":
    case "capture_failed":
      appendAction(actions, {
        kind: "reconnect_device",
        priority: "now",
        label: "重新插拔摄像头或重启 helper 后再试。",
      });
      appendAction(actions, {
        kind: "inspect_doctor",
        priority: "next",
        label: "检查 ffmpeg / DirectShow 与 camera runtime 诊断输出。",
      });
      break;
    case "provider_runtime_unhealthy":
      appendAction(actions, {
        kind: "continue_using_fallback",
        priority: "now",
        label: "当前已切到 fallback provider，可先继续完成本次拍摄。",
      });
      appendAction(actions, {
        kind: "inspect_doctor",
        priority: "next",
        label: "稍后再排查首选 provider 的 runtime health，再决定是否切回。",
      });
      break;
    case "provider_not_registered":
      appendAction(actions, {
        kind: "verify_helper_config",
        priority: "now",
        label: "确认目标 provider 已注册并且所需环境已就绪。",
      });
      break;
    case "fallback_active":
      appendAction(actions, {
        kind: "continue_using_fallback",
        priority: "now",
        label: "当前 fallback provider 可用时，优先完成本次拍摄任务。",
      });
      break;
    case "not_checked":
      appendAction(actions, {
        kind: "wait_for_browser_session",
        priority: "next",
        label: "在真实浏览器会话里执行一次 camera_list / camera_snap 后再看运行时状态。",
      });
      break;
    default:
      break;
  }
}

export function getCameraRecoveryHintText(reasonCode: string | undefined): string | undefined {
  const actions = buildCameraRecoveryActions({
    reasonCodes: reasonCode ? [reasonCode] : [],
  });
  return actions[0]?.label;
}

export function buildCameraRecoveryActions(input: {
  reasonCodes: readonly string[];
  selection?: CameraProviderSelectionTrace;
  permissionState?: CameraPermissionState;
}): CameraRecoveryAction[] {
  const actions: CameraRecoveryAction[] = [];
  const reasonCodes = sortReasonCodes(input.reasonCodes);

  for (const reasonCode of reasonCodes) {
    appendActionForReasonCode(actions, reasonCode);
  }

  if (input.selection?.fallbackApplied && !reasonCodes.includes("fallback_active")) {
    appendActionForReasonCode(actions, "fallback_active");
  }

  if (!actions.length && input.permissionState === "prompt") {
    appendActionForReasonCode(actions, "permission_prompt");
  }

  if (!actions.length && (input.permissionState === "denied")) {
    appendActionForReasonCode(actions, "permission_denied");
  }

  if (!actions.length && reasonCodes.length > 0) {
    appendAction(actions, {
      kind: "inspect_doctor",
      priority: "next",
      label: "查看 doctor 的 camera runtime 摘要以获取下一步恢复建议。",
    });
  }

  return actions;
}

function resolveReasonCodes(input: BuildCameraProviderHealthCheckInput): string[] {
  const reasonCodes: string[] = [];
  for (const issue of input.issues ?? []) {
    reasonCodes.push(issue.code);
  }
  if (input.runtimeHealth?.lastFailure?.code) {
    reasonCodes.push(input.runtimeHealth.lastFailure.code);
  }
  if (input.permissionState === "denied") {
    reasonCodes.push("permission_denied");
  }
  if (input.permissionState === "prompt") {
    reasonCodes.push("permission_prompt");
  }
  if (input.selection?.fallbackApplied) {
    reasonCodes.push("fallback_active");
    for (const attempt of input.selection.attempts) {
      if (attempt.outcome !== "skipped") {
        continue;
      }
      if (attempt.reason === "provider_runtime_unhealthy" || attempt.reason === "provider_not_registered") {
        reasonCodes.push(attempt.reason);
      }
    }
  }
  if (input.source === "not_checked") {
    reasonCodes.push("not_checked");
  }
  return sortReasonCodes(reasonCodes);
}

function resolveSignalSources(input: BuildCameraProviderHealthCheckInput): CameraProviderHealthSignalSource[] {
  const sources: CameraProviderHealthSignalSource[] = [];
  if (input.permissionState && input.permissionState !== "unknown") {
    sources.push("permission_state");
  }
  if ((input.issues ?? []).length > 0) {
    sources.push("diagnostic_issue");
  }
  if (input.runtimeHealth) {
    sources.push("runtime_health");
  }
  if (input.selection) {
    sources.push("selection_policy");
  }
  if (input.mirrorStatus) {
    sources.push("mirror_status");
  }
  if (input.source === "not_checked" || sources.length === 0) {
    sources.push("not_checked");
  }
  return sortSignalSources(sources);
}

function buildPermissionSummary(permissionState: CameraPermissionState | undefined): CameraProviderHealthCheck["permission"] {
  switch (permissionState) {
    case "granted":
      return {
        state: "granted",
        gating: "clear",
        actionable: false,
      };
    case "prompt":
      return {
        state: "prompt",
        gating: "needs_prompt",
        actionable: true,
      };
    case "denied":
      return {
        state: "denied",
        gating: "blocked",
        actionable: true,
      };
    case "not_applicable":
      return {
        state: "not_applicable",
        gating: "not_applicable",
        actionable: false,
      };
    default:
      return {
        state: "unknown",
        gating: "unknown",
        actionable: false,
      };
  }
}

function buildFailureStats(input: BuildCameraProviderHealthCheckInput): CameraProviderHealthCheck["failureStats"] {
  const issueCounts = {
    total: 0,
    info: 0,
    warning: 0,
    error: 0,
    retryable: 0,
  };
  const reasonCodeCounts: Record<string, number> = {};

  for (const issue of input.issues ?? []) {
    issueCounts.total += 1;
    issueCounts[issue.severity] += 1;
    if (issue.retryable) {
      issueCounts.retryable += 1;
    }
    incrementCount(reasonCodeCounts, issue.code);
  }

  const runtimeWindow = input.runtimeHealth?.historyWindow;
  if (runtimeWindow) {
    for (const [code, count] of Object.entries(runtimeWindow.failureCodeCounts ?? {})) {
      incrementCount(reasonCodeCounts, code, count);
    }
  }
  if (input.runtimeHealth?.lastFailure?.code) {
    incrementCount(reasonCodeCounts, input.runtimeHealth.lastFailure.code);
  }
  if (input.permissionState === "denied") {
    incrementCount(reasonCodeCounts, "permission_denied");
  }
  if (input.permissionState === "prompt") {
    incrementCount(reasonCodeCounts, "permission_prompt");
  }
  for (const attempt of input.selection?.attempts ?? []) {
    if (attempt.outcome !== "skipped") {
      continue;
    }
    if (attempt.reason === "provider_runtime_unhealthy" || attempt.reason === "provider_not_registered") {
      incrementCount(reasonCodeCounts, attempt.reason);
    }
  }
  if (input.selection?.fallbackApplied) {
    incrementCount(reasonCodeCounts, "fallback_active");
  }

  const dominantReasonCode = resolveDominantReasonCode(reasonCodeCounts);
  return {
    issueCounts,
    reasonCodeCounts,
    ...(dominantReasonCode ? { dominantReasonCode } : {}),
    ...(runtimeWindow ? {
      runtimeWindow: {
        eventCount: runtimeWindow.eventCount,
        successCount: runtimeWindow.successCount,
        failureCount: runtimeWindow.failureCount,
        recoveredSuccessCount: runtimeWindow.recoveredSuccessCount,
        ...(resolveDominantReasonCode(runtimeWindow.failureCodeCounts)
          ? { dominantFailureCode: resolveDominantReasonCode(runtimeWindow.failureCodeCounts) }
          : {}),
        ...(input.runtimeHealth?.lastFailure?.code ? { lastFailureCode: input.runtimeHealth.lastFailure.code } : {}),
      },
    } : {}),
  };
}

function resolveHealthCheckStatus(
  input: BuildCameraProviderHealthCheckInput,
  reasonCodes: readonly string[],
): CameraProviderHealthCheckStatus {
  if (input.source === "not_checked") {
    return "not_checked";
  }
  if (
    input.mirrorStatus === "error"
    || input.providerStatus === "unavailable"
    || input.permissionState === "denied"
    || input.runtimeHealth?.status === "error"
    || (input.issues ?? []).some((issue) => issue.severity === "error")
  ) {
    return "fail";
  }
  if (
    input.providerStatus === "degraded"
    || input.permissionState === "prompt"
    || input.runtimeHealth?.status === "degraded"
    || (input.issues ?? []).some((issue) => issue.severity === "warning")
    || input.selection?.fallbackApplied === true
    || reasonCodes.includes("fallback_active")
  ) {
    return "warn";
  }
  return "pass";
}

function buildHealthCheckHeadline(input: {
  providerId: CameraProviderId;
  status: CameraProviderHealthCheckStatus;
  primaryReasonCode?: string;
  selection?: CameraProviderSelectionTrace;
}): string {
  if (input.status === "not_checked") {
    return `${input.providerId} 尚未执行运行时 health check。`;
  }
  if (input.status === "pass") {
    return `${input.providerId} 当前可用。`;
  }
  if (input.status === "warn" && input.selection?.fallbackApplied) {
    return `${input.providerId} 当前可用，但系统正处于 fallback 模式。`;
  }
  switch (input.primaryReasonCode) {
    case "device_busy":
      return `${input.providerId} 当前不可用：摄像头正在被其他应用占用。`;
    case "permission_denied":
      return `${input.providerId} 当前不可用：摄像头权限被拒绝。`;
    case "permission_prompt":
      return `${input.providerId} 需要先完成摄像头授权。`;
    case "helper_not_configured":
      return `${input.providerId} 当前不可用：helper 尚未配置。`;
    case "helper_unavailable":
    case "protocol_mismatch":
      return `${input.providerId} 当前不可用：helper 尚未就绪。`;
    case "device_not_found":
      return `${input.providerId} 当前不可用：目标摄像头未找到。`;
    case "provider_not_registered":
      return `${input.providerId} 当前未注册，默认策略无法选中它。`;
    case "provider_runtime_unhealthy":
      return `${input.providerId} 当前被标记为运行时不健康。`;
    default:
      return input.status === "warn"
        ? `${input.providerId} 当前可用，但存在需要关注的告警。`
        : `${input.providerId} 当前不可用，需要先处理运行时异常。`;
  }
}

export function buildCameraProviderHealthCheck(
  input: BuildCameraProviderHealthCheckInput,
): CameraProviderHealthCheck {
  const checkedAt = normalizeString(input.checkedAt)
    || normalizeString(input.runtimeHealth?.observedAt)
    || new Date().toISOString();
  const reasonCodes = resolveReasonCodes(input);
  const sources = resolveSignalSources(input);
  const status = resolveHealthCheckStatus(input, reasonCodes);
  const permission = buildPermissionSummary(input.permissionState);
  const failureStats = buildFailureStats(input);
  const recoveryActions = buildCameraRecoveryActions({
    reasonCodes,
    selection: input.selection,
    permissionState: input.permissionState,
  });
  const primaryReasonCode = reasonCodes[0];
  const headline = buildHealthCheckHeadline({
    providerId: input.providerId,
    status,
    primaryReasonCode,
    selection: input.selection,
  });
  const summaryParts = [
    `status=${status}`,
    `sources=${sources.join("+")}`,
    input.providerStatus ? `provider=${input.providerStatus}` : "",
    `permission=${permission.state}/${permission.gating}`,
    input.selection?.fallbackApplied ? "fallback=yes" : "",
    primaryReasonCode ? `reason=${primaryReasonCode}` : "",
    failureStats.dominantReasonCode ? `dominant=${failureStats.dominantReasonCode}` : "",
    recoveryActions.length > 0 ? `actions=${recoveryActions.length}` : "",
  ].filter(Boolean);
  return {
    provider: input.providerId,
    status,
    source: input.source,
    sources,
    checkedAt,
    headline,
    summary: summaryParts.join(", "),
    actionable: recoveryActions.length > 0,
    fallbackApplied: input.selection?.fallbackApplied === true,
    ...(primaryReasonCode ? { primaryReasonCode } : {}),
    reasonCodes,
    permission,
    failureStats,
    recoveryActions,
  };
}
