import crypto from "node:crypto";

import type { JsonObject, Tool, ToolCallResult, ToolContext } from "../types.js";
import { withToolContract } from "../tool-contract.js";

export const SEND_EMAIL_TOOL_NAME = "send_email";

type EmailOutboundRecipient = {
  address: string;
  name?: string;
};

type EmailOutboundAttachment = {
  filename: string;
  filePath?: string;
  contentType?: string;
  contentBase64?: string;
  contentId?: string;
  inline?: boolean;
  sizeBytes?: number;
};

type NormalizedEmailOutboundDraft = {
  accountId: string;
  providerId?: string;
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

type NormalizeDraftResult =
  | { ok: true; value: NormalizedEmailOutboundDraft }
  | { ok: false; message: string; issues?: string[] };

type EmailOutboundProviderRegistryLike = {
  send(input: {
    draft: NormalizedEmailOutboundDraft;
    providerId?: string;
    context?: {
      conversationId?: string;
      requestedByAgentId?: string;
      traceId?: string;
    };
  }): Promise<
    | {
      ok: true;
      providerId: string;
      draft: NormalizedEmailOutboundDraft;
      providerMessageId?: string;
      providerThreadId?: string;
    }
    | {
      ok: false;
      providerId?: string;
      code: string;
      message: string;
      issues?: string[];
      draft?: NormalizedEmailOutboundDraft;
    }
  >;
};

type EmailOutboundConfirmationStoreLike = {
  create(request: {
    requestId: string;
    conversationId: string;
    requestedByAgentId?: string;
    draft: NormalizedEmailOutboundDraft;
  }): {
    requestId: string;
    expiresAt: number;
  };
  cleanupExpired(): void;
};

type EmailOutboundAuditStoreLike = {
  append(record: {
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
    decision: "confirmed" | "rejected" | "auto_approved";
    delivery: "sent" | "failed" | "rejected";
    providerMessageId?: string;
    providerThreadId?: string;
    errorCode?: string;
    error?: string;
  }): Promise<void>;
};

type EmailFollowUpReminderStoreLike = {
  resolveByThread(input: {
    providerId: string;
    accountId: string;
    threadId: string;
    resolvedAt?: number;
    resolutionSource?: string;
  }): Promise<unknown>;
};

export type SendEmailDeps = {
  providerRegistry: EmailOutboundProviderRegistryLike;
  confirmationStore: EmailOutboundConfirmationStoreLike;
  auditStore: EmailOutboundAuditStoreLike;
  reminderStore?: EmailFollowUpReminderStoreLike;
  normalizeDraft: (draft: Record<string, unknown>) => NormalizeDraftResult;
  getRequireConfirmation: () => boolean;
  getDefaultAccountId?: () => string | undefined;
  getDefaultProviderId?: () => string | undefined;
};

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalBoolean(value: unknown): boolean | undefined {
  return value === true ? true : undefined;
}

function normalizeAttachmentList(value: unknown): EmailOutboundAttachment[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) {
        return null;
      }
      const record = item as Record<string, unknown>;
      const filename = normalizeString(record.filename);
      const filePath = normalizeString(record.filePath);
      const contentType = normalizeString(record.contentType);
      const contentBase64 = normalizeString(record.contentBase64);
      const contentId = normalizeString(record.contentId);
      const sizeBytes = Number.isFinite(record.sizeBytes) ? Math.max(0, Math.floor(Number(record.sizeBytes))) : undefined;
      if (!filename) {
        return null;
      }
      return {
        filename,
        ...(filePath ? { filePath } : {}),
        ...(contentType ? { contentType } : {}),
        ...(contentBase64 ? { contentBase64 } : {}),
        ...(contentId ? { contentId } : {}),
        ...(normalizeOptionalBoolean(record.inline) ? { inline: true } : {}),
        ...(typeof sizeBytes === "number" ? { sizeBytes } : {}),
      };
    })
    .filter((item): item is EmailOutboundAttachment => Boolean(item));
}

