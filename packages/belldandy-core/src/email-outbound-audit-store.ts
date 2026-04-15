import fs from "node:fs/promises";
import path from "node:path";

export type EmailOutboundAuditDecision = "confirmed" | "rejected" | "auto_approved";
export type EmailOutboundAuditDelivery = "sent" | "failed" | "rejected";

export type EmailOutboundAuditRecord = {
  timestamp: number;
  requestId?: string;
  sourceConversationId: string;
  sourceChannel: "webchat";
  requestedByAgentId?: string;
  providerId: string;
  accountId: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  bodyPreview: string;
  attachmentCount?: number;
  threadId?: string;
  replyToMessageId?: string;
  decision: EmailOutboundAuditDecision;
  delivery: EmailOutboundAuditDelivery;
  providerMessageId?: string;
  providerThreadId?: string;
  errorCode?: string;
  error?: string;
};

export type EmailOutboundAuditStore = {
  append(record: EmailOutboundAuditRecord): Promise<void>;
  listRecent(limit?: number): Promise<EmailOutboundAuditRecord[]>;
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

function normalizePreview(value: unknown): string {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized.length <= 200 ? normalized : `${normalized.slice(0, 197)}...`;
}

export function resolveEmailOutboundAuditStorePath(stateDir: string): string {
  return path.join(stateDir, "email-outbound-audit.jsonl");
}

export function createFileEmailOutboundAuditStore(filePath: string): EmailOutboundAuditStore {
  let writeChain = Promise.resolve();

  return {
    async append(record) {
      const normalized: EmailOutboundAuditRecord = {
        timestamp: Number.isFinite(record.timestamp) && record.timestamp > 0 ? record.timestamp : Date.now(),
        sourceConversationId: normalizeString(record.sourceConversationId) || "unknown",
        sourceChannel: "webchat",
        providerId: normalizeString(record.providerId) || "unknown",
        accountId: normalizeString(record.accountId) || "default",
        to: normalizeStringArray(record.to),
        subject: normalizeString(record.subject) || "",
        bodyPreview: normalizePreview(record.bodyPreview),
        ...(Number.isFinite(record.attachmentCount) && Number(record.attachmentCount) >= 0
          ? { attachmentCount: Math.floor(Number(record.attachmentCount)) }
          : {}),
        ...(normalizeString(record.threadId) ? { threadId: normalizeString(record.threadId) } : {}),
        ...(normalizeString(record.replyToMessageId) ? { replyToMessageId: normalizeString(record.replyToMessageId) } : {}),
        decision: record.decision,
        delivery: record.delivery,
        ...(normalizeString(record.requestId) ? { requestId: normalizeString(record.requestId) } : {}),
        ...(normalizeString(record.requestedByAgentId) ? { requestedByAgentId: normalizeString(record.requestedByAgentId) } : {}),
        ...(normalizeStringArray(record.cc).length > 0 ? { cc: normalizeStringArray(record.cc) } : {}),
        ...(normalizeStringArray(record.bcc).length > 0 ? { bcc: normalizeStringArray(record.bcc) } : {}),
        ...(normalizeString(record.providerMessageId) ? { providerMessageId: normalizeString(record.providerMessageId) } : {}),
        ...(normalizeString(record.providerThreadId) ? { providerThreadId: normalizeString(record.providerThreadId) } : {}),
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
        const items: EmailOutboundAuditRecord[] = [];
        for (let index = lines.length - 1; index >= 0 && items.length < safeLimit; index -= 1) {
          try {
            const parsed = JSON.parse(lines[index]) as EmailOutboundAuditRecord;
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
