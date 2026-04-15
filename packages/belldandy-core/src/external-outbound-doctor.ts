import type { ExternalOutboundAuditRecord, ExternalOutboundAuditStore } from "./external-outbound-audit-store.js";
import type { ExternalOutboundConfirmationStore } from "./external-outbound-confirmation-store.js";
import type { ExternalOutboundChannel } from "./external-outbound-sender-registry.js";
import { detectExternalOutboundFailureStage, type ExternalOutboundFailureStage } from "./external-outbound-diagnosis.js";

export type ExternalOutboundDoctorReport = {
  available: boolean;
  requireConfirmation: boolean;
  totals: {
    totalRecords: number;
    pendingConfirmationCount: number;
    confirmedCount: number;
    autoApprovedCount: number;
    rejectedCount: number;
    sentCount: number;
    failedCount: number;
    resolveFailedCount: number;
    deliveryFailedCount: number;
  };
  channelCounts: Partial<Record<ExternalOutboundChannel, number>>;
  errorCodeCounts: Record<string, number>;
  failureStageCounts: Record<ExternalOutboundFailureStage, number>;
  recentFailures: Array<{
    timestamp: number;
    targetChannel: ExternalOutboundChannel;
    delivery: ExternalOutboundAuditRecord["delivery"];
    resolution: ExternalOutboundAuditRecord["resolution"];
    failureStage: ExternalOutboundFailureStage;
    errorCode?: string;
    error?: string;
    requestedSessionKey?: string;
    targetSessionKey?: string;
    contentPreview: string;
  }>;
  recentPending: Array<{
    requestId: string;
    createdAt: number;
    expiresAt: number;
    conversationId: string;
    requestedByAgentId?: string;
    targetChannel: ExternalOutboundChannel;
    requestedSessionKey?: string;
    targetSessionKey: string;
    contentPreview: string;
  }>;
  headline: string;
};

export async function buildExternalOutboundDoctorReport(input: {
  auditStore: ExternalOutboundAuditStore;
  confirmationStore?: ExternalOutboundConfirmationStore;
  requireConfirmation: boolean;
  recentLimit?: number;
  recentFailureLimit?: number;
  recentPendingLimit?: number;
}): Promise<ExternalOutboundDoctorReport> {
  const recentLimit = Number.isFinite(input.recentLimit) ? Math.max(1, Math.min(100, Math.floor(input.recentLimit as number))) : 50;
  const recentFailureLimit = Number.isFinite(input.recentFailureLimit) ? Math.max(1, Math.min(20, Math.floor(input.recentFailureLimit as number))) : 5;
  const recentPendingLimit = Number.isFinite(input.recentPendingLimit) ? Math.max(1, Math.min(20, Math.floor(input.recentPendingLimit as number))) : 5;
  const items = await input.auditStore.listRecent(recentLimit);
  const pendingItems = input.confirmationStore?.listPending(recentPendingLimit) ?? [];

  const channelCounts: Partial<Record<ExternalOutboundChannel, number>> = {};
  const errorCodeCounts = new Map<string, number>();
  const failureStageCounts: Record<ExternalOutboundFailureStage, number> = {
    resolve: 0,
    delivery: 0,
    confirmation: 0,
  };
  let confirmedCount = 0;
  let autoApprovedCount = 0;
  let rejectedCount = 0;
  let sentCount = 0;
  let failedCount = 0;
  let resolveFailedCount = 0;
  let deliveryFailedCount = 0;

  const recentFailures: ExternalOutboundDoctorReport["recentFailures"] = [];
  for (const item of items) {
    channelCounts[item.targetChannel] = (channelCounts[item.targetChannel] ?? 0) + 1;
    if (item.decision === "confirmed") confirmedCount += 1;
    if (item.decision === "auto_approved") autoApprovedCount += 1;
    if (item.decision === "rejected") rejectedCount += 1;
    if (item.delivery === "sent") sentCount += 1;
    if (item.delivery === "failed") {
      failedCount += 1;
      const failureStage = detectExternalOutboundFailureStage({
        errorCode: item.errorCode,
        targetSessionKey: item.targetSessionKey,
        delivery: item.delivery,
      });
      failureStageCounts[failureStage] += 1;
      if (failureStage === "resolve") {
        resolveFailedCount += 1;
      } else if (failureStage === "delivery") {
        deliveryFailedCount += 1;
      }
      if (recentFailures.length < recentFailureLimit) {
        recentFailures.push({
          timestamp: item.timestamp,
          targetChannel: item.targetChannel,
          delivery: item.delivery,
          resolution: item.resolution,
          failureStage,
          ...(typeof item.errorCode === "string" && item.errorCode.trim() ? { errorCode: item.errorCode.trim() } : {}),
          ...(typeof item.error === "string" && item.error.trim() ? { error: item.error.trim() } : {}),
          ...(typeof item.requestedSessionKey === "string" && item.requestedSessionKey.trim()
            ? { requestedSessionKey: item.requestedSessionKey.trim() }
            : {}),
          ...(typeof item.targetSessionKey === "string" && item.targetSessionKey.trim()
            ? { targetSessionKey: item.targetSessionKey.trim() }
            : {}),
          contentPreview: item.contentPreview,
        });
      }
    }
    if (typeof item.errorCode === "string" && item.errorCode.trim()) {
      const key = item.errorCode.trim();
      errorCodeCounts.set(key, (errorCodeCounts.get(key) ?? 0) + 1);
    }
  }

  const errorCodeSummary = Object.fromEntries(
    Array.from(errorCodeCounts.entries()).sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0])),
  );

  const recentPending: ExternalOutboundDoctorReport["recentPending"] = pendingItems.map((item) => ({
    requestId: item.requestId,
    createdAt: item.createdAt,
    expiresAt: item.expiresAt,
    conversationId: item.conversationId,
    ...(typeof item.requestedByAgentId === "string" && item.requestedByAgentId.trim()
      ? { requestedByAgentId: item.requestedByAgentId.trim() }
      : {}),
    targetChannel: item.channel,
    ...(typeof item.sessionKey === "string" && item.sessionKey.trim()
      ? { requestedSessionKey: item.sessionKey.trim() }
      : {}),
    targetSessionKey: item.resolvedSessionKey,
    contentPreview: item.content.replace(/\s+/g, " ").trim().slice(0, 160),
  }));

  const headlineParts = [
    `records=${items.length}`,
    `pending=${pendingItems.length}`,
    `sent=${sentCount}`,
    `failed=${failedCount}`,
    `resolve_failed=${resolveFailedCount}`,
    `delivery_failed=${deliveryFailedCount}`,
    input.requireConfirmation ? "confirm=required" : "confirm=disabled",
  ];

  return {
    available: true,
    requireConfirmation: input.requireConfirmation,
    totals: {
      totalRecords: items.length,
      pendingConfirmationCount: pendingItems.length,
      confirmedCount,
      autoApprovedCount,
      rejectedCount,
      sentCount,
      failedCount,
      resolveFailedCount,
      deliveryFailedCount,
    },
    channelCounts,
    errorCodeCounts: errorCodeSummary,
    failureStageCounts,
    recentFailures,
    recentPending,
    headline: headlineParts.join("; "),
  };
}
