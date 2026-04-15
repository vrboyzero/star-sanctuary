export type EmailOutboundProviderId = string;

export type EmailOutboundRecipient = {
  address: string;
  name?: string;
};

export type EmailOutboundAttachment = {
  filename: string;
  contentType?: string;
  contentBase64?: string;
  filePath?: string;
  contentId?: string;
  inline?: boolean;
  sizeBytes?: number;
};

export type EmailOutboundDraft = {
  accountId: string;
  providerId?: EmailOutboundProviderId;
  to: EmailOutboundRecipient[];
  cc?: EmailOutboundRecipient[];
  bcc?: EmailOutboundRecipient[];
  subject?: string;
  text?: string;
  html?: string;
  attachments?: EmailOutboundAttachment[];
  threadId?: string;
  replyToMessageId?: string;
  metadata?: Record<string, string>;
};

export type NormalizedEmailOutboundDraft = {
  accountId: string;
  providerId?: EmailOutboundProviderId;
  to: EmailOutboundRecipient[];
  cc: EmailOutboundRecipient[];
  bcc: EmailOutboundRecipient[];
  subject: string;
  text?: string;
  html?: string;
  attachments: EmailOutboundAttachment[];
  threadId?: string;
  replyToMessageId?: string;
  metadata: Record<string, string>;
};

export type NormalizeEmailOutboundDraftResult =
  | {
    ok: true;
    value: NormalizedEmailOutboundDraft;
  }
  | {
    ok: false;
    code: "invalid_draft";
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

function normalizeRecipientList(
  label: "to" | "cc" | "bcc",
  input: EmailOutboundRecipient[] | undefined,
  issues: string[],
): EmailOutboundRecipient[] {
  if (!Array.isArray(input) || input.length === 0) {
    return [];
  }

  const deduped = new Set<string>();
  const recipients: EmailOutboundRecipient[] = [];

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
    const dedupeKey = address.toLowerCase();
    if (deduped.has(dedupeKey)) {
      continue;
    }
    deduped.add(dedupeKey);
    recipients.push(name ? { address, name } : { address });
  }

  return recipients;
}

function normalizeAttachments(
  input: EmailOutboundAttachment[] | undefined,
  issues: string[],
): EmailOutboundAttachment[] {
  if (!Array.isArray(input) || input.length === 0) {
    return [];
  }

  const attachments: EmailOutboundAttachment[] = [];
  for (let index = 0; index < input.length; index += 1) {
    const item = input[index];
    const filename = normalizeString(item?.filename);
    const contentType = normalizeString(item?.contentType);
    const contentBase64 = normalizeString(item?.contentBase64);
    const filePath = normalizeString(item?.filePath);
    const contentId = normalizeString(item?.contentId);

    if (!filename) {
      issues.push(`attachments[${index}].filename is required`);
      continue;
    }
    if (!contentBase64 && !filePath) {
      issues.push(`attachments[${index}] requires contentBase64 or filePath`);
      continue;
    }

    attachments.push({
      filename,
      ...(contentType ? { contentType } : {}),
      ...(contentBase64 ? { contentBase64 } : {}),
      ...(filePath ? { filePath } : {}),
      ...(contentId ? { contentId } : {}),
      ...(item?.inline === true ? { inline: true } : {}),
      ...(Number.isFinite(item?.sizeBytes) && Number(item.sizeBytes) >= 0
        ? { sizeBytes: Math.floor(Number(item.sizeBytes)) }
        : {}),
    });
  }

  return attachments;
}

function normalizeMetadata(input: Record<string, string> | undefined): Record<string, string> {
  if (!input || typeof input !== "object") {
    return {};
  }

  const metadata: Record<string, string> = {};
  for (const [key, value] of Object.entries(input)) {
    const normalizedKey = normalizeString(key);
    const normalizedValue = normalizeString(value);
    if (!normalizedKey || !normalizedValue) {
      continue;
    }
    metadata[normalizedKey] = normalizedValue;
  }
  return metadata;
}

export function normalizeEmailOutboundDraft(draft: EmailOutboundDraft): NormalizeEmailOutboundDraftResult {
  const issues: string[] = [];
  const accountId = normalizeString(draft?.accountId);
  const providerId = normalizeString(draft?.providerId);
  const subject = normalizeString(draft?.subject);
  const text = normalizeString(draft?.text);
  const html = normalizeString(draft?.html);
  const threadId = normalizeString(draft?.threadId);
  const replyToMessageId = normalizeString(draft?.replyToMessageId);

  if (!accountId) {
    issues.push("accountId is required");
  }

  const to = normalizeRecipientList("to", draft?.to, issues);
  const cc = normalizeRecipientList("cc", draft?.cc, issues);
  const bcc = normalizeRecipientList("bcc", draft?.bcc, issues);
  if (to.length + cc.length + bcc.length === 0) {
    issues.push("at least one recipient is required");
  }

  if (!text && !html) {
    issues.push("text or html is required");
  }

  const attachments = normalizeAttachments(draft?.attachments, issues);
  const metadata = normalizeMetadata(draft?.metadata);

  if (issues.length > 0) {
    return {
      ok: false,
      code: "invalid_draft",
      message: issues[0],
      issues,
    };
  }

  return {
    ok: true,
    value: {
      accountId,
      ...(providerId ? { providerId } : {}),
      to,
      cc,
      bcc,
      subject,
      ...(text ? { text } : {}),
      ...(html ? { html } : {}),
      attachments,
      ...(threadId ? { threadId } : {}),
      ...(replyToMessageId ? { replyToMessageId } : {}),
      metadata,
    },
  };
}
