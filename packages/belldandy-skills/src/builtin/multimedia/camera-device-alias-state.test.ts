import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  listCameraDeviceAliasMemoryEntries,
  observeCameraDeviceAliasMemory,
  readCameraDeviceAliasSnapshot,
  removeCameraDeviceAliasMemoryEntry,
  upsertCameraDeviceAliasMemoryEntry,
} from "./camera-device-alias-state.js";

describe("camera device alias state", () => {
  it("remembers the first stable alias across later label changes", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "camera-device-alias-"));

    try {
      const firstObservation = await observeCameraDeviceAliasMemory(stateDir, [{
        provider: "native_desktop",
        deviceId: "cam-1",
        deviceRef: "native_desktop:device:usb-1234567890",
        stableKey: "usb-1234567890",
        label: "Desk Cam",
        kind: "videoinput",
        source: "external",
        transport: "native",
        external: true,
        available: true,
      }], {
        now: "2026-04-17T12:00:00.000Z",
      });

      expect(firstObservation.devices[0]).toMatchObject({
        alias: "Desk Cam",
        aliasSource: "learned",
      });

      const secondObservation = await observeCameraDeviceAliasMemory(stateDir, [{
        provider: "native_desktop",
        deviceId: "cam-2",
        deviceRef: "native_desktop:device:usb-1234567890",
        stableKey: "usb-1234567890",
        label: "USB2.0 Camera",
        kind: "videoinput",
        source: "external",
        transport: "native",
        external: true,
        available: true,
      }], {
        now: "2026-04-17T12:05:00.000Z",
      });

      expect(secondObservation.devices[0]).toMatchObject({
        alias: "Desk Cam",
        aliasSource: "learned",
      });

      const snapshot = await readCameraDeviceAliasSnapshot(stateDir);
      expect(snapshot?.entries).toEqual([
        expect.objectContaining({
          identityKey: "native_desktop:stable:usb-1234567890",
          alias: "Desk Cam",
          labels: ["Desk Cam", "USB2.0 Camera"],
        }),
      ]);
    } finally {
      await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("allocates a stable suffix when two devices share the same label", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "camera-device-alias-collision-"));

    try {
      const observation = await observeCameraDeviceAliasMemory(stateDir, [
        {
          provider: "native_desktop",
          deviceId: "cam-a",
          deviceRef: "native_desktop:device:usb-a1b2c3d4",
          stableKey: "usb-a1b2c3d4",
          label: "Conference Cam",
          kind: "videoinput",
          source: "external",
          transport: "native",
          external: true,
          available: true,
        },
        {
          provider: "native_desktop",
          deviceId: "cam-b",
          deviceRef: "native_desktop:device:usb-z9y8x7w6",
          stableKey: "usb-z9y8x7w6",
          label: "Conference Cam",
          kind: "videoinput",
          source: "external",
          transport: "native",
          external: true,
          available: true,
        },
      ], {
        now: "2026-04-17T12:10:00.000Z",
      });

      expect(observation.devices[0]?.alias).toBe("Conference Cam");
      expect(observation.devices[1]?.alias).toMatch(/^Conference Cam \[[a-z0-9]{6}\]$/u);
    } finally {
      await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("lets manual alias and favorite overrides survive later observations", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "camera-device-alias-manual-"));

    try {
      await observeCameraDeviceAliasMemory(stateDir, [{
        provider: "native_desktop",
        deviceId: "cam-1",
        deviceRef: "native_desktop:device:usb-1234567890",
        stableKey: "usb-1234567890",
        label: "Desk Cam",
        kind: "videoinput",
        source: "external",
        transport: "native",
        external: true,
        available: true,
      }], {
        now: "2026-04-17T12:00:00.000Z",
      });

      const upserted = await upsertCameraDeviceAliasMemoryEntry(stateDir, {
        deviceRef: "native_desktop:device:usb-1234567890",
        stableKey: "usb-1234567890",
        alias: "Studio Cam",
        favorite: true,
      }, {
        now: "2026-04-17T12:02:00.000Z",
      });

      expect(upserted.entry).toMatchObject({
        alias: "Studio Cam",
        learnedAlias: "Desk Cam",
        aliasSource: "manual",
        favorite: true,
      });
      expect(upserted.summary).toMatchObject({
        entryCount: 1,
        manualAliasCount: 1,
        favoriteCount: 1,
      });

      const observation = await observeCameraDeviceAliasMemory(stateDir, [{
        provider: "native_desktop",
        deviceId: "cam-2",
        deviceRef: "native_desktop:device:usb-1234567890",
        stableKey: "usb-1234567890",
        label: "USB2.0 Camera",
        kind: "videoinput",
        source: "external",
        transport: "native",
        external: true,
        available: true,
      }], {
        now: "2026-04-17T12:05:00.000Z",
      });

      expect(observation.devices[0]).toMatchObject({
        alias: "Studio Cam",
        aliasSource: "manual",
        favorite: true,
      });

      const listed = await listCameraDeviceAliasMemoryEntries(stateDir);
      expect(listed.entries).toEqual([
        expect.objectContaining({
          alias: "Studio Cam",
          learnedAlias: "Desk Cam",
          aliasSource: "manual",
          favorite: true,
          labels: ["Desk Cam", "USB2.0 Camera"],
        }),
      ]);
    } finally {
      await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
    }
  });

  it("can clear manual alias and remove remembered entries", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "camera-device-alias-remove-"));

    try {
      await upsertCameraDeviceAliasMemoryEntry(stateDir, {
        deviceRef: "native_desktop:device:usb-9999",
        stableKey: "usb-9999",
        label: "Road Cam",
        alias: "Travel Cam",
        favorite: true,
      }, {
        now: "2026-04-17T12:20:00.000Z",
      });

      const cleared = await upsertCameraDeviceAliasMemoryEntry(stateDir, {
        deviceRef: "native_desktop:device:usb-9999",
        stableKey: "usb-9999",
        alias: "",
        favorite: false,
      }, {
        now: "2026-04-17T12:21:00.000Z",
      });

      expect(cleared.entry).toMatchObject({
        alias: "Road Cam",
        aliasSource: "learned",
        favorite: false,
      });

      const removed = await removeCameraDeviceAliasMemoryEntry(stateDir, {
        deviceRef: "native_desktop:device:usb-9999",
        stableKey: "usb-9999",
      }, {
        now: "2026-04-17T12:22:00.000Z",
      });

      expect(removed).toMatchObject({
        removed: true,
        entry: expect.objectContaining({
          alias: "Road Cam",
        }),
        summary: expect.objectContaining({
          entryCount: 0,
          manualAliasCount: 0,
          favoriteCount: 0,
        }),
      });

      const listed = await listCameraDeviceAliasMemoryEntries(stateDir);
      expect(listed.entries).toEqual([]);
    } finally {
      await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
    }
  });
});
