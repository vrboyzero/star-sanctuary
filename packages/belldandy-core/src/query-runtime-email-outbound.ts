import type { GatewayEventFrame, GatewayResFrame } from "@belldandy/protocol";

import type { EmailOutboundAuditStore } from "./email-outbound-audit-store.js";
import type { EmailOutboundConfirmationStore } from "./email-outbound-confirmation-store.js";
import type { EmailOutboundProviderRegistry } from "./email-outbound-provider-registry.js";
import type { EmailFollowUpReminderStore } from "./email-follow-up-reminder-store.js";
import { QueryRuntime, type QueryRuntimeObserver } from "./query-runtime.js";

type EmailOutboundQueryRuntimeMethod = "email_outbound.confirm";

export type QueryRuntimeEmailOutboundContext = {
  requestId: string;
  clientId?: string;
  confirmationStore?: EmailOutboundConfirmationStore;
  providerRegistry?: EmailOutboundProviderRegistry;
  auditStore?: EmailOutboundAuditStore;
  reminderStore?: EmailFollowUpReminderStore;
  emitEvent?: (frame: GatewayEventFrame) => void;
  runtimeObserver?: QueryRuntimeObserver<EmailOutboundQueryRuntimeMethod>;
};

function buildBodyPreview(text?: string, html?: string): string {
  const normalizedText = String(text ?? "").replace(/\s+/g, " ").trim();
  if (normalizedText) {
    return normalizedText.length <= 200 ? normalizedText : `${normalizedText.slice(0, 197)}...`;
  }
  const normalizedHtml = String(html ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
  return normalizedHtml.length <= 200 ? normalizedHtml : `${normalizedHtml.slice(0, 197)}...`;
}

function listAddresses(items: Array<{ address: string }> = []): string[] {
  return items.map((item) => item.address);
}

function getAttachmentCount(draft: { attachments?: unknown[] }): number {
  return Array.isArray(draft.attachments) ? draft.attachments.length : 0;
}

export async function handleEmailOutboundConfirmWithQueryRuntime(
  ctx: QueryRuntimeEmailOutboundContext,
  params: {
    requestId: string;
    decision: "approve" | "reject";
    conversationId?: string;
  },
): Promise<GatewayResFrame> {
  const runtime = new QueryRuntime({
    method: "email_outbound.confirm" as const,
    traceId: ctx.requestId,
    observer: ctx.runtimeObserver,
  });

  return runtime.run(async () => {
    if (!ctx.confirmationStore || !ctx.providerRegistry || !ctx.auditStore || !ctx.emitEvent) {
      return {
        type: "res",
        id: ctx.requestId,
        ok: false,
        error: { code: "unsupported", message: "当前服务未启用邮件发送确认处理。" },
      };
    }

    const pending = ctx.confirmationStore.get(params.requestId);
    if (!pending) {
      return {
        type: "res",
        id: ctx.requestId,
        ok: false,
        error: { code: "not_found", message: `未找到待确认的邮件发送请求: ${params.requestId}` },
      };
    }

    if (params.conversationId && pending.conversationId !== params.conversationId) {
      return {
        type: "res",
        id: ctx.requestId,
        ok: false,
        error: { code: "conversation_mismatch", message: "待确认请求不属于当前会话。" },
      };
    }

    if (params.decision === "reject") {
      ctx.confirmationStore.delete(pending.requestId);
      await ctx.auditStore.append({
        timestamp: Date.now(),
        requestId: pending.requestId,
        sourceConversationId: pending.conversationId,
        sourceChannel: "webchat",
        requestedByAgentId: pending.requestedByAgentId,
        providerId: pending.draft.providerId || "unknown",
        accountId: pending.draft.accountId,
        to: listAddresses(pending.draft.to),
        cc: listAddresses(pending.draft.cc),
        bcc: listAddresses(pending.draft.bcc),
        subject: pending.draft.subject,
        bodyPreview: buildBodyPreview(pending.draft.text, pending.draft.html),
        attachmentCount: getAttachmentCount(pending.draft),
        threadId: pending.draft.threadId,
        replyToMessageId: pending.draft.replyToMessageId,
        decision: "rejected",
        delivery: "rejected",
      });
      ctx.emitEvent({
        type: "event",
        event: "email_outbound.confirm.resolved",
        payload: {
          source: "webchat_ui",
          conversationId: pending.conversationId,
          requestId: pending.requestId,
          providerId: pending.draft.providerId || "unknown",
          decision: "rejected",
          delivery: "rejected",
          resolvedAt: Date.now(),
          targetClientId: ctx.clientId,
        },
      });
      return {
        type: "res",
        id: ctx.requestId,
        ok: true,
        payload: {
          conversationId: pending.conversationId,
          requestId: pending.requestId,
          providerId: pending.draft.providerId || "unknown",
          decision: "rejected",
        },
      };
    }

    const sent = await ctx.providerRegistry.send({
      draft: pending.draft,
      providerId: pending.draft.providerId,
      context: {
        conversationId: pending.conversationId,
        requestedByAgentId: pending.requestedByAgentId,
        traceId: pending.requestId,
      },
    });

    if (!sent.ok) {
      await ctx.auditStore.append({
        timestamp: Date.now(),
        requestId: pending.requestId,
        sourceConversationId: pending.conversationId,
        sourceChannel: "webchat",
        requestedByAgentId: pending.requestedByAgentId,
        providerId: sent.providerId || pending.draft.providerId || "unknown",
        accountId: pending.draft.accountId,
        to: listAddresses(pending.draft.to),
        cc: listAddresses(pending.draft.cc),
        bcc: listAddresses(pending.draft.bcc),
        subject: pending.draft.subject,
        bodyPreview: buildBodyPreview(pending.draft.text, pending.draft.html),
        attachmentCount: getAttachmentCount(pending.draft),
        threadId: pending.draft.threadId,
        replyToMessageId: pending.draft.replyToMessageId,
        decision: "confirmed",
        delivery: "failed",
        errorCode: sent.code,
        error: sent.message,
      });
      return {
        type: "res",
        id: ctx.requestId,
        ok: false,
        error: { code: sent.code, message: sent.message },
      };
    }

    ctx.confirmationStore.delete(pending.requestId);
    await ctx.auditStore.append({
      timestamp: Date.now(),
      requestId: pending.requestId,
      sourceConversationId: pending.conversationId,
      sourceChannel: "webchat",
      requestedByAgentId: pending.requestedByAgentId,
      providerId: sent.providerId,
      accountId: pending.draft.accountId,
      to: listAddresses(pending.draft.to),
      cc: listAddresses(pending.draft.cc),
      bcc: listAddresses(pending.draft.bcc),
      subject: pending.draft.subject,
      bodyPreview: buildBodyPreview(pending.draft.text, pending.draft.html),
      attachmentCount: getAttachmentCount(pending.draft),
      threadId: pending.draft.threadId,
      replyToMessageId: pending.draft.replyToMessageId,
      decision: "confirmed",
      delivery: "sent",
      ...(sent.providerMessageId ? { providerMessageId: sent.providerMessageId } : {}),
      ...(sent.providerThreadId ? { providerThreadId: sent.providerThreadId } : {}),
    });
    const resolvedThreadId = sent.providerThreadId || pending.draft.threadId;
    if (resolvedThreadId) {
      await ctx.reminderStore?.resolveByThread({
        providerId: sent.providerId,
        accountId: pending.draft.accountId,
        threadId: resolvedThreadId,
        resolutionSource: "email_outbound.confirm",
      });
    }
    ctx.emitEvent({
      type: "event",
      event: "email_outbound.confirm.resolved",
      payload: {
        source: "webchat_ui",
        conversationId: pending.conversationId,
        requestId: pending.requestId,
        providerId: sent.providerId,
        decision: "approved",
        delivery: "sent",
        providerMessageId: sent.providerMessageId,
        resolvedAt: Date.now(),
        targetClientId: ctx.clientId,
      },
    });
    return {
      type: "res",
      id: ctx.requestId,
      ok: true,
      payload: {
        conversationId: pending.conversationId,
        requestId: pending.requestId,
        providerId: sent.providerId,
        decision: "approved",
        providerMessageId: sent.providerMessageId,
      },
    };
  });
}
