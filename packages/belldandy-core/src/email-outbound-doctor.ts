import type { EmailOutboundAuditRecord, EmailOutboundAuditStore } from "./email-outbound-audit-store.js";

export type EmailOutboundDoctorReport = {
  available: boolean;
  requireConfirmation: boolean;
  totals: {
    totalRecords: number;
    confirmedCount: number;
    autoApprovedCount: number;
    rejectedCount: number;
    sentCount: number;
    failedCount: number;
    attachmentRecordCount: number;
  };
  providerCounts: Record<string, number>;
  accountCounts: Record<string, number>;
  errorCodeCounts: Record<string, number>;
  recentFailures: Array<{
    timestamp: number;
    providerId: string;
    accountId: string;
    subject: string;
    errorCode?: string;
    error?: string;
    providerMessageId?: string;
    threadId?: string;
    replyToMessageId?: string;
    bodyPreview: string;
  }>;
  headline: string;
};

function normalizeKey(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

function sortCountMap(map: Map<string, number>): Record<string, number> {
  return Object.fromEntries(
    Array.from(map.entries()).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])),
  );
}

export async function buildEmailOutboundDoctorReport(input: {
  auditStore: EmailOutboundAuditStore;
  requireConfirmation: boolean;
  recentLimit?: number;
  recentFailureLimit?: number;
}): Promise<EmailOutboundDoctorReport> {
  const recentLimit = Number.isFinite(input.recentLimit) ? Math.max(1, Math.min(100, Math.floor(input.recentLimit as number))) : 50;
  const recentFailureLimit = Number.isFinite(input.recentFailureLimit) ? Math.max(1, Math.min(20, Math.floor(input.recentFailureLimit as number))) : 5;
  const items = await input.auditStore.listRecent(recentLimit);

  const providerCounts = new Map<string, number>();
  const accountCounts = new Map<string, number>();
  const errorCodeCounts = new Map<string, number>();
  let confirmedCount = 0;
  let autoApprovedCount = 0;
  let rejectedCount = 0;
  let sentCount = 0;
  let failedCount = 0;
  let attachmentRecordCount = 0;

  const recentFailures: EmailOutboundDoctorReport["recentFailures"] = [];
  for (const item of items) {
    const providerId = normalizeKey(item.providerId, "unknown");
    const accountId = normalizeKey(item.accountId, "default");
    providerCounts.set(providerId, (providerCounts.get(providerId) ?? 0) + 1);
    accountCounts.set(accountId, (accountCounts.get(accountId) ?? 0) + 1);
    if (item.decision === "confirmed") confirmedCount += 1;
    if (item.decision === "auto_approved") autoApprovedCount += 1;
    if (item.decision === "rejected") rejectedCount += 1;
    if (item.delivery === "sent") sentCount += 1;
    if (item.delivery === "failed") {
      failedCount += 1;
      if (recentFailures.length < recentFailureLimit) {
        recentFailures.push({
          timestamp: item.timestamp,
          providerId,
          accountId,
          subject: item.subject || "",
          ...(typeof item.errorCode === "string" && item.errorCode.trim() ? { errorCode: item.errorCode.trim() } : {}),
          ...(typeof item.error === "string" && item.error.trim() ? { error: item.error.trim() } : {}),
          ...(typeof item.providerMessageId === "string" && item.providerMessageId.trim()
            ? { providerMessageId: item.providerMessageId.trim() }
            : {}),
          ...(typeof item.threadId === "string" && item.threadId.trim() ? { threadId: item.threadId.trim() } : {}),
          ...(typeof item.replyToMessageId === "string" && item.replyToMessageId.trim()
            ? { replyToMessageId: item.replyToMessageId.trim() }
            : {}),
          bodyPreview: item.bodyPreview,
        });
      }
    }
    if (Number(item.attachmentCount) > 0) {
      attachmentRecordCount += 1;
    }
    if (typeof item.errorCode === "string" && item.errorCode.trim()) {
      const key = item.errorCode.trim();
      errorCodeCounts.set(key, (errorCodeCounts.get(key) ?? 0) + 1);
    }
  }

  const headlineParts = [
    `records=${items.length}`,
    `sent=${sentCount}`,
    `failed=${failedCount}`,
    `providers=${providerCounts.size}`,
    `attachments=${attachmentRecordCount}`,
    input.requireConfirmation ? "confirm=required" : "confirm=disabled",
  ];

  return {
    available: true,
    requireConfirmation: input.requireConfirmation,
    totals: {
      totalRecords: items.length,
      confirmedCount,
      autoApprovedCount,
      rejectedCount,
      sentCount,
      failedCount,
      attachmentRecordCount,
    },
    providerCounts: sortCountMap(providerCounts),
    accountCounts: sortCountMap(accountCounts),
    errorCodeCounts: sortCountMap(errorCodeCounts),
    recentFailures,
    headline: headlineParts.join("; "),
  };
}
