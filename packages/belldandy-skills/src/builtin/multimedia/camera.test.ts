import { describe, expect, it, vi } from "vitest";

const runtimeMocks = vi.hoisted(() => ({
  normalizeCameraCaptureOptions: vi.fn((args: Record<string, unknown>) => args),
  normalizeCameraListOptions: vi.fn((args: Record<string, unknown>) => args),
}));

const registryMocks = vi.hoisted(() => ({
  captureCameraSnapshot: vi.fn(),
  listCameraDevices: vi.fn(),
}));

const aliasStateMocks = vi.hoisted(() => ({
  listCameraDeviceAliasMemoryEntries: vi.fn(),
  upsertCameraDeviceAliasMemoryEntry: vi.fn(),
  removeCameraDeviceAliasMemoryEntry: vi.fn(),
}));

vi.mock("./camera-runtime.js", () => ({
  normalizeCameraCaptureOptions: runtimeMocks.normalizeCameraCaptureOptions,
  normalizeCameraListOptions: runtimeMocks.normalizeCameraListOptions,
}));

vi.mock("./camera-provider-registry.js", () => ({
  captureCameraSnapshot: registryMocks.captureCameraSnapshot,
  listCameraDevices: registryMocks.listCameraDevices,
}));

vi.mock("./camera-device-alias-state.js", () => ({
  listCameraDeviceAliasMemoryEntries: aliasStateMocks.listCameraDeviceAliasMemoryEntries,
  upsertCameraDeviceAliasMemoryEntry: aliasStateMocks.upsertCameraDeviceAliasMemoryEntry,
  removeCameraDeviceAliasMemoryEntry: aliasStateMocks.removeCameraDeviceAliasMemoryEntry,
}));

import { cameraDeviceMemoryTool, cameraListTool, cameraSnapTool } from "./camera.js";

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
    expect(result.error).toContain("关闭正在占用摄像头的会议或录制软件后重试");
    expect(result.error).not.toContain("请确认所选 provider 已注册");
  });

  it("surfaces helper_unavailable with a targeted camera_snap recovery hint", async () => {
    registryMocks.captureCameraSnapshot.mockRejectedValueOnce(
      new Error("helper_unavailable: helper process exited before handshake"),
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
    expect(result.error).toContain("当前摄像头 provider 环境未就绪");
    expect(result.error).toContain("核对 helper 启动命令、cwd、helper entry 与相关环境变量");
    expect(result.error).not.toContain("请确认所选 provider 已注册");
  });

  it("lists remembered camera device memory entries from stateDir", async () => {
    aliasStateMocks.listCameraDeviceAliasMemoryEntries.mockResolvedValueOnce({
      entries: [
        {
          identityKey: "native_desktop:stable:usb-123",
          provider: "native_desktop",
          deviceRef: "native_desktop:device:usb-123",
          stableKey: "usb-123",
          learnedAlias: "Desk Cam",
          alias: "Studio Cam",
          aliasSource: "manual",
          manualAlias: "Studio Cam",
          favorite: true,
          firstSeenAt: "2026-04-17T12:00:00.000Z",
          lastSeenAt: "2026-04-17T12:01:00.000Z",
          labels: ["Desk Cam"],
        },
      ],
      summary: {
        entryCount: 1,
        observedCount: 0,
        manualAliasCount: 1,
        favoriteCount: 1,
        snapshotPath: "/tmp/device-aliases.json",
      },
    });

    const result = await cameraDeviceMemoryTool.execute({
      action: "list",
      provider: "native_desktop",
    }, {
      conversationId: "conv-camera",
      workspaceRoot: "/tmp/test",
      stateDir: "/tmp/state",
      policy: {
        allowedPaths: [],
        deniedPaths: [],
        allowedDomains: [],
        deniedDomains: [],
        maxTimeoutMs: 5_000,
        maxResponseBytes: 1024 * 1024,
      },
    });

    expect(result.success).toBe(true);
    expect(aliasStateMocks.listCameraDeviceAliasMemoryEntries).toHaveBeenCalledWith("/tmp/state", {
      provider: "native_desktop",
    });
    expect(result.output).toContain("\"alias\": \"Studio Cam\"");
  });

  it("updates manual alias and favorite through camera_device_memory", async () => {
    aliasStateMocks.upsertCameraDeviceAliasMemoryEntry.mockResolvedValueOnce({
      entry: {
        identityKey: "native_desktop:stable:usb-123",
        provider: "native_desktop",
        deviceRef: "native_desktop:device:usb-123",
        stableKey: "usb-123",
        learnedAlias: "Desk Cam",
        alias: "Studio Cam",
        aliasSource: "manual",
        manualAlias: "Studio Cam",
        favorite: true,
        firstSeenAt: "2026-04-17T12:00:00.000Z",
        lastSeenAt: "2026-04-17T12:01:00.000Z",
        labels: ["Desk Cam"],
      },
      summary: {
        entryCount: 1,
        observedCount: 0,
        manualAliasCount: 1,
        favoriteCount: 1,
        snapshotPath: "/tmp/device-aliases.json",
      },
    });

    const result = await cameraDeviceMemoryTool.execute({
      action: "upsert",
      deviceRef: "native_desktop:device:usb-123",
      stableKey: "usb-123",
      alias: "Studio Cam",
      favorite: true,
    }, {
      conversationId: "conv-camera",
      workspaceRoot: "/tmp/test",
      stateDir: "/tmp/state",
      policy: {
        allowedPaths: [],
        deniedPaths: [],
        allowedDomains: [],
        deniedDomains: [],
        maxTimeoutMs: 5_000,
        maxResponseBytes: 1024 * 1024,
      },
    });

    expect(result.success).toBe(true);
    expect(aliasStateMocks.upsertCameraDeviceAliasMemoryEntry).toHaveBeenCalledWith("/tmp/state", {
      deviceRef: "native_desktop:device:usb-123",
      stableKey: "usb-123",
      alias: "Studio Cam",
      favorite: true,
    });
  });

  it("fails clearly when camera_device_memory is used without stateDir", async () => {
    const result = await cameraDeviceMemoryTool.execute({
      action: "list",
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
    expect(result.error).toContain("camera_device_memory requires stateDir");
  });
});
