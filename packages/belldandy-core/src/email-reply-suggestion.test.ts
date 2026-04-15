import { describe, expect, it } from "vitest";

import { buildEmailReplySuggestion } from "./email-reply-suggestion.js";

describe("email reply suggestion", () => {
  it("builds a cautious/reviewable reply suggestion for simple reply mail", () => {
    const suggestion = buildEmailReplySuggestion({
      event: {
        providerId: "imap",
        accountId: "primary",
        messageId: "<msg-001@example.com>",
        threadId: "<thread-001@example.com>",
        receivedAt: Date.now(),
        subject: "Project update",
        from: [{ address: "alice@example.com", name: "Alice" }],
        to: [{ address: "team@example.com" }],
        cc: [],
        bcc: [],
        replyTo: [],
        snippet: "Can you send the latest status?",
        attachments: [],
        references: ["<msg-000@example.com>"],
        headers: {},
        metadata: {},
        security: {
          sourceTrust: "external_untrusted",
          sanitationRequired: true,
          externalLabels: [],
        },
      },
      category: "reply_required",
      disposition: "reply",
      followUpWindowHours: 48,
      needsReply: true,
    });

    expect(suggestion).toMatchObject({
      subject: "Re: Project update",
      quality: "cautious",
      confidence: "high",
    });
    expect(suggestion?.draftText).toContain("Hi Alice,");
    expect(suggestion?.checklist).toContain("确认是否已经逐条回应邮件中的明确问题或请求。");
  });

  it("raises review_required when the mail references money/legal details and attachments", () => {
    const suggestion = buildEmailReplySuggestion({
      event: {
        providerId: "imap",
        accountId: "primary",
        messageId: "<msg-002@example.com>",
        threadId: "<thread-002@example.com>",
        receivedAt: Date.now(),
        subject: "Urgent contract review for tomorrow",
        from: [{ address: "legal@example.com", name: "Legal" }],
        to: [{ address: "team@example.com" }],
        cc: [],
        bcc: [],
        replyTo: [],
        textBody: "Please review the contract and confirm the payment amount by tomorrow 10:00. See attached draft.",
        attachments: [{ filename: "contract.pdf", contentType: "application/pdf" }],
        references: [],
        headers: {},
        metadata: {},
        security: {
          sourceTrust: "external_untrusted",
          sanitationRequired: true,
          externalLabels: [],
        },
      },
      category: "reply_required",
      disposition: "reply",
      followUpWindowHours: 24,
      needsReply: true,
    });

    expect(suggestion).toMatchObject({
      quality: "review_required",
      confidence: "medium",
    });
    expect(suggestion?.warnings).toEqual(expect.arrayContaining([
      "发送前先核对金额、合同或其他商业条款。",
      "发送前先核对日期、时间和时区。",
      "发送前确认是否需要补附件或引用附件内容。",
    ]));
  });
});
