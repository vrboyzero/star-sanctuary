export type EmailInboundProviderId = string;

export type EmailInboundAddress = {
  address: string;
  name?: string;
};

export type EmailInboundAttachmentMeta = {
  filename?: string;
  contentType?: string;
  sizeBytes?: number;
  contentId?: string;
  inline?: boolean;
  partId?: string;
};

export type EmailInboundSecurityEnvelope = {
  sourceTrust?: "external_untrusted";
  sanitationRequired?: boolean;
  externalLabels?: string[];
};

export type EmailInboundEvent = {
  providerId: EmailInboundProviderId;
  accountId: string;
  messageId: string;
  threadId?: string;
  receivedAt: number | string | Date;
  subject?: string;
  from: EmailInboundAddress[];
  to?: EmailInboundAddress[];
  cc?: EmailInboundAddress[];
  bcc?: EmailInboundAddress[];
  replyTo?: EmailInboundAddress[];
  snippet?: string;
  textBody?: string;
  htmlBody?: string;
  attachments?: EmailInboundAttachmentMeta[];
  references?: string[];
  inReplyToMessageId?: string;
  headers?: Record<string, string>;
  metadata?: Record<string, string>;
  security?: EmailInboundSecurityEnvelope;
};

export type NormalizedEmailInboundEvent = {
  providerId: EmailInboundProviderId;
  accountId: string;
  messageId: string;
  threadId: string;
  receivedAt: number;
  subject: string;
  from: EmailInboundAddress[];
  to: EmailInboundAddress[];
  cc: EmailInboundAddress[];
  bcc: EmailInboundAddress[];
  replyTo: EmailInboundAddress[];
  snippet?: string;
  textBody?: string;
  htmlBody?: string;
  attachments: EmailInboundAttachmentMeta[];
  references: string[];
  inReplyToMessageId?: string;
  headers: Record<string, string>;
  metadata: Record<string, string>;
  security: {
    sourceTrust: "external_untrusted";
    sanitationRequired: true;
    externalLabels: string[];
  };
};

export type NormalizeEmailInboundEventResult =
  | {
    ok: true;
    value: NormalizedEmailInboundEvent;
  }
  | {
    ok: false;
    code: "invalid_event";
    message: string;
    issues: string[];
  };

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isLikelyEmailAddress(value: string): boolean {
  const normalized = normalizeString(value);
  return /^[^\s@]+@[^\s@]+$/.test(normalized);
}

function normalizeAddressList(
  label: "from" | "to" | "cc" | "bcc" | "replyTo",
  input: EmailInboundAddress[] | undefined,
  issues: string[],
): EmailInboundAddress[] {
  if (!Array.isArray(input) || input.length === 0) {
    return [];
  }

  const deduped = new Set<string>();
  const items: EmailInboundAddress[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const item = input[index];
    const address = normalizeString(item?.address);
    const name = normalizeString(item?.name);
    if (!address) {
      issues.push(`${label}[${index}].address is required`);
      continue;
    }
    if (!isLikelyEmailAddress(address)) {
      issues.push(`${label}[${index}].address is invalid: ${address}`);
      continue;
    }
    const key = address.toLowerCase();
    if (deduped.has(key)) {
      continue;
    }
    deduped.add(key);
    items.push(name ? { address, name } : { address });
  }
  return items;
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

function normalizeAttachments(input: EmailInboundAttachmentMeta[] | undefined): EmailInboundAttachmentMeta[] {
  if (!Array.isArray(input) || input.length === 0) {
    return [];
  }

  const attachments: EmailInboundAttachmentMeta[] = [];
  for (const item of input) {
    const filename = normalizeString(item?.filename);
    const contentType = normalizeString(item?.contentType);
    const contentId = normalizeString(item?.contentId);
    const partId = normalizeString(item?.partId);
    attachments.push({
      ...(filename ? { filename } : {}),
      ...(contentType ? { contentType } : {}),
      ...(contentId ? { contentId } : {}),
      ...(partId ? { partId } : {}),
      ...(item?.inline === true ? { inline: true } : {}),
      ...(Number.isFinite(item?.sizeBytes) && Number(item.sizeBytes) >= 0
        ? { sizeBytes: Math.floor(Number(item.sizeBytes)) }
        : {}),
    });
  }
  return attachments;
}

function normalizeStringMap(input: Record<string, string> | undefined): Record<string, string> {
  if (!input || typeof input !== "object") {
    return {};
  }

  const output: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    const normalizedKey = normalizeString(key);
    const normalizedValue = normalizeString(value);
    if (!normalizedKey || !normalizedValue) {
      continue;
    }
    output[normalizedKey] = normalizedValue;
  }
  return output;
}

