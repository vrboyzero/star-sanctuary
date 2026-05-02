import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type {
  CameraDeviceAliasSource,
  CameraDeviceDescriptor,
  CameraProviderId,
} from "./camera-contract.js";

type PersistedCameraDeviceAliasSnapshotV1 = {
  version: 1;
  savedAt: string;
  entries: Array<{
    identityKey: string;
    provider: CameraProviderId;
    alias: string;
    deviceRef: string;
    stableKey?: string;
    firstSeenAt: string;
    lastSeenAt: string;
    labels: string[];
  }>;
};

type PersistedCameraDeviceAliasSnapshotV2 = {
  version: 2;
  savedAt: string;
  entries: CameraDeviceAliasMemoryEntry[];
};

export type CameraDeviceAliasMemoryEntry = {
  identityKey: string;
  provider: CameraProviderId;
  alias: string;
  manualAlias?: string;
  deviceRef: string;
  stableKey?: string;
  favorite?: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  labels: string[];
};

export type CameraDeviceAliasSnapshot = PersistedCameraDeviceAliasSnapshotV2;

export type CameraDeviceAliasMemoryListEntry = {
  identityKey: string;
  provider: CameraProviderId;
  deviceRef: string;
  stableKey?: string;
  learnedAlias: string;
  alias: string;
  aliasSource: CameraDeviceAliasSource;
  manualAlias?: string;
  favorite: boolean;
  firstSeenAt: string;
  lastSeenAt: string;
  labels: string[];
};

export type CameraDeviceAliasMemorySummary = {
  snapshotPath?: string;
  entryCount: number;
  observedCount: number;
  manualAliasCount: number;
  favoriteCount: number;
};

export type CameraDeviceAliasObservationResult = {
  devices: CameraDeviceDescriptor[];
  summary: CameraDeviceAliasMemorySummary;
};

export type CameraDeviceAliasListResult = {
  entries: CameraDeviceAliasMemoryListEntry[];
  summary: CameraDeviceAliasMemorySummary;
};

export type UpsertCameraDeviceAliasMemoryEntryInput = {
  provider?: CameraProviderId;
  deviceRef: string;
  stableKey?: string;
  label?: string;
  alias?: string | null;
  favorite?: boolean;
};

export type UpsertCameraDeviceAliasMemoryEntryResult = {
  entry: CameraDeviceAliasMemoryListEntry;
  summary: CameraDeviceAliasMemorySummary;
};

export type RemoveCameraDeviceAliasMemoryEntryInput = {
  provider?: CameraProviderId;
  deviceRef: string;
  stableKey?: string;
};

export type RemoveCameraDeviceAliasMemoryEntryResult = {
  removed: boolean;
  entry?: CameraDeviceAliasMemoryListEntry;
  summary: CameraDeviceAliasMemorySummary;
};

const SNAPSHOT_VERSION = 2 as const;
const MAX_LABEL_HISTORY = 8;
const RENAME_RETRIES = 3;
const RENAME_RETRY_DELAY_MS = 50;
const CAMERA_PROVIDER_IDS: CameraProviderId[] = [
  "browser_loopback",
  "native_desktop",
  "node_device",
];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeString(value: unknown): string | undefined {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || undefined;
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

function normalizeProviderId(value: unknown): CameraProviderId | undefined {
  const normalized = normalizeString(value);
  if (!normalized) {
    return undefined;
  }
  return CAMERA_PROVIDER_IDS.includes(normalized as CameraProviderId)
    ? normalized as CameraProviderId
    : undefined;
}

function resolveProviderId(input: {
  provider?: CameraProviderId;
  deviceRef?: string;
}): CameraProviderId | undefined {
  if (input.provider) {
    return input.provider;
  }
  const normalizedDeviceRef = normalizeString(input.deviceRef);
  if (!normalizedDeviceRef) {
    return undefined;
  }
  return normalizeProviderId(normalizedDeviceRef.split(":", 1)[0]);
}

function normalizeLabels(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const item of value) {
    const normalized = normalizeString(item);
    if (!normalized) {
      continue;
    }
    const key = normalized.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    labels.push(normalized);
  }
  return labels.slice(0, MAX_LABEL_HISTORY);
}

