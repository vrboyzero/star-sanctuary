import type {
  CameraDeviceSource,
  CameraDeviceTransport,
  CameraFacing,
  CameraFit,
  CameraListRequest,
  CameraPermissionState,
  CameraProviderCapabilities,
  CameraProviderContext,
  CameraProviderDiagnostic,
  CameraSelectionReason,
  CameraSnapshotRequest,
} from "./camera-contract.js";

export const CAMERA_NATIVE_DESKTOP_PROTOCOL_ID = "camera-native-desktop/v1";

export const CAMERA_NATIVE_DESKTOP_TRANSPORTS = [
  "stdio",
] as const;

export type CameraNativeDesktopTransport = typeof CAMERA_NATIVE_DESKTOP_TRANSPORTS[number];
export type CameraNativeDesktopHelperStatus = "stopped" | "starting" | "ready" | "error";
export type CameraNativeDesktopProviderStatus = CameraProviderDiagnostic["status"];
export type CameraNativeDesktopPermissionState = CameraPermissionState;
export type CameraNativeDesktopSelectionReason = CameraSelectionReason;
export type CameraNativeDesktopSnapshotFormat = "png" | "jpeg";
export type CameraNativeDesktopClipFormat = "mp4" | "webm";
export type CameraNativeDesktopPlatform = "windows";

export type CameraNativeDesktopHelperConfig = {
  protocol: typeof CAMERA_NATIVE_DESKTOP_PROTOCOL_ID;
  transport: CameraNativeDesktopTransport;
  command: string;
  args?: string[];
  env?: Record<string, string>;
  cwd?: string;
  startupTimeoutMs?: number;
  requestTimeoutMs?: number;
  idleShutdownMs?: number;
};

export type CameraNativeDesktopHelperCapabilities = CameraProviderCapabilities & {
  stillFormats: CameraNativeDesktopSnapshotFormat[];
  clipFormats: CameraNativeDesktopClipFormat[];
  selectionByStableKey: boolean;
  deviceChangeEvents: boolean;
};

export type CameraNativeDesktopHelperIssue = {
  code:
    | "helper_not_configured"
    | "helper_unavailable"
    | "protocol_mismatch"
    | "permission_denied"
    | "device_not_found"
    | "device_busy"
    | "driver_error"
    | "capture_failed"
    | "timeout"
    | "unsupported_method"
    | "unknown";
  severity: "info" | "warning" | "error";
  message: string;
  retryable?: boolean;
  metadata?: Record<string, unknown>;
};

export type CameraNativeDesktopDeviceMetadata = {
  hardwarePath?: string;
  instancePath?: string;
  vendorId?: string;
  productId?: string;
  serialNumber?: string;
  manufacturer?: string;
  model?: string;
  driverProvider?: string;
  driverVersion?: string;
  busType?: string;
  pnpClass?: string;
  service?: string;
  classGuid?: string;
  status?: string;
  captureSupported?: boolean;
  ffmpegDeviceName?: string;
  ffmpegAlternativeNames?: string[];
};

export type CameraNativeDesktopHelperDevice = {
  deviceId: string;
  stableKey: string;
  label: string;
  facing?: CameraFacing;
  source: CameraDeviceSource;
  transport: Extract<CameraDeviceTransport, "native">;
  external: boolean;
  available: boolean;
  busy?: boolean;
  kind: "videoinput";
  metadata?: CameraNativeDesktopDeviceMetadata;
};

export type CameraNativeDesktopDeviceSelection = {
  deviceId?: string;
  deviceRef?: string;
  stableKey?: string;
  facing?: CameraFacing;
};

export type CameraNativeDesktopCaptureConstraints = {
  width?: number;
  height?: number;
  fit?: CameraFit;
  mirror?: boolean;
};

export type CameraNativeDesktopSnapshotArtifact = {
  path: string;
  format: CameraNativeDesktopSnapshotFormat;
  width?: number;
  height?: number;
  sizeBytes?: number;
  capturedAt: string;
};

export type CameraNativeDesktopClipArtifact = {
  path: string;
  format: CameraNativeDesktopClipFormat;
  width?: number;
  height?: number;
  durationMs?: number;
  sizeBytes?: number;
  capturedAt: string;
};

export type CameraNativeDesktopHelperHelloRequest = {
  clientName: "belldandy-gateway";
  clientVersion?: string;
  conversationId?: string;
  workspaceRoot?: string;
};

export type CameraNativeDesktopHelperHelloResponse = {
  protocol: typeof CAMERA_NATIVE_DESKTOP_PROTOCOL_ID;
  helperVersion: string;
  platform: CameraNativeDesktopPlatform;
  transport: CameraNativeDesktopTransport;
  helperStatus: CameraNativeDesktopHelperStatus;
  capabilities: CameraNativeDesktopHelperCapabilities;
};

export type CameraNativeDesktopHelperDiagnoseRequest = {
  includeDevices?: boolean;
  includePermissionState?: boolean;
  includeCapabilities?: boolean;
};

export type CameraNativeDesktopHelperDiagnoseResponse = {
  status: CameraNativeDesktopProviderStatus;
  helperStatus: CameraNativeDesktopHelperStatus;
  permissionState: CameraNativeDesktopPermissionState;
  observedAt: string;
  issues: CameraNativeDesktopHelperIssue[];
  devices?: CameraNativeDesktopHelperDevice[];
  capabilities?: CameraNativeDesktopHelperCapabilities;
  helperVersion?: string;
};

export type CameraNativeDesktopHelperListDevicesRequest = {
  selection?: CameraNativeDesktopDeviceSelection;
  includeUnavailable?: boolean;
  includeBusy?: boolean;
};

