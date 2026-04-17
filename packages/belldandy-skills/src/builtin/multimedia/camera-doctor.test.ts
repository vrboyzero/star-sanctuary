import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  buildCameraRuntimeDoctorReport,
} from "./camera-doctor.js";
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

      expect(report?.summary.defaultProviderId).toBe("browser_loopback");
      expect(report?.providers).toEqual(expect.arrayContaining([
        expect.objectContaining({
          id: "native_desktop",
          status: "degraded",
          helperStatus: "ready",
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
});
