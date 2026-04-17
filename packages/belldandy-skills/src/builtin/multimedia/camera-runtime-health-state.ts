import fs from "node:fs/promises";
import path from "node:path";

import type {
  CameraPermissionState,
  CameraProviderId,
  CameraProviderRuntimeEvent,
  CameraProviderRuntimeHealth,
  CameraProviderRuntimeHistoryWindow,
  CameraProviderRuntimeOperation,
  CameraProviderStatus,
} from "./camera-contract.js";

type PersistedCameraRuntimeHealthSnapshotV1 = {
  version: 1;
  provider: CameraProviderId;
  savedAt: string;
  runtimeHealth: CameraProviderRuntimeHealth;
};

export type CameraRuntimeHealthSnapshot = PersistedCameraRuntimeHealthSnapshotV1;

export type CameraRuntimeHealthRetentionPolicy = {
  eventLimit: number;
  horizonMs: number;
};

export type CameraRuntimeHealthSnapshotIssueCode =
  | "snapshot_unreadable"
  | "snapshot_invalid"
  | "snapshot_unsupported_version";

export type CameraRuntimeHealthSnapshotIssue = {
  code: CameraRuntimeHealthSnapshotIssueCode;
  message: string;
  repaired?: boolean;
  quarantinePath?: string;
};

export type CameraRuntimeHealthSnapshotReadResult = {
  snapshot?: CameraRuntimeHealthSnapshot;
  snapshotPath: string;
  retention: CameraRuntimeHealthRetentionPolicy;
  issue?: CameraRuntimeHealthSnapshotIssue;
};

const SNAPSHOT_VERSION = 1 as const;
const DEFAULT_EVENT_LIMIT = 32;
const DEFAULT_HORIZON_MS = 7 * 24 * 60 * 60 * 1_000;
const FUTURE_EVENT_SKEW_MS = 5 * 60 * 1_000;
const RUNTIME_STATUSES = new Set(["idle", "healthy", "degraded", "error"]);
const PROVIDER_STATUSES = new Set(["available", "unavailable", "degraded"]);
const PERMISSION_STATES = new Set(["granted", "denied", "prompt", "not_applicable", "unknown"]);
const RUNTIME_OPERATIONS = new Set(["diagnose", "list_devices", "capture_snapshot"]);

export const DEFAULT_CAMERA_RUNTIME_HEALTH_RETENTION_POLICY: CameraRuntimeHealthRetentionPolicy = {
  eventLimit: DEFAULT_EVENT_LIMIT,
  horizonMs: DEFAULT_HORIZON_MS,
};

function normalizeString(value: unknown): string | undefined {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || undefined;
}

function normalizeNonNegativeNumber(value: unknown, fallback = 0): number {
  const normalized = Number(value);
  if (!Number.isFinite(normalized) || normalized < 0) {
    return fallback;
  }
  return Math.floor(normalized);
}

function normalizeDate(value: string | number | Date | undefined): Date {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? new Date() : value;
  }
  if (typeof value === "string" || typeof value === "number") {
    const normalized = new Date(value);
    return Number.isNaN(normalized.getTime()) ? new Date() : normalized;
  }
  return new Date();
}

function normalizeRetentionPolicy(
  policy: Partial<CameraRuntimeHealthRetentionPolicy> | undefined,
): CameraRuntimeHealthRetentionPolicy {
  const eventLimit = normalizeNonNegativeNumber(policy?.eventLimit, DEFAULT_EVENT_LIMIT);
  const horizonMs = normalizeNonNegativeNumber(policy?.horizonMs, DEFAULT_HORIZON_MS);
  return {
    eventLimit: eventLimit > 0 ? eventLimit : DEFAULT_EVENT_LIMIT,
    horizonMs: horizonMs > 0 ? horizonMs : DEFAULT_HORIZON_MS,
  };
}

function normalizeRuntimeOperation(value: unknown): CameraProviderRuntimeOperation | undefined {
  const normalized = normalizeString(value);
  return normalized && RUNTIME_OPERATIONS.has(normalized)
    ? normalized as CameraProviderRuntimeOperation
    : undefined;
}

