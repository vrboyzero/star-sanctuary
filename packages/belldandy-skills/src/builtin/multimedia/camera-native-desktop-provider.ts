import type {
  CameraDeviceDescriptor,
  CameraListRequest,
  CameraListResponse,
  CameraPermissionState,
  CameraProvider,
  CameraProviderContext,
  CameraProviderDiagnostic,
  CameraProviderDiagnosticIssue,
  CameraProviderRuntimeEvent,
  CameraProviderRuntimeHealth,
  CameraProviderRuntimeHistoryWindow,
  CameraProviderRuntimeOperation,
  CameraProviderStatus,
  CameraSelectionReason,
  CameraSnapshotRequest,
  CameraSnapshotResponse,
} from "./camera-contract.js";
import {
  buildNativeDesktopDeviceRef,
  buildNativeDesktopFacingDeviceRef,
  resolveNativeDesktopSelection,
  type CameraNativeDesktopHelperClient,
  type CameraNativeDesktopHelperDevice,
  type CameraNativeDesktopHelperDiagnoseResponse,
  type CameraNativeDesktopHelperIssue,
  type CameraNativeDesktopHelperListDevicesResponse,
  type CameraNativeDesktopProviderOptions,
  type CameraNativeDesktopHelperCaptureSnapshotResponse,
} from "./camera-native-desktop-contract.js";
import { NativeDesktopStdioHelperClient } from "./camera-native-desktop-stdio-client.js";
import {
  DEFAULT_CAMERA_RUNTIME_HEALTH_RETENTION_POLICY,
  writeCameraRuntimeHealthSnapshot,
} from "./camera-runtime-health-state.js";
import { getCameraRecoveryHintText } from "./camera-governance.js";

const NATIVE_DESKTOP_NOT_CONFIGURED_MESSAGE =
  "native_desktop provider 已预留 contract，但 Windows helper client 还未接入。请先完成 helper transport 与部署配置。";
const RUNTIME_HEALTH_WINDOW_SIZE = DEFAULT_CAMERA_RUNTIME_HEALTH_RETENTION_POLICY.eventLimit;

function toObservedAt(value: string | undefined): string {
  return typeof value === "string" && value.trim()
    ? value
    : new Date().toISOString();
}

function parseRuntimeFailure(error: unknown): {
  code?: string;
  message: string;
} {
  const rawMessage = error instanceof Error ? error.message : String(error);
  const separatorIndex = rawMessage.indexOf(":");
  if (separatorIndex <= 0) {
    return {
      message: rawMessage,
    };
  }
  const code = rawMessage.slice(0, separatorIndex).trim();
  if (!/^[a-z_]+$/u.test(code)) {
    return {
      message: rawMessage,
    };
  }
  return {
    code,
    message: rawMessage.slice(separatorIndex + 1).trim(),
  };
}

function buildRuntimeRecoveryHint(code: string | undefined): string | undefined {
  return getCameraRecoveryHintText(code);
}

function createEmptyRuntimeHistoryWindow(): CameraProviderRuntimeHistoryWindow {
  return {
    size: RUNTIME_HEALTH_WINDOW_SIZE,
    eventCount: 0,
    successCount: 0,
    failureCount: 0,
    recoveredSuccessCount: 0,
    failureCodeCounts: {},
    lastEvents: [],
  };
}

function cloneRuntimeHistoryWindow(
  window: CameraProviderRuntimeHistoryWindow,
): CameraProviderRuntimeHistoryWindow {
  return {
    ...window,
    failureCodeCounts: { ...window.failureCodeCounts },
    lastEvents: window.lastEvents.map((event) => ({ ...event })),
  };
}

function buildRuntimeHistoryWindow(
  previous: CameraProviderRuntimeHistoryWindow,
  event: CameraProviderRuntimeEvent,
): CameraProviderRuntimeHistoryWindow {
  const size = previous.size > 0 ? previous.size : RUNTIME_HEALTH_WINDOW_SIZE;
  const lastEvents = [...previous.lastEvents, event].slice(-size);
  const failureCodeCounts: Record<string, number> = {};
  let successCount = 0;
  let failureCount = 0;
  let recoveredSuccessCount = 0;

  for (const item of lastEvents) {
    if (item.outcome === "success") {
      successCount += 1;
      if (item.recovered) {
        recoveredSuccessCount += 1;
      }
      continue;
    }
    failureCount += 1;
    if (item.code) {
      failureCodeCounts[item.code] = (failureCodeCounts[item.code] ?? 0) + 1;
    }
  }

  return {
    size,
    eventCount: lastEvents.length,
    successCount,
    failureCount,
    recoveredSuccessCount,
    failureCodeCounts,
    lastEvents,
  };
}

