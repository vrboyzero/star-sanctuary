import fs from "node:fs/promises";
import path from "node:path";

export type EmailFollowUpReminderStatus = "pending" | "delivered" | "resolved";

export type EmailFollowUpReminderRecord = {
  id: string;
  providerId: string;
  accountId: string;
  threadId: string;
  conversationId: string;
  requestedAgentId: string;
  messageId?: string;
  subject?: string;
  triageSummary?: string;
  suggestedReplyStarter?: string;
  followUpWindowHours: number;
  sourceReceivedAt?: number;
  dueAt: number;
  status: EmailFollowUpReminderStatus;
  createdAt: number;
  updatedAt: number;
  deliveryCount: number;
  lastDeliveredAt?: number;
  resolvedAt?: number;
  resolutionSource?: string;
};

type EmailFollowUpReminderSnapshot = {
  version: 1;
  reminders: Record<string, EmailFollowUpReminderRecord>;
};

export type EmailFollowUpReminderStore = {
  upsert(record: Omit<EmailFollowUpReminderRecord, "id" | "createdAt" | "updatedAt" | "deliveryCount" | "status">): Promise<EmailFollowUpReminderRecord>;
  markDelivered(input: { id: string; deliveredAt?: number }): Promise<EmailFollowUpReminderRecord | undefined>;
  resolveByThread(input: { providerId: string; accountId: string; threadId: string; resolvedAt?: number; resolutionSource?: string }): Promise<EmailFollowUpReminderRecord | undefined>;
  listDue(now?: number, limit?: number): Promise<EmailFollowUpReminderRecord[]>;
  listRecent(limit?: number): Promise<EmailFollowUpReminderRecord[]>;
};

const EMPTY_SNAPSHOT: EmailFollowUpReminderSnapshot = {
  version: 1,
  reminders: {},
};

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function normalizePositiveInt(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : undefined;
}

function encodeValue(value: string): string {
  return encodeURIComponent(value);
}

function buildReminderId(input: { providerId: string; accountId: string; threadId: string }): string {
  return [
    `provider=${encodeValue(input.providerId)}`,
    `account=${encodeValue(input.accountId)}`,
    `thread=${encodeValue(input.threadId)}`,
  ].join(":");
}

function cloneRecord(record: EmailFollowUpReminderRecord | undefined): EmailFollowUpReminderRecord | undefined {
  if (!record) return undefined;
  return { ...record };
}

function normalizeRecord(value: unknown): EmailFollowUpReminderRecord | undefined {
  if (!value || typeof value !== "object") return undefined;
  const source = value as Record<string, unknown>;
  const providerId = normalizeString(source.providerId);
  const accountId = normalizeString(source.accountId);
  const threadId = normalizeString(source.threadId);
  const conversationId = normalizeString(source.conversationId);
  const requestedAgentId = normalizeString(source.requestedAgentId) || "default";
  const followUpWindowHours = normalizePositiveInt(source.followUpWindowHours);
  const dueAt = normalizePositiveInt(source.dueAt);
  if (!providerId || !accountId || !threadId || !conversationId || !followUpWindowHours || !dueAt) {
    return undefined;
  }
  const id = normalizeString(source.id) || buildReminderId({ providerId, accountId, threadId });
  const createdAt = normalizePositiveInt(source.createdAt) || Date.now();
  const updatedAt = normalizePositiveInt(source.updatedAt) || createdAt;
  const deliveryCount = Math.max(0, Number(source.deliveryCount) || 0);
  const statusRaw = normalizeString(source.status);
  const status: EmailFollowUpReminderStatus = statusRaw === "resolved"
    ? "resolved"
    : statusRaw === "delivered"
      ? "delivered"
      : "pending";
  return {
    id,
    providerId,
    accountId,
    threadId,
    conversationId,
    requestedAgentId,
    followUpWindowHours,
    dueAt,
    status,
    createdAt,
    updatedAt,
    deliveryCount,
    ...(normalizeString(source.messageId) ? { messageId: normalizeString(source.messageId) } : {}),
    ...(normalizeString(source.subject) ? { subject: normalizeString(source.subject) } : {}),
    ...(normalizeString(source.triageSummary) ? { triageSummary: normalizeString(source.triageSummary) } : {}),
    ...(normalizeString(source.suggestedReplyStarter) ? { suggestedReplyStarter: normalizeString(source.suggestedReplyStarter) } : {}),
    ...(normalizePositiveInt(source.sourceReceivedAt) ? { sourceReceivedAt: normalizePositiveInt(source.sourceReceivedAt) } : {}),
    ...(normalizePositiveInt(source.lastDeliveredAt) ? { lastDeliveredAt: normalizePositiveInt(source.lastDeliveredAt) } : {}),
    ...(normalizePositiveInt(source.resolvedAt) ? { resolvedAt: normalizePositiveInt(source.resolvedAt) } : {}),
    ...(normalizeString(source.resolutionSource) ? { resolutionSource: normalizeString(source.resolutionSource) } : {}),
  };
}

function normalizeSnapshot(value: unknown): EmailFollowUpReminderSnapshot {
  if (!value || typeof value !== "object") {
    return { ...EMPTY_SNAPSHOT };
  }
  const source = value as Record<string, unknown>;
  const remindersSource = source.reminders && typeof source.reminders === "object"
    ? source.reminders as Record<string, unknown>
    : {};
  const reminders: Record<string, EmailFollowUpReminderRecord> = {};
  for (const [key, rawValue] of Object.entries(remindersSource)) {
    const record = normalizeRecord(rawValue);
    if (!record) continue;
    reminders[key] = record;
  }
  return {
    version: 1,
    reminders,
  };
}