function normalizeProviderStatus(value: unknown): CameraProviderStatus | undefined {
  const normalized = normalizeString(value);
  return normalized && PROVIDER_STATUSES.has(normalized)
    ? normalized as CameraProviderStatus
    : undefined;
}

function normalizePermissionState(value: unknown): CameraPermissionState | undefined {
  const normalized = normalizeString(value);
  return normalized && PERMISSION_STATES.has(normalized)
    ? normalized as CameraPermissionState
    : undefined;
}

function normalizeRuntimeEvent(value: unknown): CameraProviderRuntimeEvent | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const at = normalizeString(record.at);
  const operation = normalizeRuntimeOperation(record.operation);
  const outcome = record.outcome === "success" || record.outcome === "failure"
    ? record.outcome
    : undefined;
  if (!at || !operation || !outcome) {
    return null;
  }
  return {
    at,
    operation,
    outcome,
    ...(normalizeProviderStatus(record.providerStatus)
      ? { providerStatus: normalizeProviderStatus(record.providerStatus) }
      : {}),
    ...(normalizeString(record.helperStatus) ? { helperStatus: normalizeString(record.helperStatus) } : {}),
    ...(normalizeString(record.code) ? { code: normalizeString(record.code) } : {}),
    ...(normalizeString(record.message) ? { message: normalizeString(record.message) } : {}),
    ...(record.recovered === true ? { recovered: true } : {}),
  };
}

function buildRuntimeHistoryWindowFromEvents(
  events: readonly CameraProviderRuntimeEvent[],
  size: number,
): CameraProviderRuntimeHistoryWindow {
  const failureCodeCounts: Record<string, number> = {};
  let successCount = 0;
  let failureCount = 0;
  let recoveredSuccessCount = 0;

  for (const item of events) {
    if (item.outcome === "success") {
      successCount += 1;
      if (item.recovered) {
        recoveredSuccessCount += 1;
      }
      continue;
    }
    failureCount += 1;
    if (item.code) {
      failureCodeCounts[item.code] = (failureCodeCounts[item.code] ?? 0) + 1;
    }
  }

  return {
    size,
    eventCount: events.length,
    successCount,
    failureCount,
    recoveredSuccessCount,
    failureCodeCounts,
    lastEvents: events.map((event) => ({ ...event })),
  };
}

function normalizeRuntimeHistoryWindow(
  value: unknown,
  policy: CameraRuntimeHealthRetentionPolicy,
  now: Date,
): CameraProviderRuntimeHistoryWindow {
  const record = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const minTimestamp = now.getTime() - policy.horizonMs;
  const maxTimestamp = now.getTime() + FUTURE_EVENT_SKEW_MS;
  const lastEvents = Array.isArray(record.lastEvents)
    ? record.lastEvents
      .map((item) => normalizeRuntimeEvent(item))
      .filter((item): item is CameraProviderRuntimeEvent => Boolean(item))
      .filter((item) => {
        const timestamp = new Date(item.at).getTime();
        return Number.isFinite(timestamp) && timestamp >= minTimestamp && timestamp <= maxTimestamp;
      })
      .slice(-policy.eventLimit)
    : [];
  const requestedSize = normalizeNonNegativeNumber(record.size, policy.eventLimit);
  const size = Math.min(Math.max(requestedSize || policy.eventLimit, 1), policy.eventLimit);
  return buildRuntimeHistoryWindowFromEvents(lastEvents, size);
}

