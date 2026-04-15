import {
  normalizeEmailInboundEvent,
  type EmailInboundAddress,
  type EmailInboundAttachmentMeta,
  type NormalizeEmailInboundEventResult,
} from "./email-inbound-contract.js";
import type { EmailInboundProviderAdapter } from "./email-inbound-provider-registry.js";

export type ImapPolledMessage = {
  accountId?: string;
  uid?: string | number;
  messageId?: string;
  threadId?: string;
  subject?: string;
  from?: EmailInboundAddress[];
  to?: EmailInboundAddress[];
  cc?: EmailInboundAddress[];
  bcc?: EmailInboundAddress[];
  replyTo?: EmailInboundAddress[];
  snippet?: string;
  textBody?: string;
  htmlBody?: string;
  receivedAt?: number | string | Date;
  references?: string[];
  inReplyToMessageId?: string;
  attachments?: EmailInboundAttachmentMeta[];
  mailbox?: string;
  flags?: string[];
  headers?: Record<string, string>;
};

export type ImapPollingEmailInboundProviderOptions = {
  providerId?: string;
  accountId?: string;
};

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringList(input: string[] | undefined): string[] {
  if (!Array.isArray(input) || input.length === 0) {
    return [];
  }
  const deduped = new Set<string>();
  const values: string[] = [];
  for (const item of input) {
    const normalized = normalizeString(item);
    if (!normalized || deduped.has(normalized)) {
      continue;
    }
    deduped.add(normalized);
    values.push(normalized);
  }
  return values;
}

export class ImapPollingEmailInboundProvider implements EmailInboundProviderAdapter {
  readonly providerId: string;

  private readonly accountId?: string;

  constructor(options: ImapPollingEmailInboundProviderOptions = {}) {
    this.providerId = normalizeString(options.providerId) || "imap";
    this.accountId = normalizeString(options.accountId) || undefined;
  }

  normalizeInboundEvent(input: {
    accountId: string;
    raw: unknown;
  }): NormalizeEmailInboundEventResult {
    const source = (input.raw && typeof input.raw === "object" ? input.raw : {}) as Partial<ImapPolledMessage>;
    const resolvedAccountId = normalizeString(input.accountId)
      || this.accountId
      || normalizeString(source.accountId);

    const references = normalizeStringList([
      ...(Array.isArray(source.references) ? source.references : []),
      ...(normalizeString(source.inReplyToMessageId) ? [normalizeString(source.inReplyToMessageId)] : []),
    ]);
    const messageId = normalizeString(source.messageId);
    const threadId = normalizeString(source.threadId)
      || references[0]
      || normalizeString(source.inReplyToMessageId)
      || messageId;
    const flags = normalizeStringList(source.flags);
    const metadata: Record<string, string> = {
      ...(Number.isFinite(source.uid) ? { imapUid: String(source.uid) } : {}),
      ...(normalizeString(source.mailbox) ? { mailbox: normalizeString(source.mailbox) } : {}),
      ...(flags.length > 0 ? { flags: flags.join(",") } : {}),
    };

    return normalizeEmailInboundEvent({
      providerId: this.providerId,
      accountId: resolvedAccountId,
      messageId,
      threadId,
      receivedAt: source.receivedAt ?? "",
      subject: normalizeString(source.subject),
      from: Array.isArray(source.from) ? source.from : [],
      to: Array.isArray(source.to) ? source.to : [],
      cc: Array.isArray(source.cc) ? source.cc : [],
      bcc: Array.isArray(source.bcc) ? source.bcc : [],
      replyTo: Array.isArray(source.replyTo) ? source.replyTo : [],
      snippet: normalizeString(source.snippet),
      textBody: normalizeString(source.textBody),
      htmlBody: normalizeString(source.htmlBody),
      attachments: Array.isArray(source.attachments) ? source.attachments : [],
      references,
      inReplyToMessageId: normalizeString(source.inReplyToMessageId),
      headers: source.headers,
      metadata,
      security: {
        sourceTrust: "external_untrusted",
        sanitationRequired: true,
        externalLabels: flags,
      },
    });
  }
}