export type CameraNativeDesktopHelperListDevicesResponse = {
  observedAt: string;
  helperStatus: CameraNativeDesktopHelperStatus;
  permissionState: CameraNativeDesktopPermissionState;
  devices: CameraNativeDesktopHelperDevice[];
  selectedDeviceId?: string;
  selectedStableKey?: string;
  selectionReason?: CameraNativeDesktopSelectionReason;
  issues?: CameraNativeDesktopHelperIssue[];
};

export type CameraNativeDesktopHelperCaptureSnapshotRequest = {
  selection?: CameraNativeDesktopDeviceSelection;
  constraints?: CameraNativeDesktopCaptureConstraints;
  output?: {
    filePath?: string;
    format?: CameraNativeDesktopSnapshotFormat;
  };
  delayMs?: number;
  timeoutMs?: number;
};

export type CameraNativeDesktopHelperCaptureSnapshotResponse = {
  observedAt: string;
  helperStatus: CameraNativeDesktopHelperStatus;
  permissionState: CameraNativeDesktopPermissionState;
  device: CameraNativeDesktopHelperDevice;
  selectionReason?: CameraNativeDesktopSelectionReason;
  artifact: CameraNativeDesktopSnapshotArtifact;
  issues?: CameraNativeDesktopHelperIssue[];
};

export type CameraNativeDesktopHelperCaptureClipRequest = {
  selection?: CameraNativeDesktopDeviceSelection;
  constraints?: CameraNativeDesktopCaptureConstraints;
  output?: {
    filePath?: string;
    format?: CameraNativeDesktopClipFormat;
  };
  durationMs: number;
  includeAudio?: boolean;
  timeoutMs?: number;
};

export type CameraNativeDesktopHelperCaptureClipResponse = {
  observedAt: string;
  helperStatus: CameraNativeDesktopHelperStatus;
  permissionState: CameraNativeDesktopPermissionState;
  device: CameraNativeDesktopHelperDevice;
  selectionReason?: CameraNativeDesktopSelectionReason;
  artifact: CameraNativeDesktopClipArtifact;
  issues?: CameraNativeDesktopHelperIssue[];
};

export type CameraNativeDesktopHelperShutdownRequest = {
  reason?: "manual" | "idle-timeout" | "upgrade";
};

export type CameraNativeDesktopHelperShutdownResponse = {
  acknowledged: boolean;
  observedAt: string;
};

export interface CameraNativeDesktopHelperClient {
  hello(
    input: CameraNativeDesktopHelperHelloRequest,
    context: CameraProviderContext,
  ): Promise<CameraNativeDesktopHelperHelloResponse>;
  diagnose(
    input: CameraNativeDesktopHelperDiagnoseRequest,
    context: CameraProviderContext,
  ): Promise<CameraNativeDesktopHelperDiagnoseResponse>;
  listDevices(
    input: CameraNativeDesktopHelperListDevicesRequest,
    context: CameraProviderContext,
  ): Promise<CameraNativeDesktopHelperListDevicesResponse>;
  captureSnapshot(
    input: CameraNativeDesktopHelperCaptureSnapshotRequest,
    context: CameraProviderContext,
  ): Promise<CameraNativeDesktopHelperCaptureSnapshotResponse>;
  captureClip?(
    input: CameraNativeDesktopHelperCaptureClipRequest,
    context: CameraProviderContext,
  ): Promise<CameraNativeDesktopHelperCaptureClipResponse>;
  shutdown?(
    input: CameraNativeDesktopHelperShutdownRequest,
    context: CameraProviderContext,
  ): Promise<CameraNativeDesktopHelperShutdownResponse>;
}

export type CameraNativeDesktopProviderOptions = {
  helper?: CameraNativeDesktopHelperConfig;
  client?: CameraNativeDesktopHelperClient | null;
};

export function buildNativeDesktopDeviceRef(stableKey: string): string {
  return `native_desktop:device:${encodeURIComponent(stableKey)}`;
}

export function buildNativeDesktopFacingDeviceRef(facing: CameraFacing): string {
  return `native_desktop:facing:${facing}`;
}

export function parseNativeDesktopDeviceRef(
  deviceRef: string | undefined,
): {
  stableKey?: string;
  facing?: CameraFacing;
} {
  const normalized = typeof deviceRef === "string" ? deviceRef.trim() : "";
  if (!normalized) {
    return {};
  }
  const parts = normalized.split(":");
  if (parts[0] !== "native_desktop") {
    throw new Error(`deviceRef does not belong to native_desktop: ${normalized}`);
  }
  if (parts[1] === "device") {
    const encodedStableKey = parts.slice(2).join(":");
    if (!encodedStableKey) {
      throw new Error(`Invalid native_desktop deviceRef: ${normalized}`);
    }
    return {
      stableKey: decodeURIComponent(encodedStableKey),
    };
  }
  if (parts[1] === "facing" && (parts[2] === "front" || parts[2] === "back")) {
    return {
      facing: parts[2],
    };
  }
  if (parts.length === 2 && (parts[1] === "front" || parts[1] === "back")) {
    return {
      facing: parts[1],
    };
  }
  throw new Error(`Unsupported native_desktop deviceRef: ${normalized}`);
}

export function resolveNativeDesktopSelection(
  input: CameraListRequest | CameraSnapshotRequest,
): CameraNativeDesktopDeviceSelection {
  const parsedRef = parseNativeDesktopDeviceRef(input.deviceRef);
  if (input.deviceId && parsedRef.stableKey) {
    throw new Error("deviceId and native_desktop deviceRef cannot be combined for different identity modes.");
  }
  return {
    deviceId: input.deviceId,
    deviceRef: input.deviceRef,
    stableKey: parsedRef.stableKey,
    facing: parsedRef.facing ?? input.facing,
  };
}
