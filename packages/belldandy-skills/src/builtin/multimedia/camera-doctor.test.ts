import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildCameraRuntimeDoctorReport,
} from "./camera-doctor.js";
import { browserLoopbackCameraProvider } from "./camera-browser-loopback-provider.js";
import {
  observeCameraDeviceAliasMemory,
  upsertCameraDeviceAliasMemoryEntry,
} from "./camera-device-alias-state.js";
import { NativeDesktopCameraProvider } from "./camera-native-desktop-provider.js";
import { CameraProviderRegistry } from "./camera-provider-registry.js";
import {
  resolveCameraRuntimeHealthSnapshotPath,
  writeCameraRuntimeHealthSnapshot,
} from "./camera-runtime-health-state.js";
import {
  BELLDANDY_CAMERA_NATIVE_HELPER_ARGS_JSON_ENV,
  BELLDANDY_CAMERA_NATIVE_HELPER_COMMAND_ENV,
  BELLDANDY_CAMERA_NATIVE_HELPER_CWD_ENV,
} from "./camera-native-desktop-stdio-client.js";
import {
  BELLDANDY_RUNTIME_DIR_ENV,
} from "./camera-native-desktop-launch.js";

async function writeFakeDoctorHelperScript(helperPath: string): Promise<void> {
  await fs.writeFile(helperPath, `
import readline from "node:readline";

const protocol = "camera-native-desktop/v1";
const capabilities = {
  diagnose: true,
  list: true,
  snapshot: true,
  clip: false,
  audio: false,
  hotplug: true,
  background: true,
  stillFormats: ["png"],
  clipFormats: [],
  selectionByStableKey: true,
  deviceChangeEvents: true,
};

const rl = readline.createInterface({
  input: process.stdin,
  crlfDelay: Infinity,
});

rl.on("line", (line) => {
  const request = JSON.parse(line);
  if (!request || request.kind !== "request") {
    return;
  }
  let result;
  switch (request.method) {
    case "hello":
      result = {
        protocol,
        helperVersion: "doctor-test-helper",
        platform: "windows",
        transport: "stdio",
        helperStatus: "ready",
        capabilities,
      };
      break;
    case "diagnose":
      result = {
        status: "degraded",
        helperStatus: "ready",
        permissionState: "granted",
        observedAt: "2026-04-17T10:00:00.000Z",
        issues: [
          {
            code: "device_busy",
            severity: "warning",
            message: "OBSBOT Tiny 2 StreamCamera is currently busy.",
            retryable: true,
          },
        ],
        devices: [
          {
            deviceId: "obspot-main",
            stableKey: "usb-3564-fef8-453a4b75",
            label: "OBSBOT Tiny 2 StreamCamera",
            source: "external",
            transport: "native",
            external: true,
            available: true,
            kind: "videoinput",
            busy: true,
          },
        ],
        capabilities,
        helperVersion: "doctor-test-helper",
      };
      break;
    default:
      process.stdout.write(JSON.stringify({
        kind: "response",
        protocol,
        id: request.id,
        method: request.method,
        ok: false,
        error: {
          code: "unsupported_method",
          message: "unsupported",
        },
      }) + "\\n");
      return;
  }
  process.stdout.write(JSON.stringify({
    kind: "response",
    protocol,
    id: request.id,
    method: request.method,
    ok: true,
    result,
  }) + "\\n");
});
`, "utf-8");
}

async function createFakeDoctorHelperScript(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "camera-doctor-helper-"));
  const helperPath = path.join(dir, "fake-camera-helper.mjs");
  await writeFakeDoctorHelperScript(helperPath);
  return helperPath;
}