function mapIssue(issue: CameraNativeDesktopHelperIssue): CameraProviderDiagnosticIssue {
  return {
    code: issue.code,
    severity: issue.severity,
    message: issue.message,
    ...(issue.retryable === true ? { retryable: true } : {}),
    ...(issue.metadata ? { metadata: issue.metadata } : {}),
  };
}

function mapDevice(
  device: CameraNativeDesktopHelperDevice,
  selectedStableKey?: string,
  selectedDeviceId?: string,
): CameraDeviceDescriptor {
  return {
    provider: "native_desktop",
    deviceId: device.deviceId,
    deviceRef: buildNativeDesktopDeviceRef(device.stableKey),
    stableKey: device.stableKey,
    label: device.label,
    kind: "videoinput",
    active: Boolean(
      (selectedStableKey && device.stableKey === selectedStableKey)
      || (selectedDeviceId && device.deviceId === selectedDeviceId),
    ),
    facing: device.facing,
    source: device.source,
    transport: device.transport,
    external: device.external,
    available: device.available,
    metadata: {
      ...(device.busy !== undefined ? { busy: device.busy } : {}),
      ...(device.metadata ?? {}),
    },
  };
}

function mapProviderStatus(
  status: CameraNativeDesktopHelperDiagnoseResponse["status"],
): CameraProviderStatus {
  return status;
}

function mapPermissionState(
  state: CameraNativeDesktopHelperDiagnoseResponse["permissionState"] | undefined,
): CameraPermissionState {
  return state ?? "unknown";
}

function mapRuntimeHealthStatus(
  providerStatus: CameraProviderStatus,
  issues: readonly CameraProviderDiagnosticIssue[],
): CameraProviderRuntimeHealth["status"] {
  if (providerStatus === "unavailable" || issues.some((issue) => issue.severity === "error")) {
    return "error";
  }
  if (providerStatus === "degraded" || issues.some((issue) => issue.severity === "warning")) {
    return "degraded";
  }
  return "healthy";
}

function mapSelectionReason(
  value: string | undefined,
): CameraSelectionReason | undefined {
  switch (value) {
    case "explicit_device_id":
    case "explicit_device_ref":
    case "explicit_device_ref_reidentified":
    case "explicit_stable_key":
    case "explicit_stable_key_reidentified":
    case "facing_preference":
    case "first_available":
    case "helper_default":
    case "unknown":
      return value;
    default:
      return undefined;
  }
}

export class NativeDesktopCameraProvider implements CameraProvider {
  readonly id = "native_desktop" as const;

  readonly capabilities = {
    diagnose: true,
    list: true,
    snapshot: true,
    clip: false,
    audio: false,
    hotplug: true,
    background: true,
  } as const;

  private readonly client: CameraNativeDesktopHelperClient | null;
  private runtimeHealth: CameraProviderRuntimeHealth = {
    status: "idle",
    observedAt: new Date(0).toISOString(),
    consecutiveFailures: 0,
    historyWindow: createEmptyRuntimeHistoryWindow(),
  };

  constructor(options: CameraNativeDesktopProviderOptions = {}) {
    this.client = options.client ?? (options.helper ? new NativeDesktopStdioHelperClient(options.helper) : null);
  }

  private requireClient(): CameraNativeDesktopHelperClient {
    if (!this.client) {
      throw new Error(NATIVE_DESKTOP_NOT_CONFIGURED_MESSAGE);
    }
    return this.client;
  }

  getRuntimeHealth(): CameraProviderRuntimeHealth | undefined {
    return {
      ...this.runtimeHealth,
      historyWindow: cloneRuntimeHistoryWindow(this.runtimeHealth.historyWindow),
      ...(this.runtimeHealth.lastFailure
        ? {
          lastFailure: {
            ...this.runtimeHealth.lastFailure,
          },
        }
        : {}),
    };
  }