function normalizeReceivedAt(value: number | string | Date, issues: string[]): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return value;
  }
  if (value instanceof Date) {
    const timestamp = value.getTime();
    if (Number.isFinite(timestamp) && timestamp > 0) {
      return timestamp;
    }
    issues.push("receivedAt is invalid");
    return undefined;
  }
  const normalized = normalizeString(value);
  if (!normalized) {
    issues.push("receivedAt is required");
    return undefined;
  }
  const parsed = Date.parse(normalized);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  issues.push(`receivedAt is invalid: ${normalized}`);
  return undefined;
}

export function normalizeEmailInboundEvent(event: EmailInboundEvent): NormalizeEmailInboundEventResult {
  const issues: string[] = [];
  const providerId = normalizeString(event?.providerId);
  const accountId = normalizeString(event?.accountId);
  const messageId = normalizeString(event?.messageId);
  const subject = normalizeString(event?.subject);
  const snippet = normalizeString(event?.snippet);
  const textBody = normalizeString(event?.textBody);
  const htmlBody = normalizeString(event?.htmlBody);
  const inReplyToMessageId = normalizeString(event?.inReplyToMessageId);
  const references = normalizeStringList([
    ...(Array.isArray(event?.references) ? event.references : []),
    ...(inReplyToMessageId ? [inReplyToMessageId] : []),
  ]);
  const threadId = normalizeString(event?.threadId) || references[0] || inReplyToMessageId || messageId;
  const receivedAt = normalizeReceivedAt(event?.receivedAt, issues);

  if (!providerId) {
    issues.push("providerId is required");
  }
  if (!accountId) {
    issues.push("accountId is required");
  }
  if (!messageId) {
    issues.push("messageId is required");
  }
  if (!threadId) {
    issues.push("threadId is required");
  }

  const from = normalizeAddressList("from", event?.from, issues);
  const to = normalizeAddressList("to", event?.to, issues);
  const cc = normalizeAddressList("cc", event?.cc, issues);
  const bcc = normalizeAddressList("bcc", event?.bcc, issues);
  const replyTo = normalizeAddressList("replyTo", event?.replyTo, issues);
  if (from.length === 0) {
    issues.push("at least one sender is required");
  }
  if (!snippet && !textBody && !htmlBody) {
    issues.push("snippet, textBody, or htmlBody is required");
  }

  if (issues.length > 0 || !receivedAt) {
    return {
      ok: false,
      code: "invalid_event",
      message: issues[0] || "invalid inbound email event",
      issues,
    };
  }

  const externalLabels = normalizeStringList(event?.security?.externalLabels);
  return {
    ok: true,
    value: {
      providerId,
      accountId,
      messageId,
      threadId,
      receivedAt,
      subject,
      from,
      to,
      cc,
      bcc,
      replyTo,
      ...(snippet ? { snippet } : {}),
      ...(textBody ? { textBody } : {}),
      ...(htmlBody ? { htmlBody } : {}),
      attachments: normalizeAttachments(event?.attachments),
      references,
      ...(inReplyToMessageId ? { inReplyToMessageId } : {}),
      headers: normalizeStringMap(event?.headers),
      metadata: normalizeStringMap(event?.metadata),
      security: {
        sourceTrust: "external_untrusted",
        sanitationRequired: true,
        externalLabels,
      },
    },
  };
}
