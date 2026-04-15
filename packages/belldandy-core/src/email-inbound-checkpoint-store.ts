import fs from "node:fs/promises";
import path from "node:path";

export type EmailInboundCheckpointRecord = {
  providerId: string;
  accountId: string;
  mailbox: string;
  lastUid: number;
  processedMessageIds: string[];
  failedMessages: Array<{
    uid: number;
    messageId: string;
    threadId?: string;
    subject?: string;
    attempts: number;
    lastError?: string;
    updatedAt: number;
  }>;
  updatedAt: number;
};

type EmailInboundCheckpointSnapshot = {
  version: 1;
  checkpoints: Record<string, EmailInboundCheckpointRecord>;
};

export type EmailInboundCheckpointStore = {
  get(input: {
    providerId: string;
    accountId: string;
    mailbox: string;
  }): Promise<EmailInboundCheckpointRecord | undefined>;
  update(input: {
    providerId: string;
    accountId: string;
    mailbox: string;
    lastUid?: number;
    processedMessageId?: string;
  }): Promise<EmailInboundCheckpointRecord>;
  recordFailure(input: {
    providerId: string;
    accountId: string;
    mailbox: string;
    uid: number;
    messageId: string;
    threadId?: string;
    subject?: string;
    error?: string;
  }): Promise<{
    record: EmailInboundCheckpointRecord;
    attempts: number;
  }>;
};

function createEmptySnapshot(): EmailInboundCheckpointSnapshot {
  return {
    version: 1,
    checkpoints: {},
  };
}

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function normalizePositiveInt(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

function normalizeProcessedMessageIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const deduped = new Set<string>();
  const items: string[] = [];
  for (const item of value) {
    const normalized = normalizeString(item);
    if (!normalized || deduped.has(normalized)) continue;
    deduped.add(normalized);
    items.push(normalized);
  }
  return items;
}