function normalizeEntry(value: unknown): CameraDeviceAliasMemoryEntry | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const identityKey = normalizeString(record.identityKey);
  const provider = normalizeProviderId(record.provider);
  const alias = normalizeString(record.alias);
  const deviceRef = normalizeString(record.deviceRef);
  const firstSeenAt = normalizeString(record.firstSeenAt);
  const lastSeenAt = normalizeString(record.lastSeenAt);
  if (!identityKey || !provider || !alias || !deviceRef || !firstSeenAt || !lastSeenAt) {
    return null;
  }
  return {
    identityKey,
    provider,
    alias,
    ...(normalizeString(record.manualAlias) ? { manualAlias: normalizeString(record.manualAlias) } : {}),
    deviceRef,
    ...(normalizeString(record.stableKey) ? { stableKey: normalizeString(record.stableKey) } : {}),
    ...(record.favorite === true ? { favorite: true } : {}),
    firstSeenAt,
    lastSeenAt,
    labels: normalizeLabels(record.labels),
  };
}

function normalizeSnapshot(value: unknown): CameraDeviceAliasSnapshot | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const version = record.version;
  if (version !== 1 && version !== SNAPSHOT_VERSION) {
    return null;
  }
  const savedAt = normalizeString(record.savedAt);
  if (!savedAt) {
    return null;
  }
  const entries = Array.isArray(record.entries)
    ? record.entries
      .map((item) => normalizeEntry(item))
      .filter((item): item is CameraDeviceAliasMemoryEntry => Boolean(item))
    : [];
  return {
    version: SNAPSHOT_VERSION,
    savedAt,
    entries,
  };
}

function buildIdentityKey(device: Pick<CameraDeviceDescriptor, "provider" | "deviceRef" | "stableKey">): string {
  const stableKey = normalizeString(device.stableKey);
  if (stableKey) {
    return `${device.provider}:stable:${stableKey}`;
  }
  return `${device.provider}:ref:${device.deviceRef}`;
}

function buildLookupKeys(device: Pick<CameraDeviceDescriptor, "provider" | "deviceRef" | "stableKey">): string[] {
  const keys = [buildIdentityKey(device)];
  const stableKey = normalizeString(device.stableKey);
  if (stableKey) {
    keys.push(`${device.provider}:ref:${device.deviceRef}`);
  }
  return Array.from(new Set(keys));
}

function buildAliasBaseName(device: Pick<CameraDeviceDescriptor, "label" | "provider" | "deviceRef" | "stableKey">): string {
  const normalizedLabel = normalizeString(device.label);
  if (normalizedLabel) {
    return normalizedLabel;
  }
  const stableKey = normalizeString(device.stableKey);
  if (stableKey) {
    return `${device.provider}:${stableKey.slice(-8)}`;
  }
  const deviceRef = normalizeString(device.deviceRef) ?? device.provider;
  return deviceRef.split(":").slice(-1)[0] || device.provider;
}

function normalizeAliasKey(value: string): string {
  return value.trim().toLowerCase();
}

function buildIdentitySuffix(identityKey: string): string {
  return identityKey.split(":").at(-1)?.slice(-6) || "device";
}

function buildEffectiveAlias(entry: Pick<CameraDeviceAliasMemoryEntry, "alias" | "manualAlias">): string {
  return normalizeString(entry.manualAlias) ?? entry.alias;
}

function buildAliasSource(entry: Pick<CameraDeviceAliasMemoryEntry, "manualAlias">): CameraDeviceAliasSource {
  return normalizeString(entry.manualAlias) ? "manual" : "learned";
}