function normalizeRecipientItem(value: unknown): EmailOutboundRecipient | null {
  if (typeof value === "string") {
    const address = normalizeString(value);
    return address ? { address } : null;
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  const address = normalizeString(record.address);
  const name = normalizeString(record.name);
  if (!address) {
    return null;
  }
  return name ? { address, name } : { address };
}

function normalizeRecipientArgs(value: unknown): EmailOutboundRecipient[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map(normalizeRecipientItem).filter((item): item is EmailOutboundRecipient => Boolean(item));
}

function isLocalWebChatContext(context: ToolContext): boolean {
  return context.roomContext?.environment === "local";
}

function canUseSendEmailFromCurrentContext(context: ToolContext, requireConfirmation: boolean): boolean {
  if (isLocalWebChatContext(context)) {
    return true;
  }
  const hasConversation = normalizeString(context.conversationId).length > 0;
  if (!hasConversation) {
    return false;
  }
  if (requireConfirmation) {
    return typeof context.broadcast === "function";
  }
  return true;
}

function getConfirmTargetClientId(context: ToolContext): string | undefined {
  const roomContext = context.roomContext as (ToolContext["roomContext"] & { clientId?: string }) | undefined;
  return normalizeString(roomContext?.clientId) || undefined;
}

function previewBody(input: { text?: string; html?: string }): string {
  const text = normalizeString(input.text);
  if (text) {
    return text.length <= 200 ? text : `${text.slice(0, 197)}...`;
  }
  const html = normalizeString(input.html).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return html.length <= 200 ? html : `${html.slice(0, 197)}...`;
}

function formatRecipientList(items: EmailOutboundRecipient[]): string {
  return items.map((item) => item.name ? `${item.name} <${item.address}>` : item.address).join(", ");
}

function formatErrorMessage(code: string | undefined, message: string): string {
  const normalizedCode = normalizeString(code);
  return normalizedCode ? `[${normalizedCode}] ${message}` : message;
}

function safeDecodeURIComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseEmailThreadConversationId(conversationId: string | undefined): {
  providerId: string;
  accountId: string;
  threadId: string;
} | undefined {
  const normalized = normalizeString(conversationId);
  if (!normalized.startsWith("channel=email:")) {
    return undefined;
  }
  const parts = normalized.split(":");
  const values: Record<string, string> = {};
  for (const part of parts) {
    const separatorIndex = part.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = part.slice(0, separatorIndex).trim();
    const rawValue = part.slice(separatorIndex + 1).trim();
    if (!key || !rawValue) continue;
    values[key] = safeDecodeURIComponent(rawValue);
  }
  if (values.scope !== "per-account-thread") {
    return undefined;
  }
  const providerId = normalizeString(values.provider);
  const accountId = normalizeString(values.account);
  const threadId = normalizeString(values.thread);
  if (!providerId || !accountId || !threadId) {
    return undefined;
  }
  return { providerId, accountId, threadId };
}

function buildThreadGuidance(input: {
  conversationId?: string;
  draft: NormalizedEmailOutboundDraft;
}): string[] {
  const context = parseEmailThreadConversationId(input.conversationId);
  if (!context) return [];
  if (!input.draft.threadId) {
    return [
      `Current Email Thread: ${context.threadId}`,
      `Thread Guidance: this conversation already belongs to an email thread; add threadId=${context.threadId} if you want to keep replying in the same thread.`,
      "Reply Guidance: no replyToMessageId was provided. Add it when you want to explicitly reply to a specific inbound message.",
    ];
  }
  if (input.draft.threadId !== context.threadId) {
    return [
      `Current Email Thread: ${context.threadId}`,
      `Thread Guidance: current conversation thread is ${context.threadId}, but this draft uses threadId=${input.draft.threadId}. Confirm this intentional thread switch.`,
      input.draft.replyToMessageId
        ? `Reply Guidance: explicit reply target=${input.draft.replyToMessageId}.`
        : "Reply Guidance: no replyToMessageId was provided.",
    ];
  }
  if (!input.draft.replyToMessageId) {
    return [
      `Current Email Thread: ${context.threadId}`,
      "Thread Guidance: this draft will continue the current email thread.",
      "Reply Guidance: no replyToMessageId was provided. Add it when you want to explicitly reply to a specific inbound message.",
    ];
  }
  return [
    `Current Email Thread: ${context.threadId}`,
    "Thread Guidance: this draft will continue the current email thread.",
    `Reply Guidance: explicit reply target=${input.draft.replyToMessageId}.`,
  ];
}

function buildSuccessOutput(input: {
  providerId: string;
  draft: NormalizedEmailOutboundDraft;
  pending?: boolean;
  providerMessageId?: string;
  providerThreadId?: string;
  conversationId?: string;
}): string {
  const lines = input.pending
    ? [
      `已创建待确认的 ${input.providerId} 邮件发送请求。`,
      "请等待 WebChat 页面中的确认窗口审批后再继续。",
    ]
    : [`已通过 ${input.providerId} 发送邮件。`];
  lines.push(`Account: ${input.draft.accountId}`);
  lines.push(`To: ${formatRecipientList(input.draft.to)}`);
  if (input.draft.cc.length > 0) lines.push(`Cc: ${formatRecipientList(input.draft.cc)}`);
  if (input.draft.bcc.length > 0) lines.push(`Bcc: ${formatRecipientList(input.draft.bcc)}`);
  lines.push(`Subject: ${input.draft.subject || "(no subject)"}`);
  if (input.draft.attachments.length > 0) {
    lines.push(`Attachments: ${input.draft.attachments.length}`);
  }
  if (input.draft.threadId) {
    lines.push(`Thread: ${input.draft.threadId}`);
  }
  if (input.draft.replyToMessageId) {
    lines.push(`Reply-To Message ID: ${input.draft.replyToMessageId}`);
  }
  if (input.providerMessageId) {
    lines.push(`Message ID: ${input.providerMessageId}`);
  }
  if (input.providerThreadId && input.providerThreadId !== input.providerMessageId) {
    lines.push(`Provider Thread: ${input.providerThreadId}`);
  }
  lines.push(...buildThreadGuidance({
    conversationId: input.conversationId,
    draft: input.draft,
  }));
  return lines.join("\n");
}

function listAddresses(items: EmailOutboundRecipient[]): string[] {
  return items.map((item) => item.address);
}

export function createSendEmailTool(deps: SendEmailDeps): Tool {
  return withToolContract({
    definition: {
      name: SEND_EMAIL_TOOL_NAME,
      description: "Draft and send an email from the current local WebChat session. Requires user confirmation by default before SMTP delivery.",
      parameters: {
        type: "object",
        properties: {
          accountId: { type: "string", description: "Optional mail account id. Falls back to the configured default account." },
          providerId: { type: "string", description: "Optional outbound provider id. Falls back to the configured default provider." },
          to: {
            type: "array",
            description: "Primary recipients as email addresses.",
            items: { type: "string" },
          },
          cc: {
            type: "array",
            description: "CC recipients as email addresses.",
            items: { type: "string" },
          },
          bcc: {
            type: "array",
            description: "BCC recipients as email addresses.",
            items: { type: "string" },
          },
          subject: { type: "string", description: "Email subject line." },
          text: { type: "string", description: "Plain text email body." },
          html: { type: "string", description: "Optional HTML email body." },
          attachments: {
            type: "array",
            description: "Optional attachments. Each item must include filename plus either filePath or contentBase64.",
            items: {
              type: "object",
              properties: {
                filename: { type: "string" },
                filePath: { type: "string" },
                contentType: { type: "string" },
                contentBase64: { type: "string" },
                contentId: { type: "string" },
                inline: { type: "boolean" },
                sizeBytes: { type: "number" },
              },
              required: ["filename"],
            },
          },
          threadId: { type: "string", description: "Optional thread identifier to carry across replies in the same mail thread." },
          replyToMessageId: { type: "string", description: "Optional RFC822 message id to reply to." },
        },
        required: ["to"],
      },
    },

    async execute(args: JsonObject, context: ToolContext): Promise<ToolCallResult> {
      const startedAt = Date.now();
      deps.confirmationStore.cleanupExpired();
      const requireConfirmation = deps.getRequireConfirmation();

      if (!canUseSendEmailFromCurrentContext(context, requireConfirmation)) {
        return {
          id: "",
          name: SEND_EMAIL_TOOL_NAME,
          success: false,
          output: "",
          error: requireConfirmation
            ? "send_email 当前需要从可回传确认弹窗的 WebChat 会话中使用。"
            : "send_email 当前需要绑定到一个可追踪的会话上下文中使用。",
          durationMs: Date.now() - startedAt,
        };
      }

      const normalizedDraftInput: Record<string, unknown> = {
        accountId: normalizeString(args.accountId) || normalizeString(deps.getDefaultAccountId?.()) || "default",
        providerId: normalizeString(args.providerId) || normalizeString(deps.getDefaultProviderId?.()) || undefined,
        to: normalizeRecipientArgs(args.to),
        cc: normalizeRecipientArgs(args.cc),
        bcc: normalizeRecipientArgs(args.bcc),
        subject: normalizeString(args.subject),
        text: normalizeString(args.text),
        html: normalizeString(args.html),
        attachments: normalizeAttachmentList(args.attachments),
        threadId: normalizeString(args.threadId),
        replyToMessageId: normalizeString(args.replyToMessageId),
      };

      const normalized = deps.normalizeDraft(normalizedDraftInput);
      if (!normalized.ok) {
        return {
          id: "",
          name: SEND_EMAIL_TOOL_NAME,
          success: false,
          output: "",
          error: normalized.issues?.length ? normalized.issues.join("; ") : normalized.message,
          durationMs: Date.now() - startedAt,
        };
      }

      const preview = previewBody(normalized.value);
      if (requireConfirmation) {
        if (!context.broadcast) {
          return {
            id: "",
            name: SEND_EMAIL_TOOL_NAME,
            success: false,
            output: "",
            error: "当前运行时缺少 WebChat 确认广播能力，无法继续邮件发送确认。",
            durationMs: Date.now() - startedAt,
          };
        }
        const requestId = crypto.randomUUID().slice(0, 8).toUpperCase();
        const pending = deps.confirmationStore.create({
          requestId,
          conversationId: context.conversationId,
          requestedByAgentId: context.agentId,
          draft: normalized.value,
        });
        context.broadcast("email_outbound.confirm.required", {
          source: "agent",
          conversationId: context.conversationId,
          requestId,
          requestedByAgentId: context.agentId,
          providerId: normalized.value.providerId || normalizeString(deps.getDefaultProviderId?.()) || "unknown",
          accountId: normalized.value.accountId,
          to: listAddresses(normalized.value.to),
          cc: listAddresses(normalized.value.cc),
          bcc: listAddresses(normalized.value.bcc),
          subject: normalized.value.subject,
          bodyPreview: preview,
          attachmentCount: normalized.value.attachments.length,
          threadId: normalized.value.threadId,
          replyToMessageId: normalized.value.replyToMessageId,
          expiresAt: pending.expiresAt,
          targetClientId: getConfirmTargetClientId(context),
        });
        return {
          id: "",
          name: SEND_EMAIL_TOOL_NAME,
          success: true,
          output: buildSuccessOutput({
            providerId: normalized.value.providerId || normalizeString(deps.getDefaultProviderId?.()) || "unknown",
            draft: normalized.value,
            pending: true,
            conversationId: context.conversationId,
          }),
          durationMs: Date.now() - startedAt,
        };
      }

      const sent = await deps.providerRegistry.send({
        draft: normalized.value,
        providerId: normalized.value.providerId,
        context: {
          conversationId: context.conversationId,
          requestedByAgentId: context.agentId,
        },
      });

      await deps.auditStore.append({
        timestamp: Date.now(),
        sourceConversationId: context.conversationId,
        sourceChannel: "webchat",
        requestedByAgentId: context.agentId,
        providerId: sent.providerId || normalized.value.providerId || "unknown",
        accountId: normalized.value.accountId,
        to: listAddresses(normalized.value.to),
        cc: listAddresses(normalized.value.cc),
        bcc: listAddresses(normalized.value.bcc),
        subject: normalized.value.subject,
        bodyPreview: preview,
        attachmentCount: normalized.value.attachments.length,
        threadId: normalized.value.threadId,
        replyToMessageId: normalized.value.replyToMessageId,
        decision: "auto_approved",
        delivery: sent.ok ? "sent" : "failed",
        ...(sent.ok && sent.providerMessageId ? { providerMessageId: sent.providerMessageId } : {}),
        ...(sent.ok && sent.providerThreadId ? { providerThreadId: sent.providerThreadId } : {}),
        ...(!sent.ok && sent.code ? { errorCode: sent.code, error: sent.message } : {}),
      });

      if (!sent.ok) {
        return {
          id: "",
          name: SEND_EMAIL_TOOL_NAME,
          success: false,
          output: "",
          error: formatErrorMessage(sent.code, sent.message),
          durationMs: Date.now() - startedAt,
        };
      }

      const resolvedThreadId = sent.providerThreadId || normalized.value.threadId;
      if (resolvedThreadId) {
        await deps.reminderStore?.resolveByThread({
          providerId: sent.providerId,
          accountId: normalized.value.accountId,
          threadId: resolvedThreadId,
          resolutionSource: "send_email.auto_send",
        });
      }

      return {
        id: "",
        name: SEND_EMAIL_TOOL_NAME,
        success: true,
        output: buildSuccessOutput({
          providerId: sent.providerId,
          draft: sent.draft,
          providerMessageId: sent.providerMessageId,
          providerThreadId: sent.providerThreadId,
          conversationId: context.conversationId,
        }),
        durationMs: Date.now() - startedAt,
      };
    },
  }, {
    family: "other",
    isReadOnly: false,
    isConcurrencySafe: true,
    needsPermission: false,
    riskLevel: "high",
    channels: ["gateway", "web"],
    safeScopes: ["local-safe", "web-safe"],
    activityDescription: "Send an email from WebChat through the configured outbound mail provider",
    resultSchema: {
      kind: "text",
      description: "Text summary of the email send or pending confirmation request.",
    },
    outputPersistencePolicy: "conversation",
  });
}
