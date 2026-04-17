import type { ToolContext } from "../../types.js";

export const CAMERA_PROVIDER_IDS = [
  "browser_loopback",
  "native_desktop",
  "node_device",
] as const;
export const CAMERA_PROVIDER_SELECTION_POLICIES = [
  "prefer_native_desktop",
] as const;

export type CameraProviderId = typeof CAMERA_PROVIDER_IDS[number];
export type CameraProviderSelectionPolicyId = typeof CAMERA_PROVIDER_SELECTION_POLICIES[number];
export type CameraFacing = "front" | "back";
export type CameraFit = "cover" | "contain";
export type CameraMirrorStatus = "booting" | "requesting-permission" | "ready" | "error";
export type CameraProviderStatus = "available" | "unavailable" | "degraded";
export type CameraPermissionState =
  | "granted"
  | "denied"
  | "prompt"
  | "not_applicable"
  | "unknown";
export type CameraSelectionReason =
  | "explicit_device_id"
  | "explicit_device_ref"
  | "explicit_device_ref_reidentified"
  | "explicit_stable_key"
  | "explicit_stable_key_reidentified"
  | "facing_preference"
  | "first_available"
  | "helper_default"
  | "unknown";
export type CameraProviderSelectionReason =
  | "explicit_provider"
  | "device_ref_provider"
  | "policy_preferred_provider"
  | "policy_fallback_provider"
  | "policy_runtime_health_fallback_provider";
export type CameraProviderSelectionAttemptReason =
  | "explicit_provider"
  | "device_ref_provider"
  | "policy_preferred"
  | "policy_fallback"
  | "provider_not_registered"
  | "provider_runtime_unhealthy";
export type CameraProviderHealthCheckStatus =
  | "pass"
  | "warn"
  | "fail"
  | "not_checked";
export type CameraProviderHealthCheckSource =
  | "runtime"
  | "diagnostic"
  | "selection"
  | "not_checked";
export type CameraProviderHealthSignalSource =
  | "permission_state"
  | "diagnostic_issue"
  | "runtime_health"
  | "selection_policy"
  | "mirror_status"
  | "not_checked";
export type CameraDeviceSource =
  | "integrated"
  | "external"
  | "virtual"
  | "capture_card"
  | "unknown";
export type CameraDeviceTransport = "browser" | "native" | "node";
export type CameraDeviceAliasSource = "learned" | "manual";
export type CameraRecoveryActionKind =
  | "retry"
  | "close_competing_app"
  | "check_permission"
  | "refresh_device_list"
  | "verify_helper_config"
  | "inspect_doctor"
  | "reconnect_device"
  | "wait_for_browser_session"
  | "continue_using_fallback";
export type CameraRecoveryActionPriority = "now" | "next";

export type CameraProviderContext = Pick<
  ToolContext,
  "conversationId" | "logger" | "workspaceRoot" | "stateDir" | "policy" | "abortSignal"
>;

export type CameraProviderRuntimeOperation =
  | "diagnose"
  | "list_devices"
  | "capture_snapshot";

export type CameraProviderRuntimeEvent = {
  at: string;
  operation: CameraProviderRuntimeOperation;
  outcome: "success" | "failure";
  providerStatus?: CameraProviderStatus;
  helperStatus?: string;
  code?: string;
  message?: string;
  recovered?: boolean;
};

export type CameraProviderRuntimeHistoryWindow = {
  size: number;
  eventCount: number;
  successCount: number;
  failureCount: number;
  recoveredSuccessCount: number;
  failureCodeCounts: Record<string, number>;
  lastEvents: CameraProviderRuntimeEvent[];
};

export type CameraProviderRuntimeHealth = {
  status: "idle" | "healthy" | "degraded" | "error";
  observedAt: string;
  currentAvailability?: CameraProviderStatus;
  helperStatus?: string;
  permissionState?: CameraPermissionState;
  lastOperation?: CameraProviderRuntimeOperation;
  lastSuccessAt?: string;
  lastSuccessOperation?: CameraProviderRuntimeOperation;
  lastFailure?: {
    at: string;
    operation: CameraProviderRuntimeOperation;
    code?: string;
    message: string;
    recoveryHint?: string;
  };
  lastRecoveryAt?: string;
  consecutiveFailures: number;
  historyWindow: CameraProviderRuntimeHistoryWindow;
};

export type CameraProviderSelectionAttempt = {
  provider: CameraProviderId;
  outcome: "selected" | "skipped";
  reason: CameraProviderSelectionAttemptReason;
  detail?: string;
};

export type CameraProviderSelectionTrace = {
  policy: CameraProviderSelectionPolicyId;
  preferredOrder: CameraProviderId[];
  registeredProviders: CameraProviderId[];
  skippedPreferredProviders: CameraProviderId[];
  availableFallbackProviders: CameraProviderId[];
  missingFallbackProviders: CameraProviderId[];
  configuredDefaultProvider?: CameraProviderId;
  requestedProvider?: CameraProviderId;
  requestedDeviceRef?: string;
  selectedProvider: CameraProviderId;
  reason: CameraProviderSelectionReason;
  fallbackApplied: boolean;
  attempts: CameraProviderSelectionAttempt[];
};

