import crypto from "node:crypto";

import {
  CAMERA_NATIVE_DESKTOP_PROTOCOL_ID,
  type CameraNativeDesktopHelperCaptureClipRequest,
  type CameraNativeDesktopHelperCaptureClipResponse,
  type CameraNativeDesktopHelperCaptureSnapshotRequest,
  type CameraNativeDesktopHelperCaptureSnapshotResponse,
  type CameraNativeDesktopHelperDiagnoseRequest,
  type CameraNativeDesktopHelperDiagnoseResponse,
  type CameraNativeDesktopHelperHelloRequest,
  type CameraNativeDesktopHelperHelloResponse,
  type CameraNativeDesktopHelperIssue,
  type CameraNativeDesktopHelperListDevicesRequest,
  type CameraNativeDesktopHelperListDevicesResponse,
  type CameraNativeDesktopHelperShutdownRequest,
  type CameraNativeDesktopHelperShutdownResponse,
} from "./camera-native-desktop-contract.js";

export const CAMERA_NATIVE_DESKTOP_HELPER_METHODS = [
  "hello",
  "diagnose",
  "list_devices",
  "capture_snapshot",
  "capture_clip",
  "shutdown",
] as const;

export const CAMERA_NATIVE_DESKTOP_HELPER_EVENTS = [
  "device_change",
  "health",
  "log",
] as const;

export type CameraNativeDesktopHelperMethod = typeof CAMERA_NATIVE_DESKTOP_HELPER_METHODS[number];
export type CameraNativeDesktopHelperEventName = typeof CAMERA_NATIVE_DESKTOP_HELPER_EVENTS[number];

export type CameraNativeDesktopHelperProtocolErrorCode =
  | "invalid_request"
  | "protocol_mismatch"
  | "helper_unavailable"
  | "permission_denied"
  | "device_not_found"
  | "device_busy"
  | "capture_failed"
  | "timeout"
  | "unsupported_method"
  | "unknown";

export type CameraNativeDesktopHelperProtocolError = {
  code: CameraNativeDesktopHelperProtocolErrorCode;
  message: string;
  retryable?: boolean;
  issues?: CameraNativeDesktopHelperIssue[];
  metadata?: Record<string, unknown>;
};

export type CameraNativeDesktopHelperRequestParams = {
  hello: CameraNativeDesktopHelperHelloRequest;
  diagnose: CameraNativeDesktopHelperDiagnoseRequest;
  list_devices: CameraNativeDesktopHelperListDevicesRequest;
  capture_snapshot: CameraNativeDesktopHelperCaptureSnapshotRequest;
  capture_clip: CameraNativeDesktopHelperCaptureClipRequest;
  shutdown: CameraNativeDesktopHelperShutdownRequest;
};

export type CameraNativeDesktopHelperResponseResult = {
  hello: CameraNativeDesktopHelperHelloResponse;
  diagnose: CameraNativeDesktopHelperDiagnoseResponse;
  list_devices: CameraNativeDesktopHelperListDevicesResponse;
  capture_snapshot: CameraNativeDesktopHelperCaptureSnapshotResponse;
  capture_clip: CameraNativeDesktopHelperCaptureClipResponse;
  shutdown: CameraNativeDesktopHelperShutdownResponse;
};

export type CameraNativeDesktopHelperRequestMessage<
  TMethod extends CameraNativeDesktopHelperMethod = CameraNativeDesktopHelperMethod,
> = {
  kind: "request";
  protocol: typeof CAMERA_NATIVE_DESKTOP_PROTOCOL_ID;
  id: string;
  method: TMethod;
  params: CameraNativeDesktopHelperRequestParams[TMethod];
};

export type CameraNativeDesktopHelperResponseMessage<
  TMethod extends CameraNativeDesktopHelperMethod = CameraNativeDesktopHelperMethod,
> =
  | {
    kind: "response";
    protocol: typeof CAMERA_NATIVE_DESKTOP_PROTOCOL_ID;
    id: string;
    method: TMethod;
    ok: true;
    result: CameraNativeDesktopHelperResponseResult[TMethod];
  }
  | {
    kind: "response";
    protocol: typeof CAMERA_NATIVE_DESKTOP_PROTOCOL_ID;
    id: string;
    method: TMethod;
    ok: false;
    error: CameraNativeDesktopHelperProtocolError;
  };

export type CameraNativeDesktopHelperEventMessage =
  | {
    kind: "event";
    protocol: typeof CAMERA_NATIVE_DESKTOP_PROTOCOL_ID;
    event: "device_change";
    payload: {
      observedAt: string;
      revision?: string;
      reason: "arrived" | "removed" | "changed" | "refreshed";
    };
  }
  | {
    kind: "event";
    protocol: typeof CAMERA_NATIVE_DESKTOP_PROTOCOL_ID;
    event: "health";
    payload: {
      observedAt: string;
      status: "available" | "unavailable" | "degraded";
      helperStatus: "stopped" | "starting" | "ready" | "error";
      issues?: CameraNativeDesktopHelperIssue[];
    };
  }
  | {
    kind: "event";
    protocol: typeof CAMERA_NATIVE_DESKTOP_PROTOCOL_ID;
    event: "log";
    payload: {
      observedAt: string;
      level: "debug" | "info" | "warn" | "error";
      message: string;
      metadata?: Record<string, unknown>;
    };
  };

export type CameraNativeDesktopHelperMessage =
  | CameraNativeDesktopHelperRequestMessage
  | CameraNativeDesktopHelperResponseMessage
  | CameraNativeDesktopHelperEventMessage;

export function createNativeDesktopHelperRequest<
  TMethod extends CameraNativeDesktopHelperMethod,
>(
  method: TMethod,
  params: CameraNativeDesktopHelperRequestParams[TMethod],
  options: {
    id?: string;
  } = {},
): CameraNativeDesktopHelperRequestMessage<TMethod> {
  return {
    kind: "request",
    protocol: CAMERA_NATIVE_DESKTOP_PROTOCOL_ID,
    id: options.id ?? crypto.randomUUID(),
    method,
    params,
  };
}

export function createNativeDesktopHelperErrorResponse<
  TMethod extends CameraNativeDesktopHelperMethod,
>(
  request: Pick<CameraNativeDesktopHelperRequestMessage<TMethod>, "id" | "method">,
  error: CameraNativeDesktopHelperProtocolError,
): CameraNativeDesktopHelperResponseMessage<TMethod> {
  return {
    kind: "response",
    protocol: CAMERA_NATIVE_DESKTOP_PROTOCOL_ID,
    id: request.id,
    method: request.method,
    ok: false,
    error,
  };
}

export function isNativeDesktopHelperMethod(value: unknown): value is CameraNativeDesktopHelperMethod {
  return typeof value === "string" && CAMERA_NATIVE_DESKTOP_HELPER_METHODS.includes(
    value as CameraNativeDesktopHelperMethod,
  );
}
