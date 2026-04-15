import nodemailer from "nodemailer";

import type { NormalizedEmailOutboundDraft } from "./email-outbound-contract.js";
import type { EmailOutboundProvider, EmailOutboundProviderSendResult } from "./email-outbound-provider-registry.js";

export type SmtpEmailOutboundProviderOptions = {
  providerId?: string;
  accountId: string;
  host: string;
  port: number;
  secure: boolean;
  username?: string;
  password?: string;
  fromAddress: string;
  fromName?: string;
};

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function formatAddress(input: { address: string; name?: string }): string {
  const address = normalizeString(input.address);
  const name = normalizeString(input.name);
  return name ? `"${name.replace(/"/g, '\\"')}" <${address}>` : address;
}

function resolvePreviewText(input: { text?: string; html?: string }): string {
  const text = normalizeString(input.text);
  if (text) return text;
  const html = normalizeString(input.html);
  if (!html) return "";
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

export class SmtpEmailOutboundProvider implements EmailOutboundProvider {
  readonly providerId: string;

  private readonly accountId: string;
  private readonly transporter;
  private readonly fromAddress: string;
  private readonly fromName?: string;

  constructor(options: SmtpEmailOutboundProviderOptions) {
    this.providerId = normalizeString(options.providerId) || "smtp";
    this.accountId = normalizeString(options.accountId) || "default";
    this.fromAddress = normalizeString(options.fromAddress);
    this.fromName = normalizeString(options.fromName) || undefined;
    this.transporter = nodemailer.createTransport({
      host: normalizeString(options.host),
      port: options.port,
      secure: options.secure,
      ...(normalizeString(options.username)
        ? {
          auth: {
            user: normalizeString(options.username),
            pass: normalizeString(options.password),
          },
        }
        : {}),
    });
  }

  async send({ draft }: { draft: NormalizedEmailOutboundDraft }): Promise<EmailOutboundProviderSendResult> {
    if (draft.accountId !== this.accountId) {
      return {
        ok: false,
        providerId: this.providerId,
        code: "invalid_provider_config",
        message: `SMTP account mismatch: draft=${draft.accountId}, configured=${this.accountId}`,
      };
    }

    try {
      const references = [draft.threadId, draft.replyToMessageId].filter((value): value is string => Boolean(normalizeString(value)));
      const result = await this.transporter.sendMail({
        from: formatAddress({
          address: this.fromAddress,
          ...(this.fromName ? { name: this.fromName } : {}),
        }),
        to: draft.to.map(formatAddress),
        ...(draft.cc.length > 0 ? { cc: draft.cc.map(formatAddress) } : {}),
        ...(draft.bcc.length > 0 ? { bcc: draft.bcc.map(formatAddress) } : {}),
        subject: draft.subject,
        ...(draft.text ? { text: draft.text } : { text: resolvePreviewText(draft) }),
        ...(draft.html ? { html: draft.html } : {}),
        ...(draft.replyToMessageId ? { inReplyTo: draft.replyToMessageId } : {}),
        ...(references.length > 0 ? { references } : {}),
        ...(draft.attachments.length > 0
          ? {
            attachments: draft.attachments.map((attachment: NormalizedEmailOutboundDraft["attachments"][number]) => ({
              filename: attachment.filename,
              ...(attachment.contentType ? { contentType: attachment.contentType } : {}),
              ...(attachment.filePath ? { path: attachment.filePath } : {}),
              ...(attachment.contentBase64 ? { content: attachment.contentBase64, encoding: "base64" as const } : {}),
              ...(attachment.contentId ? { cid: attachment.contentId } : {}),
              ...(attachment.inline === true ? { contentDisposition: "inline" as const } : {}),
            })),
          }
          : {}),
      });
      return {
        ok: true,
        providerId: this.providerId,
        providerMessageId: normalizeString(result.messageId) || undefined,
        providerThreadId: draft.threadId || normalizeString(result.messageId) || undefined,
        acceptedAt: Date.now(),
      };
    } catch (error) {
      return {
        ok: false,
        providerId: this.providerId,
        code: "send_failed",
        message: error instanceof Error ? error.message : String(error),
        retryable: true,
      };
    }
  }
}
