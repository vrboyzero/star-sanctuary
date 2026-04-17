import type {
  CameraListRequest,
  CameraListResponse,
  CameraProvider,
  CameraProviderContext,
  CameraProviderId,
  CameraSnapshotRequest,
  CameraSnapshotResponse,
} from "./camera-contract.js";
import { isCameraProviderId } from "./camera-contract.js";
import { browserLoopbackCameraProvider } from "./camera-browser-loopback-provider.js";
import { NativeDesktopCameraProvider } from "./camera-native-desktop-provider.js";
import { readNativeDesktopHelperConfigFromEnv } from "./camera-native-desktop-stdio-client.js";

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
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

  resolveProviderId(input: {
    provider?: CameraProviderId;
    deviceRef?: string;
  }): CameraProviderId | undefined {
    if (input.provider) {
      return input.provider;
    }
    const providerFromDeviceRef = getCameraProviderIdFromDeviceRef(input.deviceRef);
    if (providerFromDeviceRef) {
      return providerFromDeviceRef;
    }
    if (this.defaultProviderId) {
      return this.defaultProviderId;
    }
    if (this.providers.size === 1) {
      return this.providers.keys().next().value;
    }
    return undefined;
  }

  resolve(input: {
    provider?: CameraProviderId;
    deviceRef?: string;
  }): CameraProvider {
    const providerId = this.resolveProviderId(input);
    if (!providerId) {
      throw new Error("No camera provider is available.");
    }
    const provider = this.providers.get(providerId);
    if (!provider) {
      throw new Error(`Camera provider is not registered: ${providerId}`);
    }
    return provider;
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
  const provider = defaultCameraProviderRegistry.resolve(input);
  return provider.listDevices(input, context);
}

export async function captureCameraSnapshot(
  context: CameraProviderContext,
  input: CameraSnapshotRequest,
): Promise<CameraSnapshotResponse> {
  const provider = defaultCameraProviderRegistry.resolve(input);
  return provider.captureSnapshot(input, context);
}