function toListEntry(entry: CameraDeviceAliasMemoryEntry): CameraDeviceAliasMemoryListEntry {
  return {
    identityKey: entry.identityKey,
    provider: entry.provider,
    deviceRef: entry.deviceRef,
    ...(entry.stableKey ? { stableKey: entry.stableKey } : {}),
    learnedAlias: entry.alias,
    alias: buildEffectiveAlias(entry),
    aliasSource: buildAliasSource(entry),
    ...(entry.manualAlias ? { manualAlias: entry.manualAlias } : {}),
    favorite: entry.favorite === true,
    firstSeenAt: entry.firstSeenAt,
    lastSeenAt: entry.lastSeenAt,
    labels: [...entry.labels],
  };
}

function summarizeEntries(
  entries: readonly CameraDeviceAliasMemoryEntry[],
  options: {
    snapshotPath?: string;
    observedCount?: number;
  } = {},
): CameraDeviceAliasMemorySummary {
  const manualAliasCount = entries.filter((entry) => Boolean(normalizeString(entry.manualAlias))).length;
  const favoriteCount = entries.filter((entry) => entry.favorite === true).length;
  return {
    ...(options.snapshotPath ? { snapshotPath: options.snapshotPath } : {}),
    entryCount: entries.length,
    observedCount: options.observedCount ?? 0,
    manualAliasCount,
    favoriteCount,
  };
}

function allocateAlias(
  baseAlias: string,
  identityKey: string,
  aliasOwners: Map<string, string>,
): string {
  const normalizedBase = normalizeAliasKey(baseAlias);
  const owner = aliasOwners.get(normalizedBase);
  if (!owner || owner === identityKey) {
    aliasOwners.set(normalizedBase, identityKey);
    return baseAlias;
  }
  const aliasWithSuffix = `${baseAlias} [${buildIdentitySuffix(identityKey)}]`;
  aliasOwners.set(normalizeAliasKey(aliasWithSuffix), identityKey);
  return aliasWithSuffix;
}

async function writeJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tempPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  const content = JSON.stringify(value, null, 2);
  await fs.writeFile(tempPath, content, "utf-8");

  let lastErr: NodeJS.ErrnoException | null = null;
  for (let attempt = 0; attempt < RENAME_RETRIES; attempt += 1) {
    try {
      await fs.rename(tempPath, filePath);
      return;
    } catch (error) {
      lastErr = error as NodeJS.ErrnoException;
      if (attempt < RENAME_RETRIES - 1) {
        await delay(RENAME_RETRY_DELAY_MS);
      }
    }
  }

  if (process.platform === "win32" && lastErr && (lastErr.code === "EPERM" || lastErr.code === "EBUSY")) {
    await fs.writeFile(filePath, content, "utf-8");
    await fs.unlink(tempPath).catch(() => {});
    return;
  }

  await fs.unlink(tempPath).catch(() => {});
  throw lastErr;
}

async function loadCameraDeviceAliasSnapshotState(
  stateDir: string,
): Promise<{
  snapshotPath: string;
  snapshot: CameraDeviceAliasSnapshot | null;
  entries: Map<string, CameraDeviceAliasMemoryEntry>;
  aliasOwners: Map<string, string>;
}> {
  const snapshotPath = resolveCameraDeviceAliasSnapshotPath(stateDir);
  const snapshot = await readCameraDeviceAliasSnapshot(stateDir);
  const entries = new Map<string, CameraDeviceAliasMemoryEntry>();
  const aliasOwners = new Map<string, string>();

  for (const entry of snapshot?.entries ?? []) {
    const normalizedEntry = {
      ...entry,
      labels: [...entry.labels],
    };
    entries.set(normalizedEntry.identityKey, normalizedEntry);
    aliasOwners.set(normalizeAliasKey(buildEffectiveAlias(normalizedEntry)), normalizedEntry.identityKey);
  }

  return {
    snapshotPath,
    snapshot,
    entries,
    aliasOwners,
  };
}

