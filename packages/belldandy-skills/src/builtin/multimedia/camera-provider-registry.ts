import type {
  CameraDeviceDescriptor,
  CameraListRequest,
  CameraListResponse,
  CameraProvider,
  CameraProviderContext,
  CameraProviderId,
  CameraProviderSelectionAttempt,
  CameraProviderSelectionTrace,
  CameraProviderRuntimeHealth,
  CameraSnapshotRequest,
  CameraSnapshotResponse,
} from "./camera-contract.js";
import { observeCameraDeviceAliasMemory } from "./camera-device-alias-state.js";
import { isCameraProviderId } from "./camera-contract.js";
import { browserLoopbackCameraProvider } from "./camera-browser-loopback-provider.js";
import { buildCameraProviderHealthCheck } from "./camera-governance.js";
import { NativeDesktopCameraProvider } from "./camera-native-desktop-provider.js";
import { readNativeDesktopHelperConfigFromEnv } from "./camera-native-desktop-stdio-client.js";

const DEFAULT_CAMERA_PROVIDER_SELECTION_POLICY = "prefer_native_desktop" as const;
const DEFAULT_CAMERA_PROVIDER_ORDER: CameraProviderId[] = [
  "native_desktop",
  "browser_loopback",
  "node_device",
];
const DEFAULT_CAMERA_PROVIDER_RUNTIME_HEALTH_BLOCK_MS = 5 * 60 * 1_000;

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function dedupeProviderIds(providerIds: readonly CameraProviderId[]): CameraProviderId[] {
  const seen = new Set<CameraProviderId>();
  const ordered: CameraProviderId[] = [];
  for (const providerId of providerIds) {
    if (seen.has(providerId)) {
      continue;
    }
    seen.add(providerId);
    ordered.push(providerId);
  }
  return ordered;
}

function normalizeDate(value: string | number | Date | undefined): Date | undefined {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? undefined : value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const normalized = new Date(value);
    return Number.isNaN(normalized.getTime()) ? undefined : normalized;
  }
  return undefined;
}

function buildFallbackChain(selection: CameraProviderSelectionTrace): string[] | undefined {
  const chain = selection.attempts
    .filter((attempt) => attempt.outcome === "skipped")
    .map((attempt) => `${attempt.provider}:${attempt.reason}`);
  return chain.length ? chain : undefined;
}

function finalizeSelectionTrace(
  selection: Omit<
    CameraProviderSelectionTrace,
    "registeredProviders" | "skippedPreferredProviders" | "availableFallbackProviders" | "missingFallbackProviders"
  >,
  registeredProviders: CameraProviderId[],
): CameraProviderSelectionTrace {
  const selectedIndex = selection.preferredOrder.indexOf(selection.selectedProvider);
  const providersAfterSelected = selectedIndex >= 0
    ? selection.preferredOrder.slice(selectedIndex + 1)
    : [];
  return {
    ...selection,
    registeredProviders,
    skippedPreferredProviders: selection.attempts
      .filter((attempt) => attempt.outcome === "skipped")
      .map((attempt) => attempt.provider),
    availableFallbackProviders: providersAfterSelected.filter((providerId) => registeredProviders.includes(providerId)),
    missingFallbackProviders: providersAfterSelected.filter((providerId) => !registeredProviders.includes(providerId)),
  };
}

async function applyResponseObservability<T extends CameraListResponse | CameraSnapshotResponse>(
  context: CameraProviderContext,
  response: T,
  selection: CameraProviderSelectionTrace,
): Promise<T> {
  const fallbackChain = buildFallbackChain(selection);
  const aliasObservation = await observeCameraDeviceAliasMemory(context.stateDir, response.state.devices);
  const runtimeHealth = response.state.providerMetadata?.runtimeHealth as CameraProviderRuntimeHealth | undefined;
  const providerHealthCheck = buildCameraProviderHealthCheck({
    providerId: response.provider,
    source: "runtime",
    checkedAt: response.state.updatedAt ?? response.state.startedAt,
    providerStatus: response.state.providerStatus ?? (response.state.status === "error" ? "unavailable" : "available"),
    permissionState: response.state.permissionState,
    issues: response.state.issues,
    runtimeHealth,
    selection,
    mirrorStatus: response.state.status,
  });
  const selectedDevice = aliasObservation.devices.find((device) => {
    if (response.state.selectedDeviceRef && device.deviceRef === response.state.selectedDeviceRef) {
      return true;
    }
    if (response.state.selectedDeviceId && device.deviceId === response.state.selectedDeviceId) {
      return true;
    }
    return false;
  });
  return {
    ...response,
    state: {
      ...response.state,
      providerHealthCheck,
      providerSelection: selection,
      devices: aliasObservation.devices,
      ...(selectedDevice?.alias ? { selectedDeviceAlias: selectedDevice.alias } : {}),
      ...(selectedDevice?.favorite === true ? { selectedDeviceFavorite: true } : {}),
      providerMetadata: {
        ...(response.state.providerMetadata ?? {}),
        aliasMemory: aliasObservation.summary,
      },
      ...(fallbackChain ? { fallbackChain } : {}),
    },
  };
}