function normalizeRuntimeHealth(
  value: unknown,
  policy: CameraRuntimeHealthRetentionPolicy,
  now: Date,
): CameraProviderRuntimeHealth | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const status = normalizeString(record.status);
  const observedAt = normalizeString(record.observedAt);
  if (!status || !RUNTIME_STATUSES.has(status) || !observedAt) {
    return null;
  }
  const lastFailure = record.lastFailure && typeof record.lastFailure === "object" && !Array.isArray(record.lastFailure)
    ? record.lastFailure as Record<string, unknown>
    : undefined;
  const lastFailureOperation = normalizeRuntimeOperation(lastFailure?.operation);
  const lastFailureAt = normalizeString(lastFailure?.at);
  const lastFailureMessage = normalizeString(lastFailure?.message);
  return {
    status: status as CameraProviderRuntimeHealth["status"],
    observedAt,
    ...(normalizeProviderStatus(record.currentAvailability)
      ? { currentAvailability: normalizeProviderStatus(record.currentAvailability) }
      : {}),
    ...(normalizeString(record.helperStatus) ? { helperStatus: normalizeString(record.helperStatus) } : {}),
    ...(normalizePermissionState(record.permissionState)
      ? { permissionState: normalizePermissionState(record.permissionState) }
      : {}),
    ...(normalizeRuntimeOperation(record.lastOperation)
      ? { lastOperation: normalizeRuntimeOperation(record.lastOperation) }
      : {}),
    ...(normalizeString(record.lastSuccessAt) ? { lastSuccessAt: normalizeString(record.lastSuccessAt) } : {}),
    ...(normalizeRuntimeOperation(record.lastSuccessOperation)
      ? { lastSuccessOperation: normalizeRuntimeOperation(record.lastSuccessOperation) }
      : {}),
    ...(lastFailureAt && lastFailureOperation && lastFailureMessage
      ? {
        lastFailure: {
          at: lastFailureAt,
          operation: lastFailureOperation,
          ...(normalizeString(lastFailure?.code) ? { code: normalizeString(lastFailure?.code) } : {}),
          message: lastFailureMessage,
          ...(normalizeString(lastFailure?.recoveryHint)
            ? { recoveryHint: normalizeString(lastFailure?.recoveryHint) }
            : {}),
        },
      }
      : {}),
    ...(normalizeString(record.lastRecoveryAt) ? { lastRecoveryAt: normalizeString(record.lastRecoveryAt) } : {}),
    consecutiveFailures: normalizeNonNegativeNumber(record.consecutiveFailures),
    historyWindow: normalizeRuntimeHistoryWindow(record.historyWindow, policy, now),
  };
}

function sanitizeRuntimeHealth(
  runtimeHealth: CameraProviderRuntimeHealth,
  policy: CameraRuntimeHealthRetentionPolicy,
  now: Date,
): CameraProviderRuntimeHealth {
  return normalizeRuntimeHealth(runtimeHealth, policy, now) ?? {
    status: "idle",
    observedAt: now.toISOString(),
    consecutiveFailures: 0,
    historyWindow: buildRuntimeHistoryWindowFromEvents([], policy.eventLimit),
  };
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${Date.now()}.${Math.random().toString(16).slice(2)}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2), "utf-8");
  await fs.rename(tempPath, filePath);
}

async function quarantineSnapshot(
  filePath: string,
  code: CameraRuntimeHealthSnapshotIssueCode,
): Promise<string | undefined> {
  const quarantinePath = `${filePath}.${Date.now()}.${code}.invalid`;
  try {
    await fs.rename(filePath, quarantinePath);
    return quarantinePath;
  } catch {
    return undefined;
  }
}

export function resolveCameraRuntimeHealthSnapshotPath(
  stateDir: string,
  providerId: CameraProviderId,
): string {
  return path.join(path.resolve(stateDir), "diagnostics", "camera-runtime", `${providerId}-runtime-health.json`);
}

export function getCameraRuntimeHealthRetentionPolicy(
  policy?: Partial<CameraRuntimeHealthRetentionPolicy>,
): CameraRuntimeHealthRetentionPolicy {
  return normalizeRetentionPolicy(policy);
}