function findMatchingEntry(
  entries: Map<string, CameraDeviceAliasMemoryEntry>,
  device: Pick<CameraDeviceDescriptor, "provider" | "deviceRef" | "stableKey">,
): CameraDeviceAliasMemoryEntry | undefined {
  const lookupKeys = buildLookupKeys(device);
  for (const key of lookupKeys) {
    const entry = entries.get(key);
    if (entry) {
      return entry;
    }
  }
  const normalizedStableKey = normalizeString(device.stableKey);
  for (const entry of entries.values()) {
    if (entry.provider !== device.provider) {
      continue;
    }
    if (entry.deviceRef === device.deviceRef) {
      return entry;
    }
    if (normalizedStableKey && entry.stableKey === normalizedStableKey) {
      return entry;
    }
  }
  return undefined;
}

async function writeSnapshotFromEntries(
  snapshotPath: string,
  entries: Map<string, CameraDeviceAliasMemoryEntry>,
  nowIso: string,
): Promise<CameraDeviceAliasSnapshot> {
  const snapshot: CameraDeviceAliasSnapshot = {
    version: SNAPSHOT_VERSION,
    savedAt: nowIso,
    entries: Array.from(entries.values())
      .sort((left, right) => left.identityKey.localeCompare(right.identityKey)),
  };
  await writeJsonAtomic(snapshotPath, snapshot);
  return snapshot;
}

function assertManualAliasAvailable(
  alias: string,
  identityKey: string,
  entries: Iterable<CameraDeviceAliasMemoryEntry>,
): void {
  const normalizedAlias = normalizeAliasKey(alias);
  for (const entry of entries) {
    if (entry.identityKey === identityKey) {
      continue;
    }
    if (normalizeAliasKey(buildEffectiveAlias(entry)) === normalizedAlias) {
      throw new Error(`alias_conflict: Alias "${alias}" is already used by ${entry.deviceRef}.`);
    }
  }
}

function sortListEntries(left: CameraDeviceAliasMemoryListEntry, right: CameraDeviceAliasMemoryListEntry): number {
  if (left.favorite !== right.favorite) {
    return left.favorite ? -1 : 1;
  }
  const aliasCompare = left.alias.localeCompare(right.alias);
  if (aliasCompare !== 0) {
    return aliasCompare;
  }
  return left.identityKey.localeCompare(right.identityKey);
}

export function resolveCameraDeviceAliasSnapshotPath(stateDir: string): string {
  return path.join(path.resolve(stateDir), "diagnostics", "camera-runtime", "device-aliases.json");
}

export async function readCameraDeviceAliasSnapshot(
  stateDir: string | undefined,
): Promise<CameraDeviceAliasSnapshot | null> {
  const normalizedStateDir = normalizeString(stateDir);
  if (!normalizedStateDir) {
    return null;
  }
  const snapshotPath = resolveCameraDeviceAliasSnapshotPath(normalizedStateDir);
  try {
    const raw = await fs.readFile(snapshotPath, "utf-8");
    const parsed = raw.trim() ? JSON.parse(raw) : {};
    return normalizeSnapshot(parsed);
  } catch (error) {
    if ((error as NodeJS.ErrnoException | undefined)?.code === "ENOENT") {
      return null;
    }
    return null;
  }
}

export async function listCameraDeviceAliasMemoryEntries(
  stateDir: string | undefined,
  options: {
    provider?: CameraProviderId;
  } = {},
): Promise<CameraDeviceAliasListResult> {
  const normalizedStateDir = normalizeString(stateDir);
  if (!normalizedStateDir) {
    return {
      entries: [],
      summary: summarizeEntries([], {}),
    };
  }

  const { snapshotPath, entries } = await loadCameraDeviceAliasSnapshotState(normalizedStateDir);
  const listedEntries = Array.from(entries.values())
    .filter((entry) => !options.provider || entry.provider === options.provider)
    .map((entry) => toListEntry(entry))
    .sort(sortListEntries);

  return {
    entries: listedEntries,
    summary: summarizeEntries(
      Array.from(entries.values()).filter((entry) => !options.provider || entry.provider === options.provider),
      { snapshotPath },
    ),
  };
}

