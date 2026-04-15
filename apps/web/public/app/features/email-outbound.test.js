import { describe, expect, it, vi } from "vitest";

import { createEmailOutboundController } from "./email-outbound.js";

function createRefs() {
  const createEl = () => ({
    innerHTML: "",
    textContent: "",
    disabled: false,
    classList: {
      add() {},
      remove() {},
    },
    addEventListener() {},
  });
  return {
    emailOutboundConfirmModal: createEl(),
    emailOutboundConfirmPreviewEl: createEl(),
    emailOutboundConfirmTargetEl: createEl(),
    emailOutboundConfirmExpiryEl: createEl(),
    emailOutboundConfirmApproveBtn: createEl(),
    emailOutboundConfirmRejectBtn: createEl(),
  };
}

describe("email outbound controller", () => {
  it("shows thread guidance when the current conversation is an email thread but thread metadata is missing", () => {
    const refs = createRefs();
    const controller = createEmailOutboundController({
      refs,
      isConnected: () => true,
      sendReq: vi.fn(),
      makeId: () => "req-1",
      clientId: "client-web-1",
      escapeHtml: (value) => String(value),
      showNotice: vi.fn(),
      t: (_key, _params, fallback) => fallback ?? "",
    });

    controller.handleConfirmRequired({
      requestId: "email-confirm-1",
      conversationId: "channel=email:scope=per-account-thread:provider=imap:account=primary:thread=%3Cthread-001%40example.com%3E",
      providerId: "smtp",
      accountId: "default",
      to: ["alice@example.com"],
      subject: "Reply draft",
      bodyPreview: "hello",
      expiresAt: Date.now() + 30_000,
      targetClientId: "client-web-1",
    });

    expect(refs.emailOutboundConfirmTargetEl.innerHTML).toContain("当前邮件线程");
    expect(refs.emailOutboundConfirmTargetEl.innerHTML).toContain("send_email.threadId=<thread-001@example.com>");
  });

  it("shows explicit reply guidance when thread metadata matches the current email thread", () => {
    const refs = createRefs();
    const controller = createEmailOutboundController({
      refs,
      isConnected: () => true,
      sendReq: vi.fn(),
      makeId: () => "req-1",
      clientId: "client-web-1",
      escapeHtml: (value) => String(value),
      showNotice: vi.fn(),
      t: (_key, _params, fallback) => fallback ?? "",
    });

    controller.handleConfirmRequired({
      requestId: "email-confirm-2",
      conversationId: "channel=email:scope=per-account-thread:provider=imap:account=primary:thread=%3Cthread-001%40example.com%3E",
      providerId: "smtp",
      accountId: "default",
      to: ["alice@example.com"],
      subject: "Reply draft",
      bodyPreview: "hello",
      threadId: "<thread-001@example.com>",
      replyToMessageId: "<msg-010@example.com>",
      expiresAt: Date.now() + 30_000,
      targetClientId: "client-web-1",
    });

    expect(refs.emailOutboundConfirmTargetEl.innerHTML).toContain("这次草稿会继续当前邮件线程，并显式回复 <msg-010@example.com>");
  });
});
