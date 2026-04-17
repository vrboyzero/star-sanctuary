import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it, vi } from "vitest";

import { NativeDesktopCameraProvider } from "./camera-native-desktop-provider.js";
import { readCameraRuntimeHealthSnapshot } from "./camera-runtime-health-state.js";

describe("native desktop camera provider", () => {
  it("maps helper device listings into generic camera state", async () => {
    const provider = new NativeDesktopCameraProvider({
      client: {
        hello: vi.fn(),
        diagnose: vi.fn(),
        listDevices: vi.fn(async () => ({
          observedAt: "2026-04-17T08:00:00.000Z",
          helperStatus: "ready",
          permissionState: "granted",
          selectedDeviceId: "dev-1",
          selectedStableKey: "usb-logitech-brio",
          selectionReason: "explicit_device_ref",
          devices: [
            {
              deviceId: "dev-1",
              stableKey: "usb-logitech-brio",
              label: "Logitech Brio",
              source: "external",
              transport: "native",
              external: true,
              available: true,
              kind: "videoinput",
              metadata: {
                hardwarePath: "USB#VID_046D&PID_085E",
              },
            },
          ],
        })),
        captureSnapshot: vi.fn(),
      },
    });

    const result = await provider.listDevices({
      facing: "front",
      deviceRef: "native_desktop:device:usb-logitech-brio",
      width: 1920,
      height: 1080,
      fit: "cover",
      mirror: false,
      readyTimeoutMs: 15_000,
    }, {
      conversationId: "conv-camera",
      workspaceRoot: "E:/project/star-sanctuary",
      policy: {
        allowedPaths: [],
        deniedPaths: [],
        allowedDomains: [],
        deniedDomains: [],
        maxTimeoutMs: 5_000,
        maxResponseBytes: 1024 * 1024,
      },
    });

    expect(result).toMatchObject({
      provider: "native_desktop",
      state: {
        status: "ready",
        providerStatus: "available",
        permissionState: "granted",
        selectionReason: "explicit_device_ref",
        selectedDeviceId: "dev-1",
        selectedDeviceRef: "native_desktop:device:usb-logitech-brio",
        providerMetadata: {
          helperStatus: "ready",
          requestedDeviceRef: "native_desktop:device:usb-logitech-brio",
        },
        devices: [
          expect.objectContaining({
            provider: "native_desktop",
            stableKey: "usb-logitech-brio",
            active: true,
          }),
        ],
      },
    });
  });

  it("maps helper snapshot results into generic artifact responses", async () => {
    const provider = new NativeDesktopCameraProvider({
      client: {
        hello: vi.fn(),
        diagnose: vi.fn(),
        listDevices: vi.fn(),
        captureSnapshot: vi.fn(async () => ({
          observedAt: "2026-04-17T08:01:00.000Z",
          helperStatus: "ready",
          permissionState: "granted",
          selectionReason: "explicit_stable_key",
          device: {
            deviceId: "dev-2",
            stableKey: "capture-card-main",
            label: "Capture Card",
            source: "capture_card",
            transport: "native",
            external: true,
            available: true,
            kind: "videoinput",
            busy: false,
          },
          artifact: {
            path: "E:/project/star-sanctuary/screenshots/camera-device.png",
            format: "png",
            width: 1280,
            height: 720,
            capturedAt: "2026-04-17T08:01:01.000Z",
          },
          issues: [
            {
              code: "device_not_found",
              severity: "warning",
              message: "Selection fell back to the current stable device after helper restart.",
              retryable: true,
            },
          ],
        })),
      },
    });

    const result = await provider.captureSnapshot({
      facing: "front",
      deviceRef: "native_desktop:device:capture-card-main",
      width: 1280,
      height: 720,
      fit: "contain",
      mirror: false,
      delayMs: 0,
      readyTimeoutMs: 15_000,
    }, {
      conversationId: "conv-camera",
      workspaceRoot: "E:/project/star-sanctuary",
      policy: {
        allowedPaths: [],
        deniedPaths: [],
        allowedDomains: [],
        deniedDomains: [],
        maxTimeoutMs: 5_000,
        maxResponseBytes: 1024 * 1024,
      },
    });

    expect(result).toMatchObject({
      provider: "native_desktop",
      path: "E:/project/star-sanctuary/screenshots/camera-device.png",
      state: {
        status: "ready",
        providerStatus: "degraded",
        providerMetadata: {
          helperStatus: "ready",
          requestedDeviceRef: "native_desktop:device:capture-card-main",
        },
        issues: [
          expect.objectContaining({
            code: "device_not_found",
            severity: "warning",
          }),
        ],
        selectedDeviceId: "dev-2",
        selectedDeviceRef: "native_desktop:device:capture-card-main",
        lastSuccessfulCaptureAt: "2026-04-17T08:01:01.000Z",
        error: {
          message: expect.stringContaining("Selection fell back to the current stable device after helper restart."),
        },
      },
    });
  });

  it("returns a clear error when the helper client is not configured", async () => {
    const provider = new NativeDesktopCameraProvider();

    await expect(provider.listDevices({
      facing: "front",
      width: 1920,
      height: 1080,
      fit: "cover",
      mirror: false,
      readyTimeoutMs: 15_000,
    }, {
      conversationId: "conv-camera",
      workspaceRoot: "E:/project/star-sanctuary",
      policy: {
        allowedPaths: [],
        deniedPaths: [],
        allowedDomains: [],
        deniedDomains: [],
        maxTimeoutMs: 5_000,
        maxResponseBytes: 1024 * 1024,
      },
    })).rejects.toThrow("Windows helper client 还未接入");
  });

  it("does not echo a stale selectedDeviceRef when the requested device is unavailable", async () => {
    const provider = new NativeDesktopCameraProvider({
      client: {
        hello: vi.fn(),
        diagnose: vi.fn(),
        listDevices: vi.fn(async () => ({
          observedAt: "2026-04-17T09:40:00.000Z",
          helperStatus: "ready",
          permissionState: "not_applicable",
          devices: [
            {
              deviceId: "printer-1",
              stableKey: "camera-hp-deskjet-4800-series-a93a61-b53eca87",
              label: "HP DeskJet 4800 series [A93A61]",
              source: "unknown",
              transport: "native",
              external: false,
              available: true,
              kind: "videoinput",
            },
          ],
          issues: [
            {
              code: "device_not_found",
              severity: "warning",
              message: "Requested native_desktop camera device is not currently available.",
            },
          ],
        })),
        captureSnapshot: vi.fn(),
      },
    });

    const result = await provider.listDevices({
      facing: "front",
      deviceRef: "native_desktop:device:usb-3564-fef8-453a4b75",
      width: 1920,
      height: 1080,
      fit: "cover",
      mirror: false,
      readyTimeoutMs: 15_000,
    }, {
      conversationId: "conv-camera",
      workspaceRoot: "E:/project/star-sanctuary",
      policy: {
        allowedPaths: [],
        deniedPaths: [],
        allowedDomains: [],
        deniedDomains: [],
        maxTimeoutMs: 5_000,
        maxResponseBytes: 1024 * 1024,
      },
    });

    expect(result.state.selectedDeviceRef).toBeUndefined();
    expect(result.state.selectionReason).toBeUndefined();
    expect(result.state.issues).toEqual([
      expect.objectContaining({
        code: "device_not_found",
        severity: "warning",
      }),
    ]);
    expect(result.state.providerMetadata).toEqual(expect.objectContaining({
      helperStatus: "ready",
      requestedDeviceRef: "native_desktop:device:usb-3564-fef8-453a4b75",
    }));
    expect(result.state.error?.message).toContain("Requested native_desktop camera device is not currently available.");
  });

  it("tracks recent failure and recovery in runtime health metadata", async () => {
    const captureSnapshot = vi.fn()
      .mockRejectedValueOnce(new Error("device_busy: OBSBOT Tiny 2 StreamCamera is currently busy."))
      .mockResolvedValueOnce({
        observedAt: "2026-04-17T11:20:00.000Z",
        helperStatus: "ready",
        permissionState: "granted",
        selectionReason: "first_available",
        device: {
          deviceId: "dev-3",
          stableKey: "usb-3564-fef8-453a4b75",
          label: "OBSBOT Tiny 2 StreamCamera",
          source: "external",
          transport: "native",
          external: true,
          available: true,
          kind: "videoinput",
          busy: false,
        },
        artifact: {
          path: "E:/project/star-sanctuary/screenshots/camera-recovered.png",
          format: "png",
          width: 1280,
          height: 720,
          capturedAt: "2026-04-17T11:20:01.000Z",
        },
      });
    const provider = new NativeDesktopCameraProvider({
      client: {
        hello: vi.fn(),
        diagnose: vi.fn(),
        listDevices: vi.fn(),
        captureSnapshot,
      },
    });
    const context = {
      conversationId: "conv-camera",
      workspaceRoot: "E:/project/star-sanctuary",
      policy: {
        allowedPaths: [],
        deniedPaths: [],
        allowedDomains: [],
        deniedDomains: [],
        maxTimeoutMs: 5_000,
        maxResponseBytes: 1024 * 1024,
      },
    };

    await expect(provider.captureSnapshot({
      facing: "front",
      width: 1280,
      height: 720,
      fit: "contain",
      mirror: false,
      delayMs: 0,
      readyTimeoutMs: 15_000,
    }, context)).rejects.toThrow("device_busy");

    expect(provider.getRuntimeHealth()).toMatchObject({
        status: "error",
        consecutiveFailures: 1,
        lastOperation: "capture_snapshot",
        historyWindow: {
        size: 32,
        eventCount: 1,
        successCount: 0,
        failureCount: 1,
        recoveredSuccessCount: 0,
        failureCodeCounts: {
          device_busy: 1,
        },
        lastEvents: [
          expect.objectContaining({
            outcome: "failure",
            operation: "capture_snapshot",
            code: "device_busy",
          }),
        ],
      },
      lastFailure: {
        code: "device_busy",
        operation: "capture_snapshot",
        message: "OBSBOT Tiny 2 StreamCamera is currently busy.",
        recoveryHint: "关闭正在占用摄像头的会议或录制软件后重试。",
      },
    });

    const recovered = await provider.captureSnapshot({
      facing: "front",
      width: 1280,
      height: 720,
      fit: "contain",
      mirror: false,
      delayMs: 0,
      readyTimeoutMs: 15_000,
    }, context);

    expect(recovered.state.providerMetadata).toEqual(expect.objectContaining({
      runtimeHealth: expect.objectContaining({
        status: "healthy",
        consecutiveFailures: 0,
        lastSuccessAt: "2026-04-17T11:20:00.000Z",
        lastRecoveryAt: "2026-04-17T11:20:00.000Z",
        historyWindow: expect.objectContaining({
          eventCount: 2,
          successCount: 1,
          failureCount: 1,
          recoveredSuccessCount: 1,
          failureCodeCounts: {
            device_busy: 1,
          },
          lastEvents: expect.arrayContaining([
            expect.objectContaining({
              outcome: "failure",
              code: "device_busy",
            }),
            expect.objectContaining({
              outcome: "success",
              operation: "capture_snapshot",
              recovered: true,
            }),
          ]),
        }),
        lastFailure: expect.objectContaining({
          code: "device_busy",
          recoveryHint: "关闭正在占用摄像头的会议或录制软件后重试。",
        }),
      }),
    }));
  });

  it("persists runtime health snapshots under stateDir diagnostics", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "camera-runtime-health-state-"));
    const provider = new NativeDesktopCameraProvider({
      client: {
        hello: vi.fn(),
        diagnose: vi.fn(),
        listDevices: vi.fn(),
        captureSnapshot: vi.fn(async () => ({
          observedAt: "2026-04-17T12:00:00.000Z",
          helperStatus: "ready",
          permissionState: "granted",
          selectionReason: "first_available",
          device: {
            deviceId: "dev-3",
            stableKey: "usb-3564-fef8-453a4b75",
            label: "OBSBOT Tiny 2 StreamCamera",
            source: "external",
            transport: "native",
            external: true,
            available: true,
            kind: "videoinput",
            busy: false,
          },
          artifact: {
            path: "E:/project/star-sanctuary/screenshots/camera-recovered.png",
            format: "png",
            width: 1280,
            height: 720,
            capturedAt: "2026-04-17T12:00:01.000Z",
          },
        })),
      },
    });

    try {
      await provider.captureSnapshot({
        facing: "front",
        width: 1280,
        height: 720,
        fit: "contain",
        mirror: false,
        delayMs: 0,
        readyTimeoutMs: 15_000,
      }, {
        conversationId: "conv-camera",
        workspaceRoot: "E:/project/star-sanctuary",
        stateDir,
        policy: {
          allowedPaths: [],
          deniedPaths: [],
          allowedDomains: [],
          deniedDomains: [],
          maxTimeoutMs: 5_000,
          maxResponseBytes: 1024 * 1024,
        },
      });

      const snapshot = await readCameraRuntimeHealthSnapshot(stateDir, "native_desktop");
      expect(snapshot).toMatchObject({
        provider: "native_desktop",
        runtimeHealth: {
          status: "healthy",
          lastSuccessAt: "2026-04-17T12:00:00.000Z",
          historyWindow: {
            eventCount: 1,
            successCount: 1,
            failureCount: 0,
          },
        },
      });
    } finally {
      await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});
