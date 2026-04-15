import { describe, expect, it, vi } from "vitest";

import {
  buildEmailInboundSessionBanner,
  createEmailInboundSessionBannerFeature,
  parseEmailThreadConversationId,
  selectLatestEmailInboundAuditForConversation,
} from "./email-inbound-session-banner.js";

describe("email inbound session banner", () => {
  it("parses email thread conversation ids", () => {
    expect(parseEmailThreadConversationId("channel=email:scope=per-account-thread:provider=imap:account=primary:thread=%3Cthread-001%40example.com%3E")).toEqual({
      providerId: "imap",
      accountId: "primary",
      threadId: "<thread-001@example.com>",
      sessionKey: "channel=email:scope=per-account-thread:provider=imap:account=primary:thread=%3Cthread-001%40example.com%3E",
      conversationId: "channel=email:scope=per-account-thread:provider=imap:account=primary:thread=%3Cthread-001%40example.com%3E",
    });
    expect(parseEmailThreadConversationId("conv-plain-1")).toBeNull();
  });

  it("selects the latest matching audit item for a conversation", () => {
    const conversationId = "channel=email:scope=per-account-thread:provider=imap:account=primary:thread=%3Cthread-001%40example.com%3E";
    const items = [
      {
        conversationId,
        providerId: "imap",
        accountId: "primary",
        threadId: "<thread-001@example.com>",
        messageId: "<msg-002@example.com>",
      },
      {
        providerId: "imap",
        accountId: "primary",
        threadId: "<thread-001@example.com>",
        messageId: "<msg-001@example.com>",
      },
    ];
    expect(selectLatestEmailInboundAuditForConversation(items, conversationId)).toEqual(items[0]);
  });

  it("builds a banner with reply guidance from the latest inbound audit", () => {
    const banner = buildEmailInboundSessionBanner({
      conversationId: "channel=email:scope=per-account-thread:provider=imap:account=primary:thread=%3Cthread-001%40example.com%3E",
      auditItem: {
        status: "processed",
        providerId: "imap",
        accountId: "primary",
        threadId: "<thread-001@example.com>",
        subject: "Project Update",
        messageId: "<msg-010@example.com>",
        inReplyToMessageId: "<msg-009@example.com>",
        references: ["<msg-009@example.com>"],
        triageSummary: "reply required · high · reply · follow up in 24h",
        triageFollowUpWindowHours: 24,
        suggestedReplyQuality: "review_required",
        suggestedReplyConfidence: "medium",
        suggestedReplyStarter: "Hi Alice,\n\nThanks for your email.",
        suggestedReplyWarnings: ["发送前先核对日期、时间和时区。"],
      },
    });
    expect(banner).toContain("最近一封来信已经触发了一轮自动处理");
    expect(banner).toContain("Provider: imap · Account: primary · 线程: <thread-001@example.com>");
    expect(banner).toContain("整理建议: reply required · high · reply · follow up in 24h");
    expect(banner).toContain("回复建议质量: review_required · medium");
    expect(banner).toContain("回复建议注意: 发送前先核对日期、时间和时区。");
    expect(banner).toContain("线程语义: 回复既有线程");
    expect(banner).toContain("send_email.threadId=<thread-001@example.com>");
    expect(banner).toContain("send_email.replyToMessageId=<msg-010@example.com>");
    expect(banner).not.toContain("最近来信 Message-ID");
    expect(banner).not.toContain("建议回复 starter");
  });

  it("falls back to parsed thread info when no audit item is available", () => {
    const banner = buildEmailInboundSessionBanner({
      conversationId: "channel=email:scope=per-account-thread:provider=imap:account=primary:thread=%3Cthread-001%40example.com%3E",
    });
    expect(banner).toContain("当前会话绑定到一条外部邮件线程");
    expect(banner).toContain("Provider: imap");
    expect(banner).toContain("send_email.threadId=<thread-001@example.com>");
    expect(banner).not.toContain("replyToMessageId=");
  });

  it("loads banner text through a proper websocket req frame", async () => {
    const sendReq = vi.fn(async () => ({
      ok: true,
      payload: {
        items: [
          {
            conversationId: "channel=email:scope=per-account-thread:provider=imap:account=primary:thread=%3Cthread-001%40example.com%3E",
            providerId: "imap",
            accountId: "primary",
            threadId: "<thread-001@example.com>",
            messageId: "<msg-010@example.com>",
            status: "processed",
          },
        ],
      },
    }));
    const feature = createEmailInboundSessionBannerFeature({
      sendReq,
      t: (_key, _params, fallback) => fallback || "",
    });

    const banner = await feature.loadBannerText("channel=email:scope=per-account-thread:provider=imap:account=primary:thread=%3Cthread-001%40example.com%3E");

    expect(sendReq).toHaveBeenCalledWith(expect.objectContaining({
      type: "req",
      method: "email_inbound.audit.list",
      params: { limit: 50 },
    }));
    expect(banner).toContain("send_email.threadId=<thread-001@example.com>");
  });
});