export function resolveEmailFollowUpReminderStorePath(stateDir: string): string {
  return path.join(stateDir, "email-follow-up-reminders.json");
}

export function createFileEmailFollowUpReminderStore(filePath: string): EmailFollowUpReminderStore {
  let snapshot: EmailFollowUpReminderSnapshot | undefined;
  let writeChain = Promise.resolve();

  async function ensureLoaded(): Promise<EmailFollowUpReminderSnapshot> {
    if (snapshot) return snapshot;
    try {
      const content = await fs.readFile(filePath, "utf-8");
      snapshot = normalizeSnapshot(JSON.parse(content));
    } catch {
      snapshot = { ...EMPTY_SNAPSHOT };
    }
    return snapshot;
  }

  async function persist(nextSnapshot: EmailFollowUpReminderSnapshot): Promise<void> {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, `${JSON.stringify(nextSnapshot, null, 2)}\n`, "utf-8");
  }

  return {
    async upsert(record) {
      const providerId = normalizeString(record.providerId);
      const accountId = normalizeString(record.accountId);
      const threadId = normalizeString(record.threadId);
      const conversationId = normalizeString(record.conversationId);
      const requestedAgentId = normalizeString(record.requestedAgentId) || "default";
      const followUpWindowHours = normalizePositiveInt(record.followUpWindowHours);
      const dueAt = normalizePositiveInt(record.dueAt);
      if (!providerId || !accountId || !threadId || !conversationId || !followUpWindowHours || !dueAt) {
        throw new Error("providerId, accountId, threadId, conversationId, followUpWindowHours, and dueAt are required");
      }
      const loaded = await ensureLoaded();
      const id = buildReminderId({ providerId, accountId, threadId });
      const current = loaded.reminders[id];
      const now = Date.now();
      const nextRecord: EmailFollowUpReminderRecord = {
        id,
        providerId,
        accountId,
        threadId,
        conversationId,
        requestedAgentId,
        followUpWindowHours,
        dueAt,
        status: "pending",
        createdAt: current?.createdAt || now,
        updatedAt: now,
        deliveryCount: current?.deliveryCount || 0,
        ...(normalizeString(record.messageId) ? { messageId: normalizeString(record.messageId) } : {}),
        ...(normalizeString(record.subject) ? { subject: normalizeString(record.subject) } : {}),
        ...(normalizeString(record.triageSummary) ? { triageSummary: normalizeString(record.triageSummary) } : {}),
        ...(normalizeString(record.suggestedReplyStarter) ? { suggestedReplyStarter: normalizeString(record.suggestedReplyStarter) } : {}),
        ...(normalizePositiveInt(record.sourceReceivedAt) ? { sourceReceivedAt: normalizePositiveInt(record.sourceReceivedAt) } : {}),
      };
      loaded.reminders[id] = nextRecord;
      writeChain = writeChain.then(() => persist(loaded));
      await writeChain;
      return cloneRecord(nextRecord)!;
    },

    async markDelivered(input) {
      const id = normalizeString(input.id);
      if (!id) return undefined;
      const loaded = await ensureLoaded();
      const current = loaded.reminders[id];
      if (!current) return undefined;
      const deliveredAt = normalizePositiveInt(input.deliveredAt) || Date.now();
      const nextRecord: EmailFollowUpReminderRecord = {
        ...current,
        status: "delivered",
        deliveryCount: (current.deliveryCount || 0) + 1,
        lastDeliveredAt: deliveredAt,
        updatedAt: deliveredAt,
      };
      loaded.reminders[id] = nextRecord;
      writeChain = writeChain.then(() => persist(loaded));
      await writeChain;
      return cloneRecord(nextRecord);
    },

    async resolveByThread(input) {
      const providerId = normalizeString(input.providerId);
      const accountId = normalizeString(input.accountId);
      const threadId = normalizeString(input.threadId);
      if (!providerId || !accountId || !threadId) return undefined;
      const loaded = await ensureLoaded();
      const id = buildReminderId({ providerId, accountId, threadId });
      const current = loaded.reminders[id];
      if (!current) return undefined;
      const resolvedAt = normalizePositiveInt(input.resolvedAt) || Date.now();
      const nextRecord: EmailFollowUpReminderRecord = {
        ...current,
        status: "resolved",
        resolvedAt,
        updatedAt: resolvedAt,
        ...(normalizeString(input.resolutionSource) ? { resolutionSource: normalizeString(input.resolutionSource) } : {}),
      };
      loaded.reminders[id] = nextRecord;
      writeChain = writeChain.then(() => persist(loaded));
      await writeChain;
      return cloneRecord(nextRecord);
    },

    async listDue(now = Date.now(), limit = 20) {
      const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : 20;
      const loaded = await ensureLoaded();
      return Object.values(loaded.reminders)
        .filter((item) => item.status === "pending" && item.dueAt <= now)
        .sort((left, right) => left.dueAt - right.dueAt)
        .slice(0, safeLimit)
        .map((item) => cloneRecord(item)!);
    },

    async listRecent(limit = 20) {
      const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : 20;
      const loaded = await ensureLoaded();
      return Object.values(loaded.reminders)
        .sort((left, right) => right.updatedAt - left.updatedAt)
        .slice(0, safeLimit)
        .map((item) => cloneRecord(item)!);
    },
  };
}
