import { describe, expect, it } from "vitest";

import {
  CAMERA_NATIVE_DESKTOP_HELPER_METHODS,
  createNativeDesktopHelperErrorResponse,
  createNativeDesktopHelperRequest,
  isNativeDesktopHelperMethod,
} from "./camera-native-desktop-protocol.js";

describe("camera native desktop helper protocol", () => {
  it("creates request envelopes with protocol metadata", () => {
    const request = createNativeDesktopHelperRequest("hello", {
      clientName: "belldandy-gateway",
      workspaceRoot: "E:/project/star-sanctuary",
    }, {
      id: "req-1",
    });

    expect(request).toEqual({
      kind: "request",
      protocol: "camera-native-desktop/v1",
      id: "req-1",
      method: "hello",
      params: {
        clientName: "belldandy-gateway",
        workspaceRoot: "E:/project/star-sanctuary",
      },
    });
  });

  it("creates error responses that preserve request identity", () => {
    const response = createNativeDesktopHelperErrorResponse({
      id: "req-2",
      method: "list_devices",
    }, {
      code: "helper_unavailable",
      message: "helper is offline",
      retryable: true,
    });

    expect(response).toEqual({
      kind: "response",
      protocol: "camera-native-desktop/v1",
      id: "req-2",
      method: "list_devices",
      ok: false,
      error: {
        code: "helper_unavailable",
        message: "helper is offline",
        retryable: true,
      },
    });
  });

  it("recognizes helper methods defined by the protocol", () => {
    expect(isNativeDesktopHelperMethod("capture_snapshot")).toBe(true);
    expect(isNativeDesktopHelperMethod("nope")).toBe(false);
    expect(CAMERA_NATIVE_DESKTOP_HELPER_METHODS).toContain("diagnose");
  });
});
