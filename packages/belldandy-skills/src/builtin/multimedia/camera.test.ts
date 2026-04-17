import { describe, expect, it, vi } from "vitest";

const runtimeMocks = vi.hoisted(() => ({
  normalizeCameraCaptureOptions: vi.fn((args: Record<string, unknown>) => args),
  normalizeCameraListOptions: vi.fn((args: Record<string, unknown>) => args),
}));

const registryMocks = vi.hoisted(() => ({
  captureCameraSnapshot: vi.fn(),
  listCameraDevices: vi.fn(),
}));

vi.mock("./camera-runtime.js", () => ({
  normalizeCameraCaptureOptions: runtimeMocks.normalizeCameraCaptureOptions,
  normalizeCameraListOptions: runtimeMocks.normalizeCameraListOptions,
}));

vi.mock("./camera-provider-registry.js", () => ({
  captureCameraSnapshot: registryMocks.captureCameraSnapshot,
  listCameraDevices: registryMocks.listCameraDevices,
}));

import { cameraListTool, cameraSnapTool } from "./camera.js";

describe("camera tools", () => {
  it("returns a stop error when camera_snap is aborted", async () => {
    const error = new Error("Stopped by user.");
    error.name = "AbortError";
    registryMocks.captureCameraSnapshot.mockRejectedValueOnce(error);

    const result = await cameraSnapTool.execute({}, {
      conversationId: "conv-camera",
      workspaceRoot: "/tmp/test",
      policy: {
        allowedPaths: [],
        deniedPaths: [],
        allowedDomains: [],
        deniedDomains: [],
        maxTimeoutMs: 5_000,
        maxResponseBytes: 1024 * 1024,
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Stopped by user.");
  });

  it("returns a stop error when camera_list is aborted", async () => {
    const error = new Error("Stopped by user.");
    error.name = "AbortError";
    registryMocks.listCameraDevices.mockRejectedValueOnce(error);

    const result = await cameraListTool.execute({}, {
      conversationId: "conv-camera",
      workspaceRoot: "/tmp/test",
      policy: {
        allowedPaths: [],
        deniedPaths: [],
        allowedDomains: [],
        deniedDomains: [],
        maxTimeoutMs: 5_000,
        maxResponseBytes: 1024 * 1024,
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe("Stopped by user.");
  });

  it("forwards provider-aware options to the registry layer", async () => {
    registryMocks.listCameraDevices.mockResolvedValueOnce({
      provider: "browser_loopback",
      mirrorUrl: "http://127.0.0.1:28889/mirror.html",
      state: {
        status: "ready",
        selectedFacing: "front",
        selectedDeviceRef: "browser_loopback:facing:front",
        devices: [],
      },
    });

    await cameraListTool.execute({
      provider: "browser_loopback",
      deviceRef: "browser_loopback:facing:front",
    }, {
      conversationId: "conv-camera",
      workspaceRoot: "/tmp/test",
      policy: {
        allowedPaths: [],
        deniedPaths: [],
        allowedDomains: [],
        deniedDomains: [],
        maxTimeoutMs: 5_000,
        maxResponseBytes: 1024 * 1024,
      },
    });

    expect(runtimeMocks.normalizeCameraListOptions).toHaveBeenCalledWith({
      provider: "browser_loopback",
      deviceRef: "browser_loopback:facing:front",
    });
    expect(registryMocks.listCameraDevices).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        provider: "browser_loopback",
        deviceRef: "browser_loopback:facing:front",
      }),
    );
  });

  it("surfaces device_busy with a targeted camera_snap error message", async () => {
    registryMocks.captureCameraSnapshot.mockRejectedValueOnce(
      new Error("device_busy: Selected device \"OBSBOT Tiny 2 StreamCamera\" appears to be busy or locked by another application."),
    );

    const result = await cameraSnapTool.execute({
      provider: "native_desktop",
    }, {
      conversationId: "conv-camera",
      workspaceRoot: "/tmp/test",
      policy: {
        allowedPaths: [],
        deniedPaths: [],
        allowedDomains: [],
        deniedDomains: [],
        maxTimeoutMs: 5_000,
        maxResponseBytes: 1024 * 1024,
      },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("摄像头当前被其他应用占用");
    expect(result.error).toContain("请先关闭正在使用该摄像头的会议或录制软件后重试");
    expect(result.error).not.toContain("请确认所选 provider 已注册");
  });
});
