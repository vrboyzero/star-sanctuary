import type {
  CameraDeviceDescriptor,
  CameraListRequest,
  CameraListResponse,
  CameraPermissionState,
  CameraProvider,
  CameraProviderContext,
  CameraProviderDiagnostic,
  CameraProviderDiagnosticIssue,
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
  type CameraNativeDesktopProviderOptions,
} from "./camera-native-desktop-contract.js";
import { NativeDesktopStdioHelperClient } from "./camera-native-desktop-stdio-client.js";

const NATIVE_DESKTOP_NOT_CONFIGURED_MESSAGE =
  "native_desktop provider 已预留 contract，但 Windows helper client 还未接入。请先完成 helper transport 与部署配置。";

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

  constructor(options: CameraNativeDesktopProviderOptions = {}) {
    this.client = options.client ?? (options.helper ? new NativeDesktopStdioHelperClient(options.helper) : null);
  }

  private requireClient(): CameraNativeDesktopHelperClient {
    if (!this.client) {
      throw new Error(NATIVE_DESKTOP_NOT_CONFIGURED_MESSAGE);
    }
    return this.client;
  }

  async diagnose(
    context: CameraProviderContext,
  ): Promise<CameraProviderDiagnostic> {
    const client = this.requireClient();
    const response = await client.diagnose({
      includeDevices: true,
      includePermissionState: true,
      includeCapabilities: true,
    }, context);
    return {
      provider: "native_desktop",
      status: mapProviderStatus(response.status),
      permissionState: mapPermissionState(response.permissionState),
      capabilities: response.capabilities ?? this.capabilities,
      observedAt: response.observedAt,
      issues: response.issues.map(mapIssue),
      devices: response.devices?.map((device) => mapDevice(device)),
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
    const response = await client.listDevices({
      selection,
      includeUnavailable: true,
      includeBusy: true,
    }, context);
    const devices = response.devices.map((device) => mapDevice(
      device,
      response.selectedStableKey,
      response.selectedDeviceId,
    ));
    const issues = response.issues?.map(mapIssue) ?? [];
    return {
      provider: "native_desktop",
      state: {
        status: response.helperStatus === "error" ? "error" : "ready",
        providerStatus: response.helperStatus === "error" ? "unavailable" : "available",
        permissionState: response.permissionState,
        ...(issues.length > 0 ? { issues } : {}),
        providerMetadata: {
          helperStatus: response.helperStatus,
          requestedDeviceRef: selection.deviceRef,
          requestedDeviceId: selection.deviceId,
          requestedStableKey: selection.stableKey,
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
    const response = await client.captureSnapshot({
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
    const issues = response.issues?.map(mapIssue) ?? [];
    return {
      provider: "native_desktop",
      path: response.artifact.path,
      state: {
        status: response.helperStatus === "error" ? "error" : "ready",
        providerStatus: response.helperStatus === "error" ? "unavailable" : "available",
        permissionState: response.permissionState,
        ...(issues.length > 0 ? { issues } : {}),
        providerMetadata: {
          helperStatus: response.helperStatus,
          requestedDeviceRef: selection.deviceRef,
          requestedDeviceId: selection.deviceId,
          requestedStableKey: selection.stableKey,
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
