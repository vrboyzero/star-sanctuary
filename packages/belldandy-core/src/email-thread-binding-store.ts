import fs from "node:fs/promises";
import path from "node:path";

export type EmailThreadBindingRecord = {
  providerId: string;
  accountId: string;
  threadId: string;
  sessionKey: string;
  conversationId: string;
  updatedAt: number;
  lastMessageId?: string;
  lastSubject?: string;
  participantAddresses?: string[];
};

type EmailThreadBindingSnapshot = {
  version: 1;
  bindings: Record<string, EmailThreadBindingRecord>;
};

export type EmailThreadBindingStore = {
  upsert(record: EmailThreadBindingRecord): Promise<void>;
  getByThread(input: {
    providerId: string;
    accountId: string;
    threadId: string;
  }): Promise<EmailThreadBindingRecord | undefined>;
};

const EMPTY_SNAPSHOT: EmailThreadBindingSnapshot = {
  version: 1,
  bindings: {},
};

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const deduped = new Set<string>();
  const items: string[] = [];
  for (const item of value) {
    const normalized = normalizeString(item);
    if (!normalized) continue;
    const key = normalized.toLowerCase();
    if (deduped.has(key)) continue;
    deduped.add(key);
    items.push(normalized);
  }
  return items;
}

function encodeValue(value: string): string {
  return encodeURIComponent(value);
}

function buildBindingKey(input: { providerId: string; accountId: string; threadId: string }): string {
  return [
    `provider=${encodeValue(input.providerId)}`,
    `account=${encodeValue(input.accountId)}`,
    `thread=${encodeValue(input.threadId)}`,
  ].join(":");
}

function normalizeRecord(value: unknown): EmailThreadBindingRecord | undefined {
  if (!value || typeof value !== "object") {
    return undefined;
  }
  const source = value as Record<string, unknown>;
  const providerId = normalizeString(source.providerId);
  const accountId = normalizeString(source.accountId);
  const threadId = normalizeString(source.threadId);
  const sessionKey = normalizeString(source.sessionKey);
  const conversationId = normalizeString(source.conversationId);
  if (!providerId || !accountId || !threadId || !sessionKey || !conversationId) {
    return undefined;
  }
  const updatedAtRaw = Number(source.updatedAt);
  const lastMessageId = normalizeString(source.lastMessageId);
  const lastSubject = normalizeString(source.lastSubject);
  const participantAddresses = normalizeStringArray(source.participantAddresses);
  return {
    providerId,
    accountId,
    threadId,
    sessionKey,
    conversationId,
    updatedAt: Number.isFinite(updatedAtRaw) && updatedAtRaw > 0 ? updatedAtRaw : Date.now(),
    ...(lastMessageId ? { lastMessageId } : {}),
    ...(lastSubject ? { lastSubject } : {}),
    ...(participantAddresses.length > 0 ? { participantAddresses } : {}),
  };
}

function normalizeSnapshot(value: unknown): EmailThreadBindingSnapshot {
  if (!value || typeof value !== "object") {
    return { ...EMPTY_SNAPSHOT };
  }
  const source = value as Record<string, unknown>;
  const bindingsSource = source.bindings && typeof source.bindings === "object"
    ? source.bindings as Record<string, unknown>
    : {};
  const bindings: Record<string, EmailThreadBindingRecord> = {};
  for (const [key, rawValue] of Object.entries(bindingsSource)) {
    const record = normalizeRecord(rawValue);
    if (!record) continue;
    bindings[key] = record;
  }
  return {
    version: 1,
    bindings,
  };
}

function cloneRecord(record: EmailThreadBindingRecord | undefined): EmailThreadBindingRecord | undefined {
  if (!record) return undefined;
  return {
    ...record,
    ...(Array.isArray(record.participantAddresses)
      ? { participantAddresses: [...record.participantAddresses] }
      : {}),
  };
}

export function buildEmailThreadSessionKey(input: {
  providerId: string;
  accountId: string;
  threadId: string;
}): string {
  return [
    "channel=email",
    "scope=per-account-thread",
    `provider=${encodeValue(input.providerId.trim())}`,
    `account=${encodeValue(input.accountId.trim())}`,
    `thread=${encodeValue(input.threadId.trim())}`,
  ].join(":");
}

export function resolveEmailThreadBindingStorePath(stateDir: string): string {
  return path.join(stateDir, "email-thread-bindings.json");
}

export function createFileEmailThreadBindingStore(filePath: string): EmailThreadBindingStore {
  let snapshot: EmailThreadBindingSnapshot | undefined;
  let writeChain = Promise.resolve();

  async function ensureLoaded(): Promise<EmailThreadBindingSnapshot> {
    if (snapshot) return snapshot;
    try {
      const content = await fs.readFile(filePath, "utf-8");
      snapshot = normalizeSnapshot(JSON.parse(content));
    } catch {
      snapshot = { ...EMPTY_SNAPSHOT };
    }
    return snapshot;
  }

  async function persist(nextSnapshot: EmailThreadBindingSnapshot): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(nextSnapshot, null, 2)}\n`, "utf-8");
  }

  return {
    async upsert(record) {
      const providerId = normalizeString(record.providerId);
      const accountId = normalizeString(record.accountId);
      const threadId = normalizeString(record.threadId);
      const sessionKey = normalizeString(record.sessionKey);
      const conversationId = normalizeString(record.conversationId);
      if (!providerId || !accountId || !threadId || !sessionKey || !conversationId) {
        throw new Error("providerId, accountId, threadId, sessionKey, and conversationId are required");
      }
      const loaded = await ensureLoaded();
      const participants = normalizeStringArray(record.participantAddresses);
      const nextRecord: EmailThreadBindingRecord = {
        providerId,
        accountId,
        threadId,
        sessionKey,
        conversationId,
        updatedAt: Number.isFinite(record.updatedAt) && record.updatedAt > 0 ? record.updatedAt : Date.now(),
        ...(normalizeString(record.lastMessageId) ? { lastMessageId: normalizeString(record.lastMessageId) } : {}),
        ...(normalizeString(record.lastSubject) ? { lastSubject: normalizeString(record.lastSubject) } : {}),
        ...(participants.length > 0 ? { participantAddresses: participants } : {}),
      };
      loaded.bindings[buildBindingKey(nextRecord)] = nextRecord;
      writeChain = writeChain.then(() => persist(loaded));
      await writeChain;
    },

    async getByThread(input) {
      const providerId = normalizeString(input.providerId);
      const accountId = normalizeString(input.accountId);
      const threadId = normalizeString(input.threadId);
      if (!providerId || !accountId || !threadId) {
        return undefined;
      }
      const loaded = await ensureLoaded();
      return cloneRecord(loaded.bindings[buildBindingKey({ providerId, accountId, threadId })]);
    },
  };
}
