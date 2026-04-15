import type { EmailInboundAuditStore } from "./email-inbound-audit-store.js";

export type EmailInboundDoctorReport = {
  available: boolean;
  enabled: boolean;
  setup: {
    providerId: "imap";
    configured: boolean;
    runtimeExpected: boolean;
    missingFields: string[];
    accountId: string;
    host: string;
    port: number;
    secure: boolean;
    mailbox: string;
    requestedAgentId: string;
    pollIntervalMs: number;
    connectTimeoutMs: number;
    socketTimeoutMs: number;
    bootstrapMode: "latest" | "all";
    recentWindowLimit: number;
    headline: string;
    nextStep: string;
  };
  totals: {
    totalRecords: number;
    processedCount: number;
    failedCount: number;
    invalidEventCount: number;
    duplicateCount: number;
    attachmentRecordCount: number;
    createdBindingCount: number;
  };
  providerCounts: Record<string, number>;
  accountCounts: Record<string, number>;
  mailboxCounts: Record<string, number>;
  statusCounts: Record<string, number>;
  errorCodeCounts: Record<string, number>;
  recentFailures: Array<{
    timestamp: number;
    providerId: string;
    accountId: string;
    mailbox: string;
    messageId?: string;
    threadId?: string;
    subject: string;
    errorCode?: string;
    error?: string;
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

function normalizePositiveInt(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function buildEmailInboundSetupSummary(input: {
  enabled: boolean;
  host?: string;
  username?: string;
  password?: string;
  accountId?: string;
  mailbox?: string;
  requestedAgentId?: string;
  port?: number;
  secure?: boolean;
  pollIntervalMs?: number;
  connectTimeoutMs?: number;
  socketTimeoutMs?: number;
  bootstrapMode?: "latest" | "all";
  recentWindowLimit?: number;
}): EmailInboundDoctorReport["setup"] {
  const enabled = input.enabled === true;
  const host = normalizeKey(input.host, "");
  const username = normalizeKey(input.username, "");
  const password = normalizeKey(input.password, "");
  const accountId = normalizeKey(input.accountId, "default");
  const mailbox = normalizeKey(input.mailbox, "INBOX");
  const requestedAgentId = normalizeKey(input.requestedAgentId, "default");
  const port = normalizePositiveInt(input.port, 993);
  const secure = input.secure !== false;
  const pollIntervalMs = normalizePositiveInt(input.pollIntervalMs, 60_000);
  const connectTimeoutMs = normalizePositiveInt(input.connectTimeoutMs, 10_000);
  const socketTimeoutMs = normalizePositiveInt(input.socketTimeoutMs, 20_000);
  const bootstrapMode = input.bootstrapMode === "all" ? "all" : "latest";
  const recentWindowLimit = normalizePositiveInt(input.recentWindowLimit, 0);

  const missingFields: string[] = [];
  if (!host) missingFields.push("BELLDANDY_EMAIL_IMAP_HOST");
  if (!username) missingFields.push("BELLDANDY_EMAIL_IMAP_USER");
  if (!password) missingFields.push("BELLDANDY_EMAIL_IMAP_PASS");

  const configured = missingFields.length === 0;
  const runtimeExpected = enabled && configured;
  const headline = !enabled
    ? "IMAP polling is disabled. Enable BELLDANDY_EMAIL_IMAP_ENABLED=true before expecting inbound mail."
    : configured
      ? `IMAP polling is configured for ${accountId}@${host}:${port}/${mailbox} -> agent ${requestedAgentId}.`
      + ` First attach bootstrap=${bootstrapMode}.`
      + ` Recent window limit=${recentWindowLimit > 0 ? String(recentWindowLimit) : "unbounded"}.`
      : `IMAP polling is enabled but incomplete; missing ${missingFields.join(", ")}.`;
  const nextStep = !enabled
    ? "Enable BELLDANDY_EMAIL_IMAP_ENABLED=true in the active env dir, then fill host/user/pass before restarting or waiting for config watcher reload."
    : configured
      ? "If inbound mail still does not start, verify the Config Source card and confirm your latest .env/.env.local change has triggered a Gateway restart."
      : `Complete ${missingFields.join(", ")} in the active env dir, then wait for Gateway restart or restart it manually.`;

  return {
    providerId: "imap",
    configured,
    runtimeExpected,
    missingFields,
    accountId,
    host,
    port,
    secure,
    mailbox,
    requestedAgentId,
    pollIntervalMs,
    connectTimeoutMs,
    socketTimeoutMs,
    bootstrapMode,
    recentWindowLimit,
    headline,
    nextStep,
  };
}

export async function buildEmailInboundDoctorReport(input: {
  auditStore: EmailInboundAuditStore;
  enabled: boolean;
  host?: string;
  username?: string;
  password?: string;
  accountId?: string;
  mailbox?: string;
  requestedAgentId?: string;
  port?: number;
  secure?: boolean;
  pollIntervalMs?: number;
  connectTimeoutMs?: number;
  socketTimeoutMs?: number;
  bootstrapMode?: "latest" | "all";
  recentWindowLimit?: number;
  recentLimit?: number;
  recentFailureLimit?: number;
}): Promise<EmailInboundDoctorReport> {
  const recentLimit = Number.isFinite(input.recentLimit) ? Math.max(1, Math.min(100, Math.floor(input.recentLimit as number))) : 50;
  const recentFailureLimit = Number.isFinite(input.recentFailureLimit) ? Math.max(1, Math.min(20, Math.floor(input.recentFailureLimit as number))) : 5;
  const items = await input.auditStore.listRecent(recentLimit);

  const providerCounts = new Map<string, number>();
  const accountCounts = new Map<string, number>();
  const mailboxCounts = new Map<string, number>();
  const statusCounts = new Map<string, number>();
  const errorCodeCounts = new Map<string, number>();
  let processedCount = 0;
  let failedCount = 0;
  let invalidEventCount = 0;
  let duplicateCount = 0;
  let attachmentRecordCount = 0;
  let createdBindingCount = 0;
  const setup = buildEmailInboundSetupSummary(input);

  const recentFailures: EmailInboundDoctorReport["recentFailures"] = [];
  for (const item of items) {
    const providerId = normalizeKey(item.providerId, "unknown");
    const accountId = normalizeKey(item.accountId, "default");
    const mailbox = normalizeKey(item.mailbox, "INBOX");
    const status = normalizeKey(item.status, "unknown");
    providerCounts.set(providerId, (providerCounts.get(providerId) ?? 0) + 1);
    accountCounts.set(accountId, (accountCounts.get(accountId) ?? 0) + 1);
    mailboxCounts.set(mailbox, (mailboxCounts.get(mailbox) ?? 0) + 1);
    statusCounts.set(status, (statusCounts.get(status) ?? 0) + 1);
    if (item.status === "processed") processedCount += 1;
    if (item.status === "failed") {
      failedCount += 1;
      if (recentFailures.length < recentFailureLimit) {
        recentFailures.push({
          timestamp: item.timestamp,
          providerId,
          accountId,
          mailbox,
          ...(typeof item.messageId === "string" && item.messageId.trim() ? { messageId: item.messageId.trim() } : {}),
          ...(typeof item.threadId === "string" && item.threadId.trim() ? { threadId: item.threadId.trim() } : {}),
          subject: typeof item.subject === "string" ? item.subject : "",
          ...(typeof item.errorCode === "string" && item.errorCode.trim() ? { errorCode: item.errorCode.trim() } : {}),
          ...(typeof item.error === "string" && item.error.trim() ? { error: item.error.trim() } : {}),
          bodyPreview: item.bodyPreview,
        });
      }
    }
    if (item.status === "invalid_event") invalidEventCount += 1;
    if (item.status === "skipped_duplicate") duplicateCount += 1;
    if (Number(item.attachmentCount) > 0) attachmentRecordCount += 1;
    if (item.createdBinding === true) createdBindingCount += 1;
    if (typeof item.errorCode === "string" && item.errorCode.trim()) {
      const key = item.errorCode.trim();
      errorCodeCounts.set(key, (errorCodeCounts.get(key) ?? 0) + 1);
    }
  }

  return {
    available: true,
    enabled: input.enabled,
    setup,
    totals: {
      totalRecords: items.length,
      processedCount,
      failedCount,
      invalidEventCount,
      duplicateCount,
      attachmentRecordCount,
      createdBindingCount,
    },
    providerCounts: sortCountMap(providerCounts),
    accountCounts: sortCountMap(accountCounts),
    mailboxCounts: sortCountMap(mailboxCounts),
    statusCounts: sortCountMap(statusCounts),
    errorCodeCounts: sortCountMap(errorCodeCounts),
    recentFailures,
    headline: [
      `setup=${setup.configured ? "configured" : "incomplete"}`,
      `records=${items.length}`,
      `processed=${processedCount}`,
      `failed=${failedCount}`,
      `invalid=${invalidEventCount}`,
      `duplicates=${duplicateCount}`,
      `providers=${providerCounts.size}`,
      `attachments=${attachmentRecordCount}`,
      setup.runtimeExpected ? "runtime=enabled" : input.enabled ? "runtime=blocked" : "runtime=disabled",
    ].join("; "),
  };
}
