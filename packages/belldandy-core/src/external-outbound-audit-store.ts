import fs from "node:fs/promises";
import path from "node:path";
import { readRecentJsonlRecords } from "./jsonl-tail-reader.js";

import type {
  ExternalOutboundChannel,
  ExternalOutboundResolutionMode,
} from "./external-outbound-sender-registry.js";

export type ExternalOutboundAuditDecision = "confirmed" | "rejected" | "auto_approved";
export type ExternalOutboundAuditDelivery = "sent" | "failed" | "rejected";

export type ExternalOutboundAuditRecord = {
  timestamp: number;
  requestId?: string;
  sourceConversationId: string;
  sourceChannel: "webchat";
  requestedByAgentId?: string;
  targetChannel: ExternalOutboundChannel;
  requestedSessionKey?: string;
  targetSessionKey?: string;
  targetChatId?: string;
  targetAccountId?: string;
  resolution: ExternalOutboundResolutionMode;
  decision: ExternalOutboundAuditDecision;
  delivery: ExternalOutboundAuditDelivery;
  contentPreview: string;
  errorCode?: string;
  error?: string;
};

export type ExternalOutboundAuditStore = {
  append(record: ExternalOutboundAuditRecord): Promise<void>;
  listRecent(limit?: number): Promise<ExternalOutboundAuditRecord[]>;
};

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function normalizePreview(value: unknown): string {
  const normalized = String(value ?? "").replace(/\s+/g, " ").trim();
  return normalized.length <= 160 ? normalized : `${normalized.slice(0, 157)}...`;
}

export function resolveExternalOutboundAuditStorePath(stateDir: string): string {
  return path.join(stateDir, "external-outbound-audit.jsonl");
}

export function createFileExternalOutboundAuditStore(filePath: string): ExternalOutboundAuditStore {
  let writeChain = Promise.resolve();

  return {
    async append(record) {
      const normalized: ExternalOutboundAuditRecord = {
        timestamp: Number.isFinite(record.timestamp) && record.timestamp > 0 ? record.timestamp : Date.now(),
        sourceConversationId: normalizeString(record.sourceConversationId) || "unknown",
        sourceChannel: "webchat",
        targetChannel: record.targetChannel,
        resolution: record.resolution,
        decision: record.decision,
        delivery: record.delivery,
        contentPreview: normalizePreview(record.contentPreview),
        ...(normalizeString(record.requestId) ? { requestId: normalizeString(record.requestId) } : {}),
        ...(normalizeString(record.requestedByAgentId) ? { requestedByAgentId: normalizeString(record.requestedByAgentId) } : {}),
        ...(normalizeString(record.requestedSessionKey) ? { requestedSessionKey: normalizeString(record.requestedSessionKey) } : {}),
        ...(normalizeString(record.targetSessionKey) ? { targetSessionKey: normalizeString(record.targetSessionKey) } : {}),
        ...(normalizeString(record.targetChatId) ? { targetChatId: normalizeString(record.targetChatId) } : {}),
        ...(normalizeString(record.targetAccountId) ? { targetAccountId: normalizeString(record.targetAccountId) } : {}),
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
      return readRecentJsonlRecords<ExternalOutboundAuditRecord>({
        filePath,
        limit,
      });
    },
  };
}
