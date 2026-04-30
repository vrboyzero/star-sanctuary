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
  screenTargetList?: boolean;
  screenCapture?: boolean;
  windowCapture?: boolean;
  displayCapture?: boolean;
  regionCapture?: boolean;
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
    | "target_not_found"
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

export type CameraNativeDesktopScreenRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type CameraNativeDesktopDisplayTarget = {
  id: string;
  displayRef: string;
  name: string;
  isPrimary: boolean;
  bounds: CameraNativeDesktopScreenRect;
  workArea?: CameraNativeDesktopScreenRect;
};

export type CameraNativeDesktopWindowTarget = {
  id: string;
  windowRef: string;
  title: string;
  appName?: string;
  processId?: number;
  isVisible: boolean;
  isMinimized: boolean;
  bounds: CameraNativeDesktopScreenRect;
  displayId?: string;
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

export type CameraNativeDesktopListCaptureTargetsRequest = {
  includeDisplays?: boolean;
  includeWindows?: boolean;
  includeMinimizedWindows?: boolean;
  windowTitleFilter?: string;
};

export type CameraNativeDesktopListCaptureTargetsResponse = {
  observedAt: string;
  helperStatus: CameraNativeDesktopHelperStatus;
  permissionState: CameraNativeDesktopPermissionState;
  displays?: CameraNativeDesktopDisplayTarget[];
  windows?: CameraNativeDesktopWindowTarget[];
  issues?: CameraNativeDesktopHelperIssue[];
};

export type CameraNativeDesktopScreenCaptureTarget =
  | {
    kind: "desktop";
  }
  | {
    kind: "display";
    displayId?: string;
    displayRef?: string;
  }
  | {
    kind: "window";
    windowId?: string;
    windowRef?: string;
    windowTitle?: string;
  }
  | ({
    kind: "region";
  } & CameraNativeDesktopScreenRect);

export type CameraNativeDesktopCaptureScreenRequest = {
  target: CameraNativeDesktopScreenCaptureTarget;
  output?: {
    filePath?: string;
    format?: CameraNativeDesktopSnapshotFormat;
  };
  delayMs?: number;
  timeoutMs?: number;
  includeCursor?: boolean;
};

export type CameraNativeDesktopCaptureScreenResponse = {
  observedAt: string;
  helperStatus: CameraNativeDesktopHelperStatus;
  permissionState: CameraNativeDesktopPermissionState;
  target: CameraNativeDesktopScreenCaptureTarget;
  artifact: CameraNativeDesktopSnapshotArtifact;
  display?: CameraNativeDesktopDisplayTarget;
  window?: CameraNativeDesktopWindowTarget;
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
  listCaptureTargets?(
    input: CameraNativeDesktopListCaptureTargetsRequest,
    context: CameraProviderContext,
  ): Promise<CameraNativeDesktopListCaptureTargetsResponse>;
  captureSnapshot(
    input: CameraNativeDesktopHelperCaptureSnapshotRequest,
    context: CameraProviderContext,
  ): Promise<CameraNativeDesktopHelperCaptureSnapshotResponse>;
  captureScreen?(
    input: CameraNativeDesktopCaptureScreenRequest,
    context: CameraProviderContext,
  ): Promise<CameraNativeDesktopCaptureScreenResponse>;
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

export function buildNativeDesktopDisplayRef(displayId: string): string {
  return `native_desktop:display:${encodeURIComponent(displayId)}`;
}

export function buildNativeDesktopWindowRef(windowId: string): string {
  return `native_desktop:window:${encodeURIComponent(windowId)}`;
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

export function parseNativeDesktopDisplayRef(displayRef: string | undefined): {
  displayId?: string;
} {
  const normalized = typeof displayRef === "string" ? displayRef.trim() : "";
  if (!normalized) {
    return {};
  }
  const parts = normalized.split(":");
  if (parts[0] !== "native_desktop" || parts[1] !== "display") {
    throw new Error(`displayRef does not belong to native_desktop display: ${normalized}`);
  }
  const encodedDisplayId = parts.slice(2).join(":");
  if (!encodedDisplayId) {
    throw new Error(`Invalid native_desktop displayRef: ${normalized}`);
  }
  return {
    displayId: decodeURIComponent(encodedDisplayId),
  };
}

export function parseNativeDesktopWindowRef(windowRef: string | undefined): {
  windowId?: string;
} {
  const normalized = typeof windowRef === "string" ? windowRef.trim() : "";
  if (!normalized) {
    return {};
  }
  const parts = normalized.split(":");
  if (parts[0] !== "native_desktop" || parts[1] !== "window") {
    throw new Error(`windowRef does not belong to native_desktop window: ${normalized}`);
  }
  const encodedWindowId = parts.slice(2).join(":");
  if (!encodedWindowId) {
    throw new Error(`Invalid native_desktop windowRef: ${normalized}`);
  }
  return {
    windowId: decodeURIComponent(encodedWindowId),
  };
}
