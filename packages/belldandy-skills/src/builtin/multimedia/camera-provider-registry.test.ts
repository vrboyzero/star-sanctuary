import { describe, expect, it, vi } from "vitest";

import type { CameraProvider } from "./camera-contract.js";
import {
  CameraProviderRegistry,
  createDefaultCameraProviderRegistry,
  getCameraProviderIdFromDeviceRef,
} from "./camera-provider-registry.js";

function createProvider(id: CameraProvider["id"]): CameraProvider {
  return {
    id,
    capabilities: {
      diagnose: false,
      list: true,
      snapshot: true,
      clip: false,
      audio: false,
      hotplug: false,
      background: false,
    },
    listDevices: vi.fn(async () => ({
      provider: id,
      state: {
        status: "ready",
        selectedFacing: "front",
        devices: [],
      },
    })),
    captureSnapshot: vi.fn(async () => ({
      provider: id,
      path: "/tmp/camera.png",
      state: {
        status: "ready",
        selectedFacing: "front",
        devices: [],
      },
    })),
  };
}

describe("camera provider registry", () => {
  it("resolves explicit provider ids before any fallback", () => {
    const registry = new CameraProviderRegistry();
    registry.register(createProvider("browser_loopback"), { makeDefault: true });
    registry.register(createProvider("native_desktop"));

    expect(registry.resolveProviderId({
      provider: "native_desktop",
      deviceRef: "browser_loopback:facing:front",
    })).toBe("native_desktop");
  });

  it("resolves provider ids from device refs when no explicit provider is present", () => {
    const registry = new CameraProviderRegistry();
    registry.register(createProvider("browser_loopback"), { makeDefault: true });
    registry.register(createProvider("node_device"));

    expect(registry.resolveProviderId({
      deviceRef: "node_device:phone:rear",
    })).toBe("node_device");
  });

  it("falls back to the default provider when deviceRef is absent", () => {
    const registry = new CameraProviderRegistry();
    registry.register(createProvider("browser_loopback"), { makeDefault: true });
    registry.register(createProvider("native_desktop"));

    expect(registry.resolveProviderId({})).toBe("browser_loopback");
  });

  it("extracts provider ids from valid device refs only", () => {
    expect(getCameraProviderIdFromDeviceRef("browser_loopback:facing:front")).toBe("browser_loopback");
    expect(getCameraProviderIdFromDeviceRef("unknown-provider:device:1")).toBeUndefined();
    expect(getCameraProviderIdFromDeviceRef(undefined)).toBeUndefined();
  });

  it("registers native_desktop when helper env config is present", () => {
    const registry = createDefaultCameraProviderRegistry({
      BELLDANDY_CAMERA_NATIVE_HELPER_COMMAND: process.execPath,
      BELLDANDY_CAMERA_NATIVE_HELPER_ARGS_JSON: JSON.stringify(["helper.mjs"]),
    });

    expect(registry.has("browser_loopback")).toBe(true);
    expect(registry.has("native_desktop")).toBe(true);
    expect(registry.getDefaultProviderId()).toBe("browser_loopback");
  });
});
