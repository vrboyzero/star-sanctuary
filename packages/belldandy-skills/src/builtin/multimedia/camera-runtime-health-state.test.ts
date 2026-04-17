import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  DEFAULT_CAMERA_RUNTIME_HEALTH_RETENTION_POLICY,
  inspectCameraRuntimeHealthSnapshot,
  readCameraRuntimeHealthSnapshot,
  resolveCameraRuntimeHealthSnapshotPath,
  writeCameraRuntimeHealthSnapshot,
} from "./camera-runtime-health-state.js";

describe("camera runtime health state", () => {
  it("sanitizes retained events to the configured horizon and event limit", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "camera-runtime-health-store-"));
    const now = "2026-04-17T12:00:00.000Z";

    try {
      await writeCameraRuntimeHealthSnapshot(stateDir, "native_desktop", {
        status: "degraded",
        observedAt: now,
        currentAvailability: "degraded",
        helperStatus: "ready",
        permissionState: "granted",
        lastOperation: "capture_snapshot",
        lastSuccessAt: "2026-04-17T11:59:00.000Z",
        lastSuccessOperation: "capture_snapshot",
        consecutiveFailures: 0,
        historyWindow: {
          size: 64,
          eventCount: 40,
          successCount: 30,
          failureCount: 10,
          recoveredSuccessCount: 5,
          failureCodeCounts: {
            device_busy: 10,
          },
          lastEvents: [
            {
              at: "2026-04-01T10:00:00.000Z",
              operation: "capture_snapshot",
              outcome: "failure",
              code: "device_busy",
              message: "too old",
            },
            ...Array.from({ length: 36 }, (_, index) => ({
              at: `2026-04-17T11:${String(index).padStart(2, "0")}:00.000Z`,
              operation: "capture_snapshot" as const,
              outcome: index % 3 === 0 ? "failure" as const : "success" as const,
              ...(index % 3 === 0 ? { code: "device_busy", message: "busy" } : {}),
            })),
          ],
        },
      }, { now });

      const snapshot = await readCameraRuntimeHealthSnapshot(stateDir, "native_desktop", { now });
      expect(snapshot?.runtimeHealth.historyWindow).toMatchObject({
        size: DEFAULT_CAMERA_RUNTIME_HEALTH_RETENTION_POLICY.eventLimit,
        eventCount: DEFAULT_CAMERA_RUNTIME_HEALTH_RETENTION_POLICY.eventLimit,
      });
      expect(snapshot?.runtimeHealth.historyWindow.lastEvents).toHaveLength(DEFAULT_CAMERA_RUNTIME_HEALTH_RETENTION_POLICY.eventLimit);
      expect(snapshot?.runtimeHealth.historyWindow.lastEvents[0]?.at).toBe("2026-04-17T11:04:00.000Z");
      expect(snapshot?.runtimeHealth.historyWindow.lastEvents.some((event) => event.message === "too old")).toBe(false);
    } finally {
      await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("quarantines unreadable snapshots and reports a repairable issue", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "camera-runtime-health-corrupt-"));
    const snapshotPath = resolveCameraRuntimeHealthSnapshotPath(stateDir, "native_desktop");

    try {
      await fs.mkdir(path.dirname(snapshotPath), { recursive: true });
      await fs.writeFile(snapshotPath, "{not-json", "utf-8");

      const result = await inspectCameraRuntimeHealthSnapshot(stateDir, "native_desktop");
      expect(result?.snapshot).toBeUndefined();
      expect(result?.issue).toMatchObject({
        code: "snapshot_unreadable",
        repaired: true,
      });
      expect(result?.issue?.quarantinePath).toBeTruthy();
      expect(await fs.stat(result!.issue!.quarantinePath!)).toBeTruthy();
    } finally {
      await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});
