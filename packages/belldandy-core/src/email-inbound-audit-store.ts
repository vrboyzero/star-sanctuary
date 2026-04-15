import fs from "node:fs/promises";
import path from "node:path";

export type EmailInboundAuditStatus = "processed" | "failed" | "invalid_event" | "skipped_duplicate";

export type EmailInboundAuditRecord = {
  timestamp: number;
  providerId: string;
  accountId: string;
  mailbox: string;
  status: EmailInboundAuditStatus;
  messageId?: string;
  threadId?: string;
  subject?: string;
  from?: string[];
  to?: string[];
  bodyPreview: string;
  attachmentCount?: number;
  inlineAttachmentCount?: number;
  receivedAt?: number;
  conversationId?: string;
  sessionKey?: string;
  requestedAgentId?: string;
  runId?: string;
  checkpointUid?: number;
  createdBinding?: boolean;
  inReplyToMessageId?: string;
  references?: string[];
  retryAttempt?: number;
  retryScheduled?: boolean;
  retryExhausted?: boolean;
  triageCategory?: string;
  triagePriority?: string;
  triageDisposition?: string;
  triageSummary?: string;
  triageRationale?: string[];
  triageNeedsReply?: boolean;
  triageNeedsFollowUp?: boolean;
  triageFollowUpWindowHours?: number;
  suggestedReplyStarter?: string;
  suggestedReplySubject?: string;
  suggestedReplyDraft?: string;
  suggestedReplyQuality?: string;
  suggestedReplyConfidence?: string;
  suggestedReplyWarnings?: string[];
  suggestedReplyChecklist?: string[];
  errorCode?: string;
  error?: string;
};

export type EmailInboundAuditStore = {
  append(record: EmailInboundAuditRecord): Promise<void>;
  listRecent(limit?: number): Promise<EmailInboundAuditRecord[]>;
};

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => normalizeString(item))
    .filter((item): item is string => Boolean(item));
}

function normalizeBoolean(value: unknown): boolean | undefined {
  return value === true || value === false ? value : undefined;
}

function normalizePreview(value: unknown): string {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized.length <= 240 ? normalized : `${normalized.slice(0, 237)}...`;
}

export function resolveEmailInboundAuditStorePath(stateDir: string): string {
  return path.join(stateDir, "email-inbound-audit.jsonl");
}