  private async persistRuntimeHealth(
    context: CameraProviderContext,
  ): Promise<void> {
    try {
      await writeCameraRuntimeHealthSnapshot(context.stateDir, this.id, this.runtimeHealth, {
        now: this.runtimeHealth.observedAt,
      });
    } catch (error) {
      context.logger?.warn(
        `Failed to persist ${this.id} runtime health snapshot: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private noteSuccess(input: {
    operation: CameraProviderRuntimeOperation;
    observedAt?: string;
    providerStatus: CameraProviderStatus;
    helperStatus?: string;
    permissionState?: CameraPermissionState;
    issues?: readonly CameraProviderDiagnosticIssue[];
  }): CameraProviderRuntimeHealth {
    const observedAt = toObservedAt(input.observedAt);
    const issues = input.issues ?? [];
    const lastFailureAt = this.runtimeHealth.lastFailure?.at;
    const shouldMarkRecovered = Boolean(
      lastFailureAt
      && (!this.runtimeHealth.lastRecoveryAt || this.runtimeHealth.lastRecoveryAt < lastFailureAt),
    );

    const event: CameraProviderRuntimeEvent = {
      at: observedAt,
      operation: input.operation,
      outcome: "success",
      providerStatus: input.providerStatus,
      ...(input.helperStatus ? { helperStatus: input.helperStatus } : {}),
      ...(shouldMarkRecovered ? { recovered: true } : {}),
    };

    this.runtimeHealth = {
      ...this.runtimeHealth,
      status: mapRuntimeHealthStatus(input.providerStatus, issues),
      observedAt,
      currentAvailability: input.providerStatus,
      ...(input.helperStatus ? { helperStatus: input.helperStatus } : {}),
      ...(input.permissionState ? { permissionState: input.permissionState } : {}),
      lastOperation: input.operation,
      lastSuccessAt: observedAt,
      lastSuccessOperation: input.operation,
      consecutiveFailures: 0,
      historyWindow: buildRuntimeHistoryWindow(this.runtimeHealth.historyWindow, event),
      ...(shouldMarkRecovered ? { lastRecoveryAt: observedAt } : {}),
    };

    return this.getRuntimeHealth()!;
  }

  private noteFailure(
    operation: CameraProviderRuntimeOperation,
    error: unknown,
  ): CameraProviderRuntimeHealth {
    const observedAt = new Date().toISOString();
    const parsed = parseRuntimeFailure(error);
    const recoveryHint = buildRuntimeRecoveryHint(parsed.code);
    const event: CameraProviderRuntimeEvent = {
      at: observedAt,
      operation,
      outcome: "failure",
      providerStatus: "unavailable",
      helperStatus: "error",
      ...(parsed.code ? { code: parsed.code } : {}),
      message: parsed.message,
    };
    this.runtimeHealth = {
      ...this.runtimeHealth,
      status: "error",
      observedAt,
      currentAvailability: "unavailable",
      helperStatus: "error",
      lastOperation: operation,
      lastFailure: {
        at: observedAt,
        operation,
        ...(parsed.code ? { code: parsed.code } : {}),
        message: parsed.message,
        ...(recoveryHint ? { recoveryHint } : {}),
      },
      consecutiveFailures: this.runtimeHealth.consecutiveFailures + 1,
      historyWindow: buildRuntimeHistoryWindow(this.runtimeHealth.historyWindow, event),
    };

    return this.getRuntimeHealth()!;
  }

  async diagnose(
    context: CameraProviderContext,
  ): Promise<CameraProviderDiagnostic> {
    const client = this.requireClient();
    let response: CameraNativeDesktopHelperDiagnoseResponse;
    try {
      response = await client.diagnose({
        includeDevices: true,
        includePermissionState: true,
        includeCapabilities: true,
      }, context);
    } catch (error) {
      this.noteFailure("diagnose", error);
      await this.persistRuntimeHealth(context);
      throw error;
    }
    const issues = response.issues.map(mapIssue);
    const runtimeHealth = this.noteSuccess({
      operation: "diagnose",
      observedAt: response.observedAt,
      providerStatus: mapProviderStatus(response.status),
      helperStatus: response.helperStatus,
      permissionState: mapPermissionState(response.permissionState),
      issues,
    });
    await this.persistRuntimeHealth(context);
    return {
      provider: "native_desktop",
      status: mapProviderStatus(response.status),
      permissionState: mapPermissionState(response.permissionState),
      capabilities: response.capabilities ?? this.capabilities,
      observedAt: response.observedAt,
      issues,
      devices: response.devices?.map((device) => mapDevice(device)),
      runtimeHealth,
      metadata: {
        helperStatus: response.helperStatus,
        ...(response.helperVersion ? { helperVersion: response.helperVersion } : {}),
      },
    };
  }

  async listDevices(
    input: CameraListRequest,
    context: CameraProviderContext,
  ): Promise<CameraListResponse> {
    const client = this.requireClient();
    const selection = resolveNativeDesktopSelection(input);
    let response: CameraNativeDesktopHelperListDevicesResponse;
    try {
      response = await client.listDevices({
        selection,
        includeUnavailable: true,
        includeBusy: true,
      }, context);
    } catch (error) {
      this.noteFailure("list_devices", error);
      await this.persistRuntimeHealth(context);
      throw error;
    }
    const devices = response.devices.map((device) => mapDevice(
      device,
      response.selectedStableKey,
      response.selectedDeviceId,
    ));
    const issues = response.issues?.map(mapIssue) ?? [];
    const providerStatus = response.helperStatus === "error" ? "unavailable" : issues.some((issue) => issue.severity === "warning" || issue.severity === "error")
      ? "degraded"
      : "available";
    const runtimeHealth = this.noteSuccess({
      operation: "list_devices",
      observedAt: response.observedAt,
      providerStatus,
      helperStatus: response.helperStatus,
      permissionState: response.permissionState,
      issues,
    });
    await this.persistRuntimeHealth(context);
    return {
      provider: "native_desktop",
      state: {
        status: response.helperStatus === "error" ? "error" : "ready",
        providerStatus,
        permissionState: response.permissionState,
        ...(issues.length > 0 ? { issues } : {}),
        providerMetadata: {
          helperStatus: response.helperStatus,
          requestedDeviceRef: selection.deviceRef,
          requestedDeviceId: selection.deviceId,
          requestedStableKey: selection.stableKey,
          runtimeHealth,
        },
        ...(response.selectedStableKey || response.selectedDeviceId || response.selectionReason
          ? { selectionReason: mapSelectionReason(response.selectionReason) }
          : {}),
        selectedFacing: selection.facing ?? input.facing,
        ...(response.selectedDeviceId ? { selectedDeviceId: response.selectedDeviceId } : {}),
        ...(response.selectedStableKey
          ? { selectedDeviceRef: buildNativeDesktopDeviceRef(response.selectedStableKey) }
          : {}),
        devices,
        settings: {
          width: input.width,
          height: input.height,
          ...(response.selectedDeviceId ? { deviceId: response.selectedDeviceId } : {}),
        },
        startedAt: response.observedAt,
        updatedAt: response.observedAt,
        error: issues.length
          ? { message: issues.map((issue) => issue.message).join("; ") }
          : undefined,
      },
    };
  }

  async captureSnapshot(
    input: CameraSnapshotRequest,
    context: CameraProviderContext,
  ): Promise<CameraSnapshotResponse> {
    const client = this.requireClient();
    const selection = resolveNativeDesktopSelection(input);
    let response: CameraNativeDesktopHelperCaptureSnapshotResponse;
    try {
      response = await client.captureSnapshot({
        selection,
        constraints: {
          width: input.width,
          height: input.height,
          fit: input.fit,
          mirror: input.mirror,
        },
        delayMs: input.delayMs,
        timeoutMs: input.readyTimeoutMs,
        output: {
          format: "png",
        },
      }, context);
    } catch (error) {
      this.noteFailure("capture_snapshot", error);
      await this.persistRuntimeHealth(context);
      throw error;
    }
    const issues = response.issues?.map(mapIssue) ?? [];
    const providerStatus = response.helperStatus === "error" ? "unavailable" : issues.some((issue) => issue.severity === "warning" || issue.severity === "error")
      ? "degraded"
      : "available";
    const runtimeHealth = this.noteSuccess({
      operation: "capture_snapshot",
      observedAt: response.observedAt,
      providerStatus,
      helperStatus: response.helperStatus,
      permissionState: response.permissionState,
      issues,
    });
    await this.persistRuntimeHealth(context);
    return {
      provider: "native_desktop",
      path: response.artifact.path,
      state: {
        status: response.helperStatus === "error" ? "error" : "ready",
        providerStatus,
        permissionState: response.permissionState,
        ...(issues.length > 0 ? { issues } : {}),
        providerMetadata: {
          helperStatus: response.helperStatus,
          requestedDeviceRef: selection.deviceRef,
          requestedDeviceId: selection.deviceId,
          requestedStableKey: selection.stableKey,
          runtimeHealth,
        },
        selectionReason: mapSelectionReason(response.selectionReason),
        selectedFacing: response.device.facing ?? selection.facing ?? input.facing,
        selectedDeviceId: response.device.deviceId,
        selectedDeviceRef: buildNativeDesktopDeviceRef(response.device.stableKey),
        devices: [mapDevice(response.device, response.device.stableKey, response.device.deviceId)],
        videoWidth: response.artifact.width,
        videoHeight: response.artifact.height,
        settings: {
          width: response.artifact.width ?? input.width,
          height: response.artifact.height ?? input.height,
          deviceId: response.device.deviceId,
        },
        startedAt: response.observedAt,
        updatedAt: response.observedAt,
        lastSuccessfulCaptureAt: response.artifact.capturedAt,
        error: issues.length
          ? { message: issues.map((issue) => issue.message).join("; ") }
          : undefined,
      },
    };
  }
}

export const nativeDesktopCameraProvider = new NativeDesktopCameraProvider();