export function getCameraProviderIdFromDeviceRef(
  deviceRef: string | undefined,
): CameraProviderId | undefined {
  const normalized = normalizeString(deviceRef);
  if (!normalized) {
    return undefined;
  }
  const prefix = normalized.split(":", 1)[0];
  return isCameraProviderId(prefix) ? prefix : undefined;
}

export class CameraProviderRegistry {
  private readonly providers = new Map<CameraProviderId, CameraProvider>();
  private defaultProviderId?: CameraProviderId;

  register(provider: CameraProvider, options: { makeDefault?: boolean } = {}): void {
    const providerId = normalizeString(provider?.id);
    if (!isCameraProviderId(providerId)) {
      throw new Error(`Invalid camera provider id: ${providerId || "<empty>"}`);
    }
    this.providers.set(providerId, provider);
    if (options.makeDefault || !this.defaultProviderId) {
      this.defaultProviderId = providerId;
    }
  }

  unregister(providerId: CameraProviderId): void {
    const normalizedProviderId = normalizeString(providerId);
    if (!isCameraProviderId(normalizedProviderId)) {
      return;
    }
    this.providers.delete(normalizedProviderId);
    if (this.defaultProviderId === normalizedProviderId) {
      this.defaultProviderId = this.providers.keys().next().value;
    }
  }

  has(providerId: CameraProviderId): boolean {
    return this.providers.has(providerId);
  }

  get(providerId: CameraProviderId): CameraProvider | undefined {
    return this.providers.get(providerId);
  }

  listProviderIds(): CameraProviderId[] {
    return Array.from(this.providers.keys());
  }

  getDefaultProviderId(): CameraProviderId | undefined {
    return this.defaultProviderId;
  }

  setDefaultProviderId(providerId: CameraProviderId): void {
    if (!this.providers.has(providerId)) {
      throw new Error(`camera provider not registered: ${providerId}`);
    }
    this.defaultProviderId = providerId;
  }

  private getPolicyPreferredOrder(): CameraProviderId[] {
    return dedupeProviderIds([
      ...DEFAULT_CAMERA_PROVIDER_ORDER,
      ...this.listProviderIds(),
    ]);
  }

  private getProviderRuntimeHealth(
    providerId: CameraProviderId,
    options?: {
      healthSourceRegistry?: Pick<CameraProviderRegistry, "get">;
    },
  ): CameraProviderRuntimeHealth | undefined {
    const provider = options?.healthSourceRegistry?.get(providerId) ?? this.providers.get(providerId);
    if (!provider || typeof provider.getRuntimeHealth !== "function") {
      return undefined;
    }
    return provider.getRuntimeHealth();
  }

  private getRuntimeHealthBlockReason(
    providerId: CameraProviderId,
    options?: {
      healthSourceRegistry?: Pick<CameraProviderRegistry, "get">;
      now?: string | number | Date;
    },
  ): string | undefined {
    const runtimeHealth = this.getProviderRuntimeHealth(providerId, options);
    if (!runtimeHealth || runtimeHealth.status !== "error" || runtimeHealth.consecutiveFailures <= 0) {
      return undefined;
    }
    const observedAt = normalizeDate(runtimeHealth.observedAt);
    const now = normalizeDate(options?.now) ?? new Date();
    if (!observedAt) {
      return undefined;
    }
    const ageMs = Math.max(0, now.getTime() - observedAt.getTime());
    if (ageMs > DEFAULT_CAMERA_PROVIDER_RUNTIME_HEALTH_BLOCK_MS) {
      return undefined;
    }
    const detailParts = [
      `runtime_health_error`,
      `failures=${runtimeHealth.consecutiveFailures}`,
      `ageMs=${ageMs}`,
      runtimeHealth.lastFailure?.code ? `code=${runtimeHealth.lastFailure.code}` : "",
      runtimeHealth.lastFailure?.recoveryHint ? `hint=${runtimeHealth.lastFailure.recoveryHint}` : "",
    ].filter(Boolean);
    return detailParts.join(", ");
  }

