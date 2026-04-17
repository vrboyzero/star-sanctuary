import { describe, expect, it } from "vitest";

import { buildCameraProviderHealthCheck, getCameraRecoveryHintText } from "./camera-governance.js";

describe("camera governance", () => {
  it("builds actionable health checks for helper/runtime failures", () => {
    const healthCheck = buildCameraProviderHealthCheck({
      providerId: "native_desktop",
      source: "runtime",
      checkedAt: "2026-04-17T14:30:00.000Z",
      providerStatus: "unavailable",
      runtimeHealth: {
        status: "error",
        observedAt: "2026-04-17T14:30:00.000Z",
        currentAvailability: "unavailable",
        consecutiveFailures: 2,
        lastFailure: {
          at: "2026-04-17T14:29:00.000Z",
          operation: "capture_snapshot",
          code: "helper_unavailable",
          message: "helper process exited before handshake",
        },
        historyWindow: {
          size: 32,
          eventCount: 2,
          successCount: 0,
          failureCount: 2,
          recoveredSuccessCount: 0,
          failureCodeCounts: {
            helper_unavailable: 2,
          },
          lastEvents: [],
        },
      },
    });

    expect(healthCheck).toMatchObject({
      provider: "native_desktop",
      status: "fail",
      source: "runtime",
      sources: ["runtime_health"],
      actionable: true,
      primaryReasonCode: "helper_unavailable",
      reasonCodes: ["helper_unavailable"],
      permission: {
        state: "unknown",
        gating: "unknown",
        actionable: false,
      },
      failureStats: {
        issueCounts: {
          total: 0,
          error: 0,
          warning: 0,
          info: 0,
          retryable: 0,
        },
        dominantReasonCode: "helper_unavailable",
      },
    });
    expect(healthCheck.headline).toContain("helper 尚未就绪");
    expect(healthCheck.failureStats.runtimeWindow).toMatchObject({
      failureCount: 2,
      dominantFailureCode: "helper_unavailable",
      lastFailureCode: "helper_unavailable",
    });
    expect(healthCheck.recoveryActions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "verify_helper_config",
        priority: "now",
      }),
      expect.objectContaining({
        kind: "inspect_doctor",
        priority: "next",
      }),
    ]));
  });

  it("builds fallback governance hints when the preferred provider is skipped by runtime health", () => {
    const healthCheck = buildCameraProviderHealthCheck({
      providerId: "browser_loopback",
      source: "selection",
      checkedAt: "2026-04-17T14:31:00.000Z",
      providerStatus: "available",
      selection: {
        policy: "prefer_native_desktop",
        preferredOrder: ["native_desktop", "browser_loopback", "node_device"],
        registeredProviders: ["native_desktop", "browser_loopback"],
        skippedPreferredProviders: ["native_desktop"],
        availableFallbackProviders: [],
        missingFallbackProviders: ["node_device"],
        configuredDefaultProvider: "browser_loopback",
        selectedProvider: "browser_loopback",
        reason: "policy_runtime_health_fallback_provider",
        fallbackApplied: true,
        attempts: [
          {
            provider: "native_desktop",
            outcome: "skipped",
            reason: "provider_runtime_unhealthy",
            detail: "runtime_health_error, failures=2, code=device_busy",
          },
          {
            provider: "browser_loopback",
            outcome: "selected",
            reason: "policy_fallback",
          },
        ],
      },
    });

    expect(healthCheck).toMatchObject({
      provider: "browser_loopback",
      status: "warn",
      source: "selection",
      sources: ["selection_policy"],
      actionable: true,
      fallbackApplied: true,
      primaryReasonCode: "provider_runtime_unhealthy",
      permission: {
        state: "unknown",
        gating: "unknown",
        actionable: false,
      },
    });
    expect(healthCheck.reasonCodes).toEqual(expect.arrayContaining([
      "provider_runtime_unhealthy",
      "fallback_active",
    ]));
    expect(healthCheck.failureStats).toMatchObject({
      issueCounts: {
        total: 0,
        error: 0,
        warning: 0,
        info: 0,
        retryable: 0,
      },
      dominantReasonCode: "provider_runtime_unhealthy",
    });
    expect(healthCheck.recoveryActions).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: "continue_using_fallback",
        priority: "now",
      }),
      expect.objectContaining({
        kind: "inspect_doctor",
        priority: "next",
      }),
    ]));
  });

  it("returns stable recovery hint text for agent-facing errors", () => {
    expect(getCameraRecoveryHintText("device_busy")).toBe("关闭正在占用摄像头的会议或录制软件后重试。");
    expect(getCameraRecoveryHintText("helper_unavailable")).toContain("核对 helper 启动命令");
  });
});
