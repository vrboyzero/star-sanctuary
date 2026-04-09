import fs from "node:fs/promises";
import path from "node:path";

import type { ChannelKind, ChatKind } from "./router/types.js";

export type CurrentConversationBindingRecord = {
  channel: ChannelKind;
  sessionKey: string;
  sessionScope: string;
  legacyConversationId: string;
  chatKind: ChatKind;
  chatId: string;
  accountId?: string;
  peerId?: string;
  updatedAt: number;
  target: Record<string, string>;
};

type CurrentConversationBindingSnapshot = {
  version: 1;
  bindings: Record<string, CurrentConversationBindingRecord>;
  latestByScope: Record<string, string>;
};

export type CurrentConversationBindingStore = {
  upsert(record: CurrentConversationBindingRecord): Promise<void>;
  get(sessionKey: string): Promise<CurrentConversationBindingRecord | undefined>;
  getLatestByChannel(input: {
    channel: ChannelKind;
    accountId?: string;
  }): Promise<CurrentConversationBindingRecord | undefined>;
};

const EMPTY_SNAPSHOT: CurrentConversationBindingSnapshot = {
  version: 1,
  bindings: {},
  latestByScope: {},
};

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function normalizeTarget(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") return {};
  const source = value as Record<string, unknown>;
  const target: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(source)) {
    const normalized = normalizeString(typeof rawValue === "string" ? rawValue : undefined);
    if (!normalized) continue;
    target[key] = normalized;
  }
  return target;
}

function normalizeRecord(value: unknown): CurrentConversationBindingRecord | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const channel = normalizeString(source.channel) as ChannelKind | undefined;
  const sessionKey = normalizeString(source.sessionKey);
  const sessionScope = normalizeString(source.sessionScope);
  const legacyConversationId = normalizeString(source.legacyConversationId);
  const chatKind = normalizeString(source.chatKind) as ChatKind | undefined;
  const chatId = normalizeString(source.chatId);
  if (!channel || !sessionKey || !sessionScope || !legacyConversationId || !chatKind || !chatId) {
    return undefined;
  }
  const updatedAtRaw = Number(source.updatedAt);
  return {
    channel,
    sessionKey,
    sessionScope,
    legacyConversationId,
    chatKind,
    chatId,
    ...(normalizeString(source.accountId) ? { accountId: normalizeString(source.accountId) } : {}),
    ...(normalizeString(source.peerId) ? { peerId: normalizeString(source.peerId) } : {}),
    updatedAt: Number.isFinite(updatedAtRaw) && updatedAtRaw > 0 ? updatedAtRaw : Date.now(),
    target: normalizeTarget(source.target),
  };
}

function normalizeSnapshot(value: unknown): CurrentConversationBindingSnapshot {
  if (!value || typeof value !== "object") return { ...EMPTY_SNAPSHOT };
  const source = value as Record<string, unknown>;
  const bindingsSource = source.bindings && typeof source.bindings === "object"
    ? source.bindings as Record<string, unknown>
    : {};
  const latestByScopeSource = source.latestByScope && typeof source.latestByScope === "object"
    ? source.latestByScope as Record<string, unknown>
    : {};

  const bindings: Record<string, CurrentConversationBindingRecord> = {};
  for (const [key, rawValue] of Object.entries(bindingsSource)) {
    const record = normalizeRecord(rawValue);
    if (!record) continue;
    bindings[key] = record;
  }

  const latestByScope: Record<string, string> = {};
  for (const [key, rawValue] of Object.entries(latestByScopeSource)) {
    const normalizedKey = normalizeString(key);
    const normalizedValue = normalizeString(typeof rawValue === "string" ? rawValue : undefined);
    if (!normalizedKey || !normalizedValue) continue;
    latestByScope[normalizedKey] = normalizedValue;
  }

  return {
    version: 1,
    bindings,
    latestByScope,
  };
}

function buildScopeKey(channel: ChannelKind, accountId?: string): string {
  const normalizedAccountId = normalizeString(accountId);
  return normalizedAccountId ? `${channel}::${normalizedAccountId}` : channel;
}

export function resolveCurrentConversationBindingStorePath(stateDir: string): string {
  return path.join(stateDir, "current-conversation-bindings.json");
}

export function createFileCurrentConversationBindingStore(filePath: string): CurrentConversationBindingStore {
  let snapshot: CurrentConversationBindingSnapshot | undefined;
  let writeChain = Promise.resolve();

  async function ensureLoaded(): Promise<CurrentConversationBindingSnapshot> {
    if (snapshot) return snapshot;
    try {
      const content = await fs.readFile(filePath, "utf-8");
      snapshot = normalizeSnapshot(JSON.parse(content));
    } catch {
      snapshot = { ...EMPTY_SNAPSHOT };
    }
    return snapshot;
  }

  async function persist(nextSnapshot: CurrentConversationBindingSnapshot): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(nextSnapshot, null, 2)}\n`, "utf-8");
  }

  function cloneRecord(record: CurrentConversationBindingRecord | undefined): CurrentConversationBindingRecord | undefined {
    if (!record) return undefined;
    return {
      ...record,
      target: { ...record.target },
    };
  }

  return {
    async upsert(record) {
      const loaded = await ensureLoaded();
      const nextRecord: CurrentConversationBindingRecord = {
        ...record,
        target: normalizeTarget(record.target),
        updatedAt: typeof record.updatedAt === "number" && Number.isFinite(record.updatedAt) && record.updatedAt > 0
          ? record.updatedAt
          : Date.now(),
      };
      loaded.bindings[nextRecord.sessionKey] = nextRecord;
      loaded.latestByScope[buildScopeKey(nextRecord.channel)] = nextRecord.sessionKey;
      if (nextRecord.accountId) {
        loaded.latestByScope[buildScopeKey(nextRecord.channel, nextRecord.accountId)] = nextRecord.sessionKey;
      }
      writeChain = writeChain.then(() => persist(loaded));
      await writeChain;
    },

    async get(sessionKey) {
      const loaded = await ensureLoaded();
      return cloneRecord(loaded.bindings[sessionKey]);
    },

    async getLatestByChannel(input) {
      const loaded = await ensureLoaded();
      const exactScopeKey = buildScopeKey(input.channel, input.accountId);
      const fallbackScopeKey = buildScopeKey(input.channel);
      const sessionKey = loaded.latestByScope[exactScopeKey] ?? loaded.latestByScope[fallbackScopeKey];
      if (!sessionKey) return undefined;
      return cloneRecord(loaded.bindings[sessionKey]);
    },
  };
}