export function createFileEmailInboundAuditStore(filePath: string): EmailInboundAuditStore {
  let writeChain = Promise.resolve();

  return {
    async append(record) {
      const normalized: EmailInboundAuditRecord = {
        timestamp: Number.isFinite(record.timestamp) && record.timestamp > 0 ? record.timestamp : Date.now(),
        providerId: normalizeString(record.providerId) || "unknown",
        accountId: normalizeString(record.accountId) || "default",
        mailbox: normalizeString(record.mailbox) || "INBOX",
        status: record.status,
        bodyPreview: normalizePreview(record.bodyPreview),
        ...(normalizeString(record.messageId) ? { messageId: normalizeString(record.messageId) } : {}),
        ...(normalizeString(record.threadId) ? { threadId: normalizeString(record.threadId) } : {}),
        ...(normalizeString(record.subject) ? { subject: normalizeString(record.subject) } : {}),
        ...(normalizeStringArray(record.from).length > 0 ? { from: normalizeStringArray(record.from) } : {}),
        ...(normalizeStringArray(record.to).length > 0 ? { to: normalizeStringArray(record.to) } : {}),
        ...(Number.isFinite(record.attachmentCount) && Number(record.attachmentCount) >= 0
          ? { attachmentCount: Math.floor(Number(record.attachmentCount)) }
          : {}),
        ...(Number.isFinite(record.inlineAttachmentCount) && Number(record.inlineAttachmentCount) >= 0
          ? { inlineAttachmentCount: Math.floor(Number(record.inlineAttachmentCount)) }
          : {}),
        ...(Number.isFinite(record.receivedAt) && Number(record.receivedAt) > 0
          ? { receivedAt: Math.floor(Number(record.receivedAt)) }
          : {}),
        ...(normalizeString(record.conversationId) ? { conversationId: normalizeString(record.conversationId) } : {}),
        ...(normalizeString(record.sessionKey) ? { sessionKey: normalizeString(record.sessionKey) } : {}),
        ...(normalizeString(record.requestedAgentId) ? { requestedAgentId: normalizeString(record.requestedAgentId) } : {}),
        ...(normalizeString(record.runId) ? { runId: normalizeString(record.runId) } : {}),
        ...(Number.isFinite(record.checkpointUid) && Number(record.checkpointUid) > 0
          ? { checkpointUid: Math.floor(Number(record.checkpointUid)) }
          : {}),
        ...(record.createdBinding === true || record.createdBinding === false ? { createdBinding: record.createdBinding } : {}),
        ...(normalizeString(record.inReplyToMessageId) ? { inReplyToMessageId: normalizeString(record.inReplyToMessageId) } : {}),
        ...(normalizeStringArray(record.references).length > 0 ? { references: normalizeStringArray(record.references) } : {}),
        ...(Number.isFinite(record.retryAttempt) && Number(record.retryAttempt) > 0
          ? { retryAttempt: Math.floor(Number(record.retryAttempt)) }
          : {}),
        ...(normalizeBoolean(record.retryScheduled) !== undefined ? { retryScheduled: normalizeBoolean(record.retryScheduled) } : {}),
        ...(normalizeBoolean(record.retryExhausted) !== undefined ? { retryExhausted: normalizeBoolean(record.retryExhausted) } : {}),
        ...(normalizeString(record.triageCategory) ? { triageCategory: normalizeString(record.triageCategory) } : {}),
        ...(normalizeString(record.triagePriority) ? { triagePriority: normalizeString(record.triagePriority) } : {}),
        ...(normalizeString(record.triageDisposition) ? { triageDisposition: normalizeString(record.triageDisposition) } : {}),
        ...(normalizeString(record.triageSummary) ? { triageSummary: normalizeString(record.triageSummary) } : {}),
        ...(normalizeStringArray(record.triageRationale).length > 0 ? { triageRationale: normalizeStringArray(record.triageRationale) } : {}),
        ...(normalizeBoolean(record.triageNeedsReply) !== undefined ? { triageNeedsReply: normalizeBoolean(record.triageNeedsReply) } : {}),
        ...(normalizeBoolean(record.triageNeedsFollowUp) !== undefined ? { triageNeedsFollowUp: normalizeBoolean(record.triageNeedsFollowUp) } : {}),
        ...(Number.isFinite(record.triageFollowUpWindowHours) && Number(record.triageFollowUpWindowHours) > 0
          ? { triageFollowUpWindowHours: Math.floor(Number(record.triageFollowUpWindowHours)) }
          : {}),
        ...(normalizeString(record.suggestedReplyStarter) ? { suggestedReplyStarter: normalizeString(record.suggestedReplyStarter) } : {}),
        ...(normalizeString(record.suggestedReplySubject) ? { suggestedReplySubject: normalizeString(record.suggestedReplySubject) } : {}),
        ...(normalizeString(record.suggestedReplyDraft) ? { suggestedReplyDraft: normalizeString(record.suggestedReplyDraft) } : {}),
        ...(normalizeString(record.suggestedReplyQuality) ? { suggestedReplyQuality: normalizeString(record.suggestedReplyQuality) } : {}),
        ...(normalizeString(record.suggestedReplyConfidence) ? { suggestedReplyConfidence: normalizeString(record.suggestedReplyConfidence) } : {}),
        ...(normalizeStringArray(record.suggestedReplyWarnings).length > 0 ? { suggestedReplyWarnings: normalizeStringArray(record.suggestedReplyWarnings) } : {}),
        ...(normalizeStringArray(record.suggestedReplyChecklist).length > 0 ? { suggestedReplyChecklist: normalizeStringArray(record.suggestedReplyChecklist) } : {}),
        ...(normalizeString(record.errorCode) ? { errorCode: normalizeString(record.errorCode) } : {}),
        ...(normalizeString(record.error) ? { error: normalizeString(record.error) } : {}),
      };
      writeChain = writeChain.then(async () => {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.appendFile(filePath, `${JSON.stringify(normalized)}\n`, "utf-8");
      });
      await writeChain;
    },

    async listRecent(limit = 20) {
      const safeLimit = Number.isFinite(limit) ? Math.max(1, Math.min(100, Math.floor(limit))) : 20;
      try {
        const content = await fs.readFile(filePath, "utf-8");
        const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
        const items: EmailInboundAuditRecord[] = [];
        for (let index = lines.length - 1; index >= 0 && items.length < safeLimit; index -= 1) {
          try {
            const parsed = JSON.parse(lines[index]) as EmailInboundAuditRecord;
            if (!parsed || typeof parsed !== "object") continue;
            items.push(parsed);
          } catch {
            continue;
          }
        }
        return items;
      } catch {
        return [];
      }
    },
  };
}
