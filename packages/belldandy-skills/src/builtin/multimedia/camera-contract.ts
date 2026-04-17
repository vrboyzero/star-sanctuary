import type { ToolContext } from "../../types.js";

export const CAMERA_PROVIDER_IDS = [
  "browser_loopback",
  "native_desktop",
  "node_device",
] as const;

export type CameraProviderId = typeof CAMERA_PROVIDER_IDS[number];
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
export type CameraDeviceSource =
  | "integrated"
  | "external"
  | "virtual"
  | "capture_card"
  | "unknown";
export type CameraDeviceTransport = "browser" | "native" | "node";

export type CameraProviderContext = Pick<
  ToolContext,
  "conversationId" | "logger" | "workspaceRoot" | "policy" | "abortSignal"
>;

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
  issues?: CameraProviderDiagnosticIssue[];
  providerMetadata?: Record<string, unknown>;
  selectionReason?: CameraSelectionReason;
  selectedFacing: CameraFacing;
  selectedDeviceId?: string;
  selectedDeviceRef?: string;
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
}

export function isCameraProviderId(value: unknown): value is CameraProviderId {
  return typeof value === "string" && CAMERA_PROVIDER_IDS.includes(value as CameraProviderId);
}