  resolveProviderSelection(input: {
    provider?: CameraProviderId;
    deviceRef?: string;
  }, options?: {
    healthSourceRegistry?: Pick<CameraProviderRegistry, "get">;
    now?: string | number | Date;
  }): CameraProviderSelectionTrace | undefined {
    const requestedDeviceRef = normalizeString(input.deviceRef) || undefined;
    const preferredOrder = this.getPolicyPreferredOrder();
    const registeredProviders = preferredOrder.filter((providerId) => this.providers.has(providerId));

    if (input.provider) {
      return finalizeSelectionTrace({
        policy: DEFAULT_CAMERA_PROVIDER_SELECTION_POLICY,
        preferredOrder,
        ...(this.defaultProviderId ? { configuredDefaultProvider: this.defaultProviderId } : {}),
        requestedProvider: input.provider,
        ...(requestedDeviceRef ? { requestedDeviceRef } : {}),
        selectedProvider: input.provider,
        reason: "explicit_provider",
        fallbackApplied: false,
        attempts: [{
          provider: input.provider,
          outcome: "selected",
          reason: "explicit_provider",
        }],
      }, registeredProviders);
    }

    const providerFromDeviceRef = getCameraProviderIdFromDeviceRef(requestedDeviceRef);
    if (providerFromDeviceRef) {
      return finalizeSelectionTrace({
        policy: DEFAULT_CAMERA_PROVIDER_SELECTION_POLICY,
        preferredOrder,
        ...(this.defaultProviderId ? { configuredDefaultProvider: this.defaultProviderId } : {}),
        ...(requestedDeviceRef ? { requestedDeviceRef } : {}),
        selectedProvider: providerFromDeviceRef,
        reason: "device_ref_provider",
        fallbackApplied: false,
        attempts: [{
          provider: providerFromDeviceRef,
          outcome: "selected",
          reason: "device_ref_provider",
        }],
      }, registeredProviders);
    }

    const attempts: CameraProviderSelectionAttempt[] = [];
    for (const providerId of preferredOrder) {
      if (this.providers.has(providerId)) {
        const runtimeHealthBlockReason = this.getRuntimeHealthBlockReason(providerId, options);
        if (runtimeHealthBlockReason) {
          attempts.push({
            provider: providerId,
            outcome: "skipped",
            reason: "provider_runtime_unhealthy",
            detail: runtimeHealthBlockReason,
          });
          continue;
        }
        const fallbackApplied = attempts.some((attempt) => attempt.outcome === "skipped");
        attempts.push({
          provider: providerId,
          outcome: "selected",
          reason: fallbackApplied ? "policy_fallback" : "policy_preferred",
        });
        const healthFallbackApplied = attempts.some((attempt) => attempt.reason === "provider_runtime_unhealthy");
        return finalizeSelectionTrace({
          policy: DEFAULT_CAMERA_PROVIDER_SELECTION_POLICY,
          preferredOrder,
          ...(this.defaultProviderId ? { configuredDefaultProvider: this.defaultProviderId } : {}),
          selectedProvider: providerId,
          reason: fallbackApplied
            ? (healthFallbackApplied ? "policy_runtime_health_fallback_provider" : "policy_fallback_provider")
            : "policy_preferred_provider",
          fallbackApplied,
          attempts,
        }, registeredProviders);
      }
      attempts.push({
        provider: providerId,
        outcome: "skipped",
        reason: "provider_not_registered",
        detail: "Provider is not currently registered in the active camera registry.",
      });
    }

    return undefined;
  }

  resolveProviderId(input: {
    provider?: CameraProviderId;
    deviceRef?: string;
  }, options?: {
    healthSourceRegistry?: Pick<CameraProviderRegistry, "get">;
    now?: string | number | Date;
  }): CameraProviderId | undefined {
    return this.resolveProviderSelection(input, options)?.selectedProvider;
  }

  resolve(input: {
    provider?: CameraProviderId;
    deviceRef?: string;
  }): CameraProvider {
    const resolved = this.resolveDetailed(input);
    return resolved.provider;
  }

  resolveDetailed(input: {
    provider?: CameraProviderId;
    deviceRef?: string;
  }, options?: {
    healthSourceRegistry?: Pick<CameraProviderRegistry, "get">;
    now?: string | number | Date;
  }): {
    providerId: CameraProviderId;
    provider: CameraProvider;
    selection: CameraProviderSelectionTrace;
  } {
    const selection = this.resolveProviderSelection(input, options);
    if (!selection) {
      throw new Error("No camera provider is available.");
    }
    const providerId = selection.selectedProvider;
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Camera provider is not registered: ${providerId}`);
    }
    return {
      providerId,
      provider,
      selection,
    };
  }
}

export function createDefaultCameraProviderRegistry(
  env: NodeJS.ProcessEnv = process.env,
): CameraProviderRegistry {
  const registry = new CameraProviderRegistry();
  registry.register(browserLoopbackCameraProvider, { makeDefault: true });

  const nativeDesktopHelperConfig = readNativeDesktopHelperConfigFromEnv(env);
  if (nativeDesktopHelperConfig) {
    registry.register(new NativeDesktopCameraProvider({
      helper: nativeDesktopHelperConfig,
    }));
  }

  return registry;
}

const defaultCameraProviderRegistry = createDefaultCameraProviderRegistry();

export function getDefaultCameraProviderRegistry(): CameraProviderRegistry {
  return defaultCameraProviderRegistry;
}

export async function listCameraDevices(
  context: CameraProviderContext,
  input: CameraListRequest,
): Promise<CameraListResponse> {
  const resolved = defaultCameraProviderRegistry.resolveDetailed(input);
  const response = await resolved.provider.listDevices(input, context);
  return applyResponseObservability(context, response, resolved.selection);
}

export async function captureCameraSnapshot(
  context: CameraProviderContext,
  input: CameraSnapshotRequest,
): Promise<CameraSnapshotResponse> {
  const resolved = defaultCameraProviderRegistry.resolveDetailed(input);
  const response = await resolved.provider.captureSnapshot(input, context);
  return applyResponseObservability(context, response, resolved.selection);
}