export async function inspectCameraRuntimeHealthSnapshot(
  stateDir: string | undefined,
  providerId: CameraProviderId,
  options: {
    now?: string | number | Date;
    retention?: Partial<CameraRuntimeHealthRetentionPolicy>;
  } = {},
): Promise<CameraRuntimeHealthSnapshotReadResult | null> {
  const normalizedStateDir = normalizeString(stateDir);
  if (!normalizedStateDir) {
    return null;
  }
  const snapshotPath = resolveCameraRuntimeHealthSnapshotPath(normalizedStateDir, providerId);
  const now = normalizeDate(options.now);
  const retention = normalizeRetentionPolicy(options.retention);
  try {
    const raw = await fs.readFile(snapshotPath, "utf-8");
    const parsed = raw.trim() ? JSON.parse(raw) as Record<string, unknown> : {};
    if (parsed.version !== SNAPSHOT_VERSION) {
      const quarantinePath = await quarantineSnapshot(snapshotPath, "snapshot_unsupported_version");
      return {
        snapshotPath,
        retention,
        issue: {
          code: "snapshot_unsupported_version",
          message: `camera runtime health snapshot version is unsupported: ${String(parsed.version ?? "<missing>")}`,
          repaired: Boolean(quarantinePath),
          ...(quarantinePath ? { quarantinePath } : {}),
        },
      };
    }
    const runtimeHealth = normalizeRuntimeHealth(parsed.runtimeHealth, retention, now);
    const savedAt = normalizeString(parsed.savedAt);
    if (parsed.provider !== providerId || !runtimeHealth || !savedAt) {
      const quarantinePath = await quarantineSnapshot(snapshotPath, "snapshot_invalid");
      return {
        snapshotPath,
        retention,
        issue: {
          code: "snapshot_invalid",
          message: "camera runtime health snapshot is missing required fields and has been ignored.",
          repaired: Boolean(quarantinePath),
          ...(quarantinePath ? { quarantinePath } : {}),
        },
      };
    }
    const snapshot: CameraRuntimeHealthSnapshot = {
      version: SNAPSHOT_VERSION,
      provider: providerId,
      savedAt,
      runtimeHealth,
    };
    if (JSON.stringify(parsed) !== JSON.stringify(snapshot)) {
      await writeJsonAtomic(snapshotPath, snapshot);
    }
    return {
      snapshotPath,
      retention,
      snapshot,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return {
        snapshotPath,
        retention,
      };
    }
    const quarantinePath = await quarantineSnapshot(snapshotPath, "snapshot_unreadable");
    return {
      snapshotPath,
      retention,
      issue: {
        code: "snapshot_unreadable",
        message: `camera runtime health snapshot could not be read: ${error instanceof Error ? error.message : String(error)}`,
        repaired: Boolean(quarantinePath),
        ...(quarantinePath ? { quarantinePath } : {}),
      },
    };
  }
}

export async function readCameraRuntimeHealthSnapshot(
  stateDir: string | undefined,
  providerId: CameraProviderId,
  options: {
    now?: string | number | Date;
    retention?: Partial<CameraRuntimeHealthRetentionPolicy>;
  } = {},
): Promise<CameraRuntimeHealthSnapshot | null> {
  const result = await inspectCameraRuntimeHealthSnapshot(stateDir, providerId, options);
  return result?.snapshot ?? null;
}

export async function writeCameraRuntimeHealthSnapshot(
  stateDir: string | undefined,
  providerId: CameraProviderId,
  runtimeHealth: CameraProviderRuntimeHealth,
  options: {
    now?: string | number | Date;
    retention?: Partial<CameraRuntimeHealthRetentionPolicy>;
  } = {},
): Promise<CameraRuntimeHealthSnapshot | null> {
  const normalizedStateDir = normalizeString(stateDir);
  if (!normalizedStateDir) {
    return null;
  }
  const now = normalizeDate(options.now);
  const retention = normalizeRetentionPolicy(options.retention);
  const snapshot: CameraRuntimeHealthSnapshot = {
    version: SNAPSHOT_VERSION,
    provider: providerId,
    savedAt: now.toISOString(),
    runtimeHealth: sanitizeRuntimeHealth(runtimeHealth, retention, now),
  };
  await writeJsonAtomic(resolveCameraRuntimeHealthSnapshotPath(normalizedStateDir, providerId), snapshot);
  return snapshot;
}
