import { describe, expect, it, vi } from "vitest";

import type { CameraProvider, CameraProviderRuntimeHealth } from "./camera-contract.js";
import {
  CameraProviderRegistry,
  createDefaultCameraProviderRegistry,
  getCameraProviderIdFromDeviceRef,
} from "./camera-provider-registry.js";

function createProvider(
  id: CameraProvider["id"],
  options: {
    runtimeHealth?: CameraProviderRuntimeHealth;
  } = {},
): CameraProvider {
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
    ...(options.runtimeHealth ? {
      getRuntimeHealth: vi.fn(() => options.runtimeHealth),
    } : {}),
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

    expect(registry.resolveProviderId({})).toBe("native_desktop");
    expect(registry.resolveProviderSelection({})).toMatchObject({
      selectedProvider: "native_desktop",
      reason: "policy_preferred_provider",
      fallbackApplied: false,
      configuredDefaultProvider: "browser_loopback",
      registeredProviders: ["native_desktop", "browser_loopback"],
      availableFallbackProviders: ["browser_loopback"],
      missingFallbackProviders: ["node_device"],
      skippedPreferredProviders: [],
    });
  });

  it("records a fallback trace when the preferred provider is not registered", () => {
    const registry = new CameraProviderRegistry();
    registry.register(createProvider("browser_loopback"), { makeDefault: true });

    expect(registry.resolveProviderId({})).toBe("browser_loopback");
    expect(registry.resolveProviderSelection({})).toMatchObject({
      selectedProvider: "browser_loopback",
      reason: "policy_fallback_provider",
      fallbackApplied: true,
      configuredDefaultProvider: "browser_loopback",
      registeredProviders: ["browser_loopback"],
      availableFallbackProviders: [],
      missingFallbackProviders: ["node_device"],
      skippedPreferredProviders: ["native_desktop"],
      attempts: [
        expect.objectContaining({
          provider: "native_desktop",
          outcome: "skipped",
          reason: "provider_not_registered",
        }),
        expect.objectContaining({
          provider: "browser_loopback",
          outcome: "selected",
          reason: "policy_fallback",
        }),
      ],
    });
  });

  it("falls back when the preferred provider is currently unhealthy", () => {
    const registry = new CameraProviderRegistry();
    registry.register(createProvider("browser_loopback"), { makeDefault: true });
    registry.register(createProvider("native_desktop", {
      runtimeHealth: {
        status: "error",
        observedAt: "2026-04-17T12:00:00.000Z",
        currentAvailability: "unavailable",
        consecutiveFailures: 2,
        lastFailure: {
          at: "2026-04-17T11:59:50.000Z",
          operation: "capture_snapshot",
          code: "device_busy",
          message: "camera busy",
          recoveryHint: "close meeting software",
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
          lastEvents: [],
        },
      },
    }));

    expect(registry.resolveProviderId({}, {
      now: "2026-04-17T12:00:10.000Z",
    })).toBe("browser_loopback");
    expect(registry.resolveProviderSelection({}, {
      now: "2026-04-17T12:00:10.000Z",
    })).toMatchObject({
      selectedProvider: "browser_loopback",
      reason: "policy_runtime_health_fallback_provider",
      fallbackApplied: true,
      configuredDefaultProvider: "browser_loopback",
      skippedPreferredProviders: ["native_desktop"],
      attempts: [
        expect.objectContaining({
          provider: "native_desktop",
          outcome: "skipped",
          reason: "provider_runtime_unhealthy",
          detail: expect.stringContaining("runtime_health_error"),
        }),
        expect.objectContaining({
          provider: "browser_loopback",
          outcome: "selected",
          reason: "policy_fallback",
        }),
      ],
    });
  });

  it("does not permanently block a provider on stale runtime health failures", () => {
    const registry = new CameraProviderRegistry();
    registry.register(createProvider("browser_loopback"), { makeDefault: true });
    registry.register(createProvider("native_desktop", {
      runtimeHealth: {
        status: "error",
        observedAt: "2026-04-17T11:00:00.000Z",
        currentAvailability: "unavailable",
        consecutiveFailures: 1,
        historyWindow: {
          size: 32,
          eventCount: 1,
          successCount: 0,
          failureCount: 1,
          recoveredSuccessCount: 0,
          failureCodeCounts: {
            device_busy: 1,
          },
          lastEvents: [],
        },
      },
    }));

    expect(registry.resolveProviderId({}, {
      now: "2026-04-17T12:00:10.000Z",
    })).toBe("native_desktop");
    expect(registry.resolveProviderSelection({}, {
      now: "2026-04-17T12:00:10.000Z",
    })).toMatchObject({
      selectedProvider: "native_desktop",
      reason: "policy_preferred_provider",
      fallbackApplied: false,
    });
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