export async function upsertCameraDeviceAliasMemoryEntry(
  stateDir: string | undefined,
  input: UpsertCameraDeviceAliasMemoryEntryInput,
  options: {
    now?: string | number | Date;
  } = {},
): Promise<UpsertCameraDeviceAliasMemoryEntryResult> {
  const normalizedStateDir = normalizeString(stateDir);
  if (!normalizedStateDir) {
    throw new Error("camera_device_memory requires stateDir.");
  }
  const provider = resolveProviderId({
    provider: input.provider,
    deviceRef: input.deviceRef,
  });
  if (!provider) {
    throw new Error("camera_device_memory requires a valid provider or provider-aware deviceRef.");
  }
  const deviceRef = normalizeString(input.deviceRef);
  if (!deviceRef) {
    throw new Error("camera_device_memory requires deviceRef.");
  }

  const stableKey = normalizeString(input.stableKey);
  const label = normalizeString(input.label);
  const nowIso = normalizeDate(options.now).toISOString();
  const { snapshotPath, entries, aliasOwners } = await loadCameraDeviceAliasSnapshotState(normalizedStateDir);
  const matchedEntry = findMatchingEntry(entries, {
    provider,
    deviceRef,
    ...(stableKey ? { stableKey } : {}),
  });
  const resolvedStableKey = stableKey ?? normalizeString(matchedEntry?.stableKey);
  const identityKey = buildIdentityKey({
    provider,
    deviceRef,
    ...(resolvedStableKey ? { stableKey: resolvedStableKey } : {}),
  });

  if (matchedEntry && matchedEntry.identityKey !== identityKey) {
    entries.delete(matchedEntry.identityKey);
  }

  const labels = normalizeLabels([
    ...(matchedEntry?.labels ?? []),
    ...(label ? [label] : []),
  ]);
  const nextEntry: CameraDeviceAliasMemoryEntry = matchedEntry
    ? {
      ...matchedEntry,
      identityKey,
      provider,
      deviceRef,
      ...(resolvedStableKey ? { stableKey: resolvedStableKey } : {}),
      lastSeenAt: nowIso,
      labels,
    }
    : {
      identityKey,
      provider,
      alias: allocateAlias(
        buildAliasBaseName({
          provider,
          deviceRef,
          ...(resolvedStableKey ? { stableKey: resolvedStableKey } : {}),
          label: label ?? "",
        }),
        identityKey,
        aliasOwners,
      ),
      deviceRef,
      ...(resolvedStableKey ? { stableKey: resolvedStableKey } : {}),
      firstSeenAt: nowIso,
      lastSeenAt: nowIso,
      labels,
    };

  if (Object.prototype.hasOwnProperty.call(input, "alias")) {
    const normalizedAlias = normalizeString(input.alias ?? undefined);
    if (normalizedAlias) {
      assertManualAliasAvailable(normalizedAlias, identityKey, entries.values());
      nextEntry.manualAlias = normalizedAlias;
    } else {
      delete nextEntry.manualAlias;
    }
  }

  if (Object.prototype.hasOwnProperty.call(input, "favorite")) {
    if (input.favorite === true) {
      nextEntry.favorite = true;
    } else {
      delete nextEntry.favorite;
    }
  }

  entries.set(identityKey, nextEntry);
  aliasOwners.set(normalizeAliasKey(buildEffectiveAlias(nextEntry)), identityKey);

  const snapshot = await writeSnapshotFromEntries(snapshotPath, entries, nowIso);
  return {
    entry: toListEntry(nextEntry),
    summary: summarizeEntries(snapshot.entries, { snapshotPath }),
  };
}