function normalizeFailedMessages(value: unknown): EmailInboundCheckpointRecord["failedMessages"] {
  if (!Array.isArray(value)) return [];
  const items: EmailInboundCheckpointRecord["failedMessages"] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const source = item as Record<string, unknown>;
    const uid = normalizePositiveInt(source.uid);
    const messageId = normalizeString(source.messageId);
    if (!uid || !messageId) continue;
    const dedupeKey = `${uid}:${messageId}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    items.push({
      uid,
      messageId,
      ...(normalizeString(source.threadId) ? { threadId: normalizeString(source.threadId) } : {}),
      ...(normalizeString(source.subject) ? { subject: normalizeString(source.subject) } : {}),
      attempts: normalizePositiveInt(source.attempts) ?? 1,
      ...(normalizeString(source.lastError) ? { lastError: normalizeString(source.lastError) } : {}),
      updatedAt: normalizePositiveInt(source.updatedAt) ?? Date.now(),
    });
  }
  return items.sort((left, right) => left.uid - right.uid).slice(-50);
}

function encodeValue(value: string): string {
  return encodeURIComponent(value);
}

function buildCheckpointKey(input: {
  providerId: string;
  accountId: string;
  mailbox: string;
}): string {
  return [
    `provider=${encodeValue(input.providerId)}`,
    `account=${encodeValue(input.accountId)}`,
    `mailbox=${encodeValue(input.mailbox)}`,
  ].join(":");
}

function normalizeRecord(value: unknown): EmailInboundCheckpointRecord | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const providerId = normalizeString(source.providerId);
  const accountId = normalizeString(source.accountId);
  const mailbox = normalizeString(source.mailbox);
  if (!providerId || !accountId || !mailbox) {
    return undefined;
  }
  return {
    providerId,
    accountId,
    mailbox,
    lastUid: normalizePositiveInt(source.lastUid) ?? 0,
    processedMessageIds: normalizeProcessedMessageIds(source.processedMessageIds),
    failedMessages: normalizeFailedMessages(source.failedMessages),
    updatedAt: normalizePositiveInt(source.updatedAt) ?? Date.now(),
  };
}

function normalizeSnapshot(value: unknown): EmailInboundCheckpointSnapshot {
  if (!value || typeof value !== "object") {
    return createEmptySnapshot();
  }
  const source = value as Record<string, unknown>;
  const checkpointsSource = source.checkpoints && typeof source.checkpoints === "object"
    ? source.checkpoints as Record<string, unknown>
    : {};
  const checkpoints: Record<string, EmailInboundCheckpointRecord> = {};
  for (const [key, rawValue] of Object.entries(checkpointsSource)) {
    const record = normalizeRecord(rawValue);
    if (!record) continue;
    checkpoints[key] = record;
  }
  return {
    version: 1,
    checkpoints,
  };
}

function cloneRecord(record: EmailInboundCheckpointRecord | undefined): EmailInboundCheckpointRecord | undefined {
  if (!record) return undefined;
  return {
    ...record,
    processedMessageIds: [...record.processedMessageIds],
    failedMessages: record.failedMessages.map((item) => ({ ...item })),
  };
}

export function resolveEmailInboundCheckpointStorePath(stateDir: string): string {
  return path.join(stateDir, "email-inbound-checkpoints.json");
}

export function createFileEmailInboundCheckpointStore(filePath: string): EmailInboundCheckpointStore {
  let snapshot: EmailInboundCheckpointSnapshot | undefined;
  let writeChain = Promise.resolve();

  async function ensureLoaded(): Promise<EmailInboundCheckpointSnapshot> {
    if (snapshot) return snapshot;
    try {
      const content = await fs.readFile(filePath, "utf-8");
      snapshot = normalizeSnapshot(JSON.parse(content));
    } catch {
      snapshot = createEmptySnapshot();
    }
    return snapshot;
  }

  async function persist(nextSnapshot: EmailInboundCheckpointSnapshot): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(nextSnapshot, null, 2)}\n`, "utf-8");
  }

  return {
    async get(input) {
      const providerId = normalizeString(input.providerId);
      const accountId = normalizeString(input.accountId);
      const mailbox = normalizeString(input.mailbox);
      if (!providerId || !accountId || !mailbox) {
        return undefined;
      }
      const loaded = await ensureLoaded();
      return cloneRecord(loaded.checkpoints[buildCheckpointKey({ providerId, accountId, mailbox })]);
    },

    async update(input) {
      const providerId = normalizeString(input.providerId);
      const accountId = normalizeString(input.accountId);
      const mailbox = normalizeString(input.mailbox);
      if (!providerId || !accountId || !mailbox) {
        throw new Error("providerId, accountId, and mailbox are required");
      }
      const loaded = await ensureLoaded();
      const key = buildCheckpointKey({ providerId, accountId, mailbox });
      const current = loaded.checkpoints[key] ?? {
        providerId,
        accountId,
        mailbox,
        lastUid: 0,
        processedMessageIds: [],
        failedMessages: [],
        updatedAt: Date.now(),
      };
      const processedMessageId = normalizeString(input.processedMessageId);
      const processedMessageIds = processedMessageId
        ? [...current.processedMessageIds.filter((item) => item !== processedMessageId), processedMessageId].slice(-200)
        : current.processedMessageIds;
      const failedMessages = processedMessageId
        ? current.failedMessages.filter((item) => item.messageId !== processedMessageId)
        : current.failedMessages;
      const nextRecord: EmailInboundCheckpointRecord = {
        providerId,
        accountId,
        mailbox,
        lastUid: Math.max(current.lastUid, normalizePositiveInt(input.lastUid) ?? 0),
        processedMessageIds,
        failedMessages,
        updatedAt: Date.now(),
      };
      loaded.checkpoints[key] = nextRecord;
      writeChain = writeChain.then(() => persist(loaded));
      await writeChain;
      return cloneRecord(nextRecord)!;
    },

    async recordFailure(input) {
      const providerId = normalizeString(input.providerId);
      const accountId = normalizeString(input.accountId);
      const mailbox = normalizeString(input.mailbox);
      const messageId = normalizeString(input.messageId);
      const uid = normalizePositiveInt(input.uid);
      if (!providerId || !accountId || !mailbox || !messageId || !uid) {
        throw new Error("providerId, accountId, mailbox, uid, and messageId are required");
      }
      const loaded = await ensureLoaded();
      const key = buildCheckpointKey({ providerId, accountId, mailbox });
      const current = loaded.checkpoints[key] ?? {
        providerId,
        accountId,
        mailbox,
        lastUid: 0,
        processedMessageIds: [],
        failedMessages: [],
        updatedAt: Date.now(),
      };
      const existing = current.failedMessages.find((item) => item.messageId === messageId);
      const attempts = (existing?.attempts ?? 0) + 1;
      const nextFailedMessages = [
        ...current.failedMessages.filter((item) => item.messageId !== messageId),
        {
          uid,
          messageId,
          ...(normalizeString(input.threadId) ? { threadId: normalizeString(input.threadId) } : {}),
          ...(normalizeString(input.subject) ? { subject: normalizeString(input.subject) } : {}),
          attempts,
          ...(normalizeString(input.error) ? { lastError: normalizeString(input.error) } : {}),
          updatedAt: Date.now(),
        },
      ].sort((left, right) => left.uid - right.uid).slice(-50);
      const nextRecord: EmailInboundCheckpointRecord = {
        providerId,
        accountId,
        mailbox,
        lastUid: current.lastUid,
        processedMessageIds: current.processedMessageIds,
        failedMessages: nextFailedMessages,
        updatedAt: Date.now(),
      };
      loaded.checkpoints[key] = nextRecord;
      writeChain = writeChain.then(() => persist(loaded));
      await writeChain;
      return {
        record: cloneRecord(nextRecord)!,
        attempts,
      };
    },
  };
}