describe("camera runtime doctor report", () => {
  it("returns null when only browser_loopback is present by default", async () => {
    const report = await buildCameraRuntimeDoctorReport({
      env: {},
    });
    expect(report).toBeNull();
  });

  it("reports invalid helper env without throwing", async () => {
    const report = await buildCameraRuntimeDoctorReport({
      env: {
        [BELLDANDY_CAMERA_NATIVE_HELPER_COMMAND_ENV]: "node",
        [BELLDANDY_CAMERA_NATIVE_HELPER_ARGS_JSON_ENV]: "[",
      },
    });

    expect(report?.providers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: "native_desktop",
        status: "unavailable",
      }),
    ]));
    expect(report?.summary.errorCount).toBeGreaterThanOrEqual(1);
  });

  it("summarizes native_desktop diagnose output for doctor consumers", async () => {
    const helperPath = await createFakeDoctorHelperScript();
    try {
      const report = await buildCameraRuntimeDoctorReport({
        env: {
          [BELLDANDY_CAMERA_NATIVE_HELPER_COMMAND_ENV]: process.execPath,
          [BELLDANDY_CAMERA_NATIVE_HELPER_ARGS_JSON_ENV]: JSON.stringify([helperPath]),
        },
      });

      expect(report?.summary.defaultProviderId).toBe("native_desktop");
      expect(report?.summary.defaultSelection).toMatchObject({
        policy: "prefer_native_desktop",
        selectedProvider: "native_desktop",
        reason: "policy_preferred_provider",
        fallbackApplied: false,
        configuredDefaultProvider: "browser_loopback",
        registeredProviders: ["native_desktop", "browser_loopback"],
        availableFallbackProviders: ["browser_loopback"],
        missingFallbackProviders: ["node_device"],
      });
      expect(report?.summary.governance).toMatchObject({
        blockedProviderCount: 1,
        permissionBlockedProviderCount: 0,
        permissionPromptProviderCount: 0,
        fallbackActiveProviderCount: 0,
        recentFailureCount: 0,
        recentRecoveredCount: 0,
        failureProviderCount: 0,
        repeatedFallback: false,
        dominantFailureCode: "device_busy",
        whyUnhealthy: "native_desktop 当前需要优先处理；依据=permission_state + diagnostic_issue + runtime_health；主因=device_busy。",
        recommendedAction: "关闭正在占用摄像头的会议或录制软件后重试。",
      });
      expect(report?.providers).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "native_desktop",
          status: "degraded",
          helperStatus: "ready",
          healthCheck: expect.objectContaining({
            status: "warn",
            source: "diagnostic",
            sources: expect.arrayContaining(["permission_state", "diagnostic_issue", "runtime_health"]),
            primaryReasonCode: "device_busy",
            reasonCodes: expect.arrayContaining(["device_busy"]),
            permission: expect.objectContaining({
              state: "granted",
              gating: "clear",
            }),
            failureStats: expect.objectContaining({
              issueCounts: expect.objectContaining({
                total: 1,
                warning: 1,
              }),
              dominantReasonCode: "device_busy",
              runtimeWindow: expect.objectContaining({
                successCount: 1,
                failureCount: 0,
              }),
            }),
            recoveryActions: expect.arrayContaining([
              expect.objectContaining({
                kind: "close_competing_app",
                priority: "now",
              }),
            ]),
          }),
          issueCounts: expect.objectContaining({
            warning: 1,
          }),
          deviceCounts: expect.objectContaining({
            total: 1,
            available: 1,
            busy: 1,
          }),
          recoveryHints: expect.arrayContaining([
            "关闭正在占用摄像头的会议或录制软件后重试。",
          ]),
        }),
      ]));
      expect(report?.providers.find((item) => item.id === "native_desktop")?.sampleDevices).toEqual([
        "OBSBOT Tiny 2 StreamCamera [available, external, busy, stable=usb-3564-fef8-453a4b75]",
      ]);
    } finally {
      await fs.rm(path.dirname(helperPath), { recursive: true, force: true }).catch(() => {});
    }
  });

  it("uses remembered device aliases when doctor summarizes current devices", async () => {
    const helperPath = await createFakeDoctorHelperScript();
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "camera-doctor-alias-state-"));

    try {
      await observeCameraDeviceAliasMemory(stateDir, [{
        provider: "native_desktop",
        deviceId: "obspot-main",
        deviceRef: "native_desktop:device:usb-3564-fef8-453a4b75",
        stableKey: "usb-3564-fef8-453a4b75",
        label: "Desk Cam",
        kind: "videoinput",
        source: "external",
        transport: "native",
        external: true,
        available: true,
      }], {
        now: "2026-04-17T09:59:00.000Z",
      });
      await upsertCameraDeviceAliasMemoryEntry(stateDir, {
        deviceRef: "native_desktop:device:usb-3564-fef8-453a4b75",
        stableKey: "usb-3564-fef8-453a4b75",
        alias: "Studio Cam",
        favorite: true,
      }, {
        now: "2026-04-17T09:59:30.000Z",
      });

      const report = await buildCameraRuntimeDoctorReport({
        env: {
          [BELLDANDY_CAMERA_NATIVE_HELPER_COMMAND_ENV]: process.execPath,
          [BELLDANDY_CAMERA_NATIVE_HELPER_ARGS_JSON_ENV]: JSON.stringify([helperPath]),
        },
        context: {
          stateDir,
        },
      });

      expect(report?.providers.find((item) => item.id === "native_desktop")?.sampleDevices).toEqual([
        "Studio Cam => OBSBOT Tiny 2 StreamCamera [available, external, busy, favorite, stable=usb-3564-fef8-453a4b75]",
      ]);
      expect(report?.providers.find((item) => item.id === "native_desktop")?.metadata).toEqual(expect.objectContaining({
        aliasMemory: expect.objectContaining({
          observedCount: 1,
          entryCount: 1,
          manualAliasCount: 1,
          favoriteCount: 1,
          snapshotPath: expect.stringContaining("device-aliases.json"),
        }),
      }));
    } finally {
      await fs.rm(path.dirname(helperPath), { recursive: true, force: true }).catch(() => {});
      await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("merges runtime health snapshots so doctor can show recent failure and recovery guidance", async () => {
    const helperPath = await createFakeDoctorHelperScript();
    const runtimeHealthRegistry = new CameraProviderRegistry();
    runtimeHealthRegistry.register(browserLoopbackCameraProvider, { makeDefault: true });
    const runtimeProvider = new NativeDesktopCameraProvider({
      client: {
        hello: async () => {
          throw new Error("not used");
        },
        diagnose: async () => {
          throw new Error("not used");
        },
        listDevices: async () => {
          throw new Error("not used");
        },
        captureSnapshot: async () => {
          throw new Error("device_busy: OBSBOT Tiny 2 StreamCamera is currently busy.");
        },
      },
    });
    runtimeHealthRegistry.register(runtimeProvider);

    try {
      await expect(runtimeProvider.captureSnapshot({
        facing: "front",
        width: 1280,
        height: 720,
        fit: "contain",
        mirror: false,
        delayMs: 0,
        readyTimeoutMs: 5_000,
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
      })).rejects.toThrow("device_busy");

      const report = await buildCameraRuntimeDoctorReport({
        env: {
          [BELLDANDY_CAMERA_NATIVE_HELPER_COMMAND_ENV]: process.execPath,
          [BELLDANDY_CAMERA_NATIVE_HELPER_ARGS_JSON_ENV]: JSON.stringify([helperPath]),
        },
        runtimeHealthRegistry,
      });

      expect(report?.providers).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "native_desktop",
          runtimeHealth: expect.objectContaining({
            status: "error",
            consecutiveFailures: 1,
            historyWindow: expect.objectContaining({
              eventCount: 1,
              failureCount: 1,
              successCount: 0,
              recoveredSuccessCount: 0,
              failureCodeCounts: {
                device_busy: 1,
              },
            }),
            lastFailure: expect.objectContaining({
              code: "device_busy",
              recoveryHint: "关闭正在占用摄像头的会议或录制软件后重试。",
            }),
          }),
        }),
      ]));
    } finally {
      await fs.rm(path.dirname(helperPath), { recursive: true, force: true }).catch(() => {});
    }
  });

  it("uses runtime health to explain health-driven default fallback selection", async () => {
    const helperPath = await createFakeDoctorHelperScript();
    const runtimeHealthRegistry = new CameraProviderRegistry();
    runtimeHealthRegistry.register(browserLoopbackCameraProvider, { makeDefault: true });
    const runtimeProvider = new NativeDesktopCameraProvider({
      client: {
        hello: async () => {
          throw new Error("not used");
        },
        diagnose: async () => {
          throw new Error("not used");
        },
        listDevices: async () => {
          throw new Error("not used");
        },
        captureSnapshot: async () => {
          throw new Error("device_busy: OBSBOT Tiny 2 StreamCamera is currently busy.");
        },
      },
    });
    runtimeHealthRegistry.register(runtimeProvider);

    try {
      await expect(runtimeProvider.captureSnapshot({
        facing: "front",
        width: 1280,
        height: 720,
        fit: "contain",
        mirror: false,
        delayMs: 0,
        readyTimeoutMs: 5_000,
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
      })).rejects.toThrow("device_busy");

      const report = await buildCameraRuntimeDoctorReport({
        env: {
          [BELLDANDY_CAMERA_NATIVE_HELPER_COMMAND_ENV]: process.execPath,
          [BELLDANDY_CAMERA_NATIVE_HELPER_ARGS_JSON_ENV]: JSON.stringify([helperPath]),
        },
        runtimeHealthRegistry,
        now: "2026-04-17T12:00:01.000Z",
      });

      expect(report?.summary.defaultProviderId).toBe("browser_loopback");
      expect(report?.summary.defaultSelection).toMatchObject({
        selectedProvider: "browser_loopback",
        reason: "policy_runtime_health_fallback_provider",
        fallbackApplied: true,
        skippedPreferredProviders: ["native_desktop"],
        attempts: [
          expect.objectContaining({
            provider: "native_desktop",
            outcome: "skipped",
            reason: "provider_runtime_unhealthy",
          }),
          expect.objectContaining({
            provider: "browser_loopback",
            outcome: "selected",
            reason: "policy_fallback",
          }),
        ],
      });
      expect(report?.summary.governance).toMatchObject({
        blockedProviderCount: 1,
        permissionBlockedProviderCount: 0,
        permissionPromptProviderCount: 0,
        fallbackActiveProviderCount: 1,
        recentFailureCount: 1,
        recentRecoveredCount: 0,
        failureProviderCount: 1,
        repeatedFallback: false,
        dominantFailureCode: "device_busy",
        whyUnhealthy: "native_desktop 当前需要优先处理；依据=permission_state + diagnostic_issue + runtime_health；主因=device_busy。",
        whyFallback: expect.stringContaining("默认 provider 已从 native_desktop 回退到 browser_loopback"),
        recommendedAction: "关闭正在占用摄像头的会议或录制软件后重试。",
      });
      expect(report?.providers).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "browser_loopback",
          healthCheck: expect.objectContaining({
            status: "warn",
            source: "selection",
            sources: expect.arrayContaining(["selection_policy"]),
            primaryReasonCode: "provider_runtime_unhealthy",
            reasonCodes: expect.arrayContaining([
              "provider_runtime_unhealthy",
              "fallback_active",
            ]),
            permission: expect.objectContaining({
              state: "unknown",
              gating: "unknown",
            }),
            failureStats: expect.objectContaining({
              dominantReasonCode: "provider_runtime_unhealthy",
            }),
            recoveryActions: expect.arrayContaining([
              expect.objectContaining({
                kind: "continue_using_fallback",
                priority: "now",
              }),
            ]),
          }),
        }),
      ]));
    } finally {
      await fs.rm(path.dirname(helperPath), { recursive: true, force: true }).catch(() => {});
    }
  });

  it("reports resolved helper entry for installed runtime layouts", async () => {
    const installRoot = await fs.mkdtemp(path.join(os.tmpdir(), "camera-doctor-install-root-"));
    const runtimeDir = path.join(installRoot, "current");
    const helperEntry = "packages/belldandy-skills/dist/builtin/multimedia/camera-native-desktop-helper.mjs";
    const helperPath = path.join(runtimeDir, helperEntry);

    try {
      await fs.mkdir(path.dirname(helperPath), { recursive: true });
      await writeFakeDoctorHelperScript(helperPath);

      const report = await buildCameraRuntimeDoctorReport({
        env: {
          [BELLDANDY_CAMERA_NATIVE_HELPER_COMMAND_ENV]: process.execPath,
          [BELLDANDY_CAMERA_NATIVE_HELPER_ARGS_JSON_ENV]: JSON.stringify([helperEntry]),
          [BELLDANDY_CAMERA_NATIVE_HELPER_CWD_ENV]: installRoot,
          [BELLDANDY_RUNTIME_DIR_ENV]: runtimeDir,
        },
      });

      expect(report?.providers).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "native_desktop",
          launchConfig: expect.objectContaining({
            command: process.execPath,
            helperEntry,
            resolvedHelperEntry: helperPath,
            cwd: installRoot,
            runtimeDir,
          }),
        }),
      ]));
    } finally {
      await fs.rm(installRoot, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("loads persisted runtime health snapshots and marks stale state for doctor consumers", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "camera-doctor-state-"));
    try {
      await writeCameraRuntimeHealthSnapshot(stateDir, "native_desktop", {
        status: "error",
        observedAt: "2026-04-17T09:00:00.000Z",
        currentAvailability: "unavailable",
        helperStatus: "error",
        lastOperation: "capture_snapshot",
        lastSuccessAt: "2026-04-17T08:00:00.000Z",
        lastSuccessOperation: "capture_snapshot",
        consecutiveFailures: 2,
        lastFailure: {
          at: "2026-04-17T09:00:00.000Z",
          operation: "capture_snapshot",
          code: "device_busy",
          message: "OBSBOT Tiny 2 StreamCamera is currently busy.",
          recoveryHint: "关闭正在占用摄像头的会议或录制软件后重试。",
        },
        historyWindow: {
          size: 32,
          eventCount: 2,
          successCount: 0,
          failureCount: 2,
          recoveredSuccessCount: 0,
          failureCodeCounts: {
            device_busy: 2,
          },
          lastEvents: [
            {
              at: "2026-04-17T08:55:00.000Z",
              operation: "capture_snapshot",
              outcome: "failure",
              code: "device_busy",
              message: "OBSBOT Tiny 2 StreamCamera is currently busy.",
            },
            {
              at: "2026-04-17T09:00:00.000Z",
              operation: "capture_snapshot",
              outcome: "failure",
              code: "device_busy",
              message: "OBSBOT Tiny 2 StreamCamera is currently busy.",
            },
          ],
        },
      });
      const snapshotPath = resolveCameraRuntimeHealthSnapshotPath(stateDir, "native_desktop");
      const persisted = JSON.parse(await fs.readFile(snapshotPath, "utf-8")) as Record<string, unknown>;
      persisted.savedAt = "2026-04-17T09:01:00.000Z";
      await fs.writeFile(snapshotPath, JSON.stringify(persisted, null, 2), "utf-8");

      const report = await buildCameraRuntimeDoctorReport({
        env: {
          [BELLDANDY_CAMERA_NATIVE_HELPER_COMMAND_ENV]: "node",
          [BELLDANDY_CAMERA_NATIVE_HELPER_ARGS_JSON_ENV]: "[",
        },
        context: {
          stateDir,
        },
        now: "2026-04-17T10:00:00.000Z",
        runtimeHealthStaleAfterMs: 10 * 60 * 1_000,
      });

      expect(report?.providers).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "native_desktop",
          runtimeHealth: expect.objectContaining({
            status: "error",
            consecutiveFailures: 2,
          }),
          runtimeHealthFreshness: expect.objectContaining({
            source: "snapshot",
            level: "stale",
            stale: true,
            staleAfterMs: 600000,
            retention: expect.objectContaining({
              eventLimit: 32,
            }),
            referenceAt: "2026-04-17T09:01:00.000Z",
            snapshotPath,
          }),
        }),
      ]));
    } finally {
      await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("surfaces snapshot repair issues when persisted runtime health is unreadable", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "camera-doctor-bad-snapshot-"));
    const snapshotPath = resolveCameraRuntimeHealthSnapshotPath(stateDir, "native_desktop");
    try {
      await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
      await fs.writeFile(snapshotPath, "{broken-json", "utf-8");

      const report = await buildCameraRuntimeDoctorReport({
        env: {
          [BELLDANDY_CAMERA_NATIVE_HELPER_COMMAND_ENV]: "node",
          [BELLDANDY_CAMERA_NATIVE_HELPER_ARGS_JSON_ENV]: "[",
        },
        context: {
          stateDir,
        },
      });

      expect(report?.providers).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "native_desktop",
          runtimeHealthFreshness: expect.objectContaining({
            source: "none",
            level: "unavailable",
            snapshotIssue: expect.objectContaining({
              code: "snapshot_unreadable",
              repaired: true,
            }),
          }),
        }),
      ]));
    } finally {
      await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});