export async function removeCameraDeviceAliasMemoryEntry(
  stateDir: string | undefined,
  input: RemoveCameraDeviceAliasMemoryEntryInput,
  options: {
    now?: string | number | Date;
  } = {},
): Promise<RemoveCameraDeviceAliasMemoryEntryResult> {
  const normalizedStateDir = normalizeString(stateDir);
  if (!normalizedStateDir) {
    throw new Error("camera_device_memory requires stateDir.");
  }
  const provider = resolveProviderId({
    provider: input.provider,
    deviceRef: input.deviceRef,
  });
  if (!provider) {
    throw new Error("camera_device_memory requires a valid provider or provider-aware deviceRef.");
  }
  const deviceRef = normalizeString(input.deviceRef);
  if (!deviceRef) {
    throw new Error("camera_device_memory requires deviceRef.");
  }

  const stableKey = normalizeString(input.stableKey);
  const nowIso = normalizeDate(options.now).toISOString();
  const { snapshotPath, entries } = await loadCameraDeviceAliasSnapshotState(normalizedStateDir);
  const matchedEntry = findMatchingEntry(entries, {
    provider,
    deviceRef,
    ...(stableKey ? { stableKey } : {}),
  });

  if (matchedEntry) {
    entries.delete(matchedEntry.identityKey);
  }

  const snapshot = await writeSnapshotFromEntries(snapshotPath, entries, nowIso);
  return {
    removed: Boolean(matchedEntry),
    ...(matchedEntry ? { entry: toListEntry(matchedEntry) } : {}),
    summary: summarizeEntries(snapshot.entries, { snapshotPath }),
  };
}

export async function observeCameraDeviceAliasMemory(
  stateDir: string | undefined,
  devices: readonly CameraDeviceDescriptor[],
  options: {
    now?: string | number | Date;
  } = {},
): Promise<CameraDeviceAliasObservationResult> {
  const observedDevices = devices.map((device) => ({
    ...device,
    ...(device.metadata ? { metadata: { ...device.metadata } } : {}),
  }));
  const normalizedStateDir = normalizeString(stateDir);
  if (!normalizedStateDir || observedDevices.length === 0) {
    return {
      devices: observedDevices,
      summary: summarizeEntries([], {
        observedCount: observedDevices.length,
      }),
    };
  }

  const nowIso = normalizeDate(options.now).toISOString();
  const { snapshotPath, entries, aliasOwners } = await loadCameraDeviceAliasSnapshotState(normalizedStateDir);
  const annotatedDevices = observedDevices.map((device) => {
    const matchedEntry = findMatchingEntry(entries, device);
    const identityKey = buildIdentityKey(device);
    const label = normalizeString(device.label);

    let nextEntry: CameraDeviceAliasMemoryEntry;
    if (matchedEntry) {
      if (matchedEntry.identityKey !== identityKey) {
        entries.delete(matchedEntry.identityKey);
      }
      const labels = normalizeLabels([
        ...matchedEntry.labels,
        ...(label ? [label] : []),
      ]);
      nextEntry = {
        ...matchedEntry,
        identityKey,
        deviceRef: device.deviceRef,
        ...(normalizeString(device.stableKey) ? { stableKey: normalizeString(device.stableKey) } : {}),
        lastSeenAt: nowIso,
        labels,
      };
    } else {
      nextEntry = {
        identityKey,
        provider: device.provider,
        alias: allocateAlias(
          buildAliasBaseName(device),
          identityKey,
          aliasOwners,
        ),
        deviceRef: device.deviceRef,
        ...(normalizeString(device.stableKey) ? { stableKey: normalizeString(device.stableKey) } : {}),
        firstSeenAt: nowIso,
        lastSeenAt: nowIso,
        labels: normalizeLabels(label ? [label] : []),
      };
    }

    entries.set(identityKey, nextEntry);
    aliasOwners.set(normalizeAliasKey(buildEffectiveAlias(nextEntry)), identityKey);
    return {
      ...device,
      alias: buildEffectiveAlias(nextEntry),
      aliasSource: buildAliasSource(nextEntry),
      ...(nextEntry.favorite === true ? { favorite: true } : {}),
    };
  });

  const snapshot = await writeSnapshotFromEntries(snapshotPath, entries, nowIso);
  return {
    devices: annotatedDevices,
    summary: summarizeEntries(snapshot.entries, {
      snapshotPath,
      observedCount: observedDevices.length,
    }),
  };
}