export type CameraRecoveryAction = {
  kind: CameraRecoveryActionKind;
  priority: CameraRecoveryActionPriority;
  label: string;
  detail?: string;
};

export type CameraProviderHealthCheck = {
  provider: CameraProviderId;
  status: CameraProviderHealthCheckStatus;
  source: CameraProviderHealthCheckSource;
  sources: CameraProviderHealthSignalSource[];
  checkedAt: string;
  headline: string;
  summary: string;
  actionable: boolean;
  fallbackApplied: boolean;
  primaryReasonCode?: string;
  reasonCodes: string[];
  permission: {
    state: CameraPermissionState;
    gating: "clear" | "needs_prompt" | "blocked" | "not_applicable" | "unknown";
    actionable: boolean;
  };
  failureStats: {
    issueCounts: {
      total: number;
      info: number;
      warning: number;
      error: number;
      retryable: number;
    };
    reasonCodeCounts: Record<string, number>;
    dominantReasonCode?: string;
    runtimeWindow?: {
      eventCount: number;
      successCount: number;
      failureCount: number;
      recoveredSuccessCount: number;
      dominantFailureCode?: string;
      lastFailureCode?: string;
    };
  };
  recoveryActions: CameraRecoveryAction[];
};

export type CameraSelectionRequest = {
  provider?: CameraProviderId;
  deviceId?: string;
  deviceRef?: string;
  facing: CameraFacing;
  width: number;
  height: number;
  fit: CameraFit;
  mirror: boolean;
  readyTimeoutMs: number;
};

export type CameraListRequest = CameraSelectionRequest;

export type CameraSnapshotRequest = CameraSelectionRequest & {
  delayMs: number;
  name?: string;
};

export type CameraDeviceDescriptor = {
  provider: CameraProviderId;
  deviceId: string;
  deviceRef: string;
  stableKey?: string;
  alias?: string;
  aliasSource?: CameraDeviceAliasSource;
  favorite?: boolean;
  label: string;
  groupId?: string;
  kind: "videoinput";
  active?: boolean;
  facing?: CameraFacing;
  source: CameraDeviceSource;
  transport: CameraDeviceTransport;
  external: boolean;
  available: boolean;
  metadata?: Record<string, unknown>;
};

export type CameraMirrorState = {
  status: CameraMirrorStatus;
  providerStatus?: CameraProviderStatus;
  permissionState?: CameraPermissionState;
  providerHealthCheck?: CameraProviderHealthCheck;
  providerSelection?: CameraProviderSelectionTrace;
  issues?: CameraProviderDiagnosticIssue[];
  providerMetadata?: Record<string, unknown>;
  selectionReason?: CameraSelectionReason;
  selectedFacing: CameraFacing;
  selectedDeviceId?: string;
  selectedDeviceRef?: string;
  selectedDeviceAlias?: string;
  selectedDeviceFavorite?: boolean;
  devices: CameraDeviceDescriptor[];
  videoWidth?: number;
  videoHeight?: number;
  settings?: {
    width?: number;
    height?: number;
    frameRate?: number;
    deviceId?: string;
  };
  error?: {
    name?: string;
    message?: string;
  };
  startedAt?: string;
  updatedAt?: string;
  fallbackChain?: string[];
  lastSuccessfulCaptureAt?: string;
};

export type CameraListResponse = {
  provider: CameraProviderId;
  mirrorUrl?: string;
  state: CameraMirrorState;
};

export type CameraSnapshotResponse = CameraListResponse & {
  path: string;
};

export type CameraProviderCapabilities = {
  diagnose: boolean;
  list: boolean;
  snapshot: boolean;
  clip: boolean;
  audio: boolean;
  hotplug: boolean;
  background: boolean;
};

export type CameraProviderDiagnosticIssue = {
  code: string;
  severity: "info" | "warning" | "error";
  message: string;
  retryable?: boolean;
  metadata?: Record<string, unknown>;
};

export type CameraProviderDiagnostic = {
  provider: CameraProviderId;
  status: CameraProviderStatus;
  permissionState: CameraPermissionState;
  capabilities: CameraProviderCapabilities;
  observedAt: string;
  issues: CameraProviderDiagnosticIssue[];
  devices?: CameraDeviceDescriptor[];
  runtimeHealth?: CameraProviderRuntimeHealth;
  metadata?: Record<string, unknown>;
};

export interface CameraProvider {
  readonly id: CameraProviderId;
  readonly capabilities: CameraProviderCapabilities;
  diagnose?(
    context: CameraProviderContext,
  ): Promise<CameraProviderDiagnostic>;
  listDevices(
    input: CameraListRequest,
    context: CameraProviderContext,
  ): Promise<CameraListResponse>;
  captureSnapshot(
    input: CameraSnapshotRequest,
    context: CameraProviderContext,
  ): Promise<CameraSnapshotResponse>;
  getRuntimeHealth?(): CameraProviderRuntimeHealth | undefined;
}

export function isCameraProviderId(value: unknown): value is CameraProviderId {
  return typeof value === "string" && CAMERA_PROVIDER_IDS.includes(value as CameraProviderId);
}
