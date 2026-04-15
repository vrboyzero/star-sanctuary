import { describe, expect, it } from "vitest";

import { buildEmailInboundTriage } from "./email-inbound-triage.js";

describe("email inbound triage", () => {
  it("marks urgent action mail as high-priority reply/action work", () => {
    const triage = buildEmailInboundTriage({
      providerId: "imap",
      accountId: "primary",
      messageId: "<msg-001@example.com>",
      threadId: "<thread-001@example.com>",
      receivedAt: Date.now(),
      subject: "Urgent: please review contract today",
      from: [{ address: "alice@example.com", name: "Alice" }],
      to: [{ address: "team@example.com" }],
      cc: [],
      bcc: [],
      replyTo: [],
      snippet: "Can you review and confirm today?",
      attachments: [],
      references: [],
      headers: {},
      metadata: {},
      security: {
        sourceTrust: "external_untrusted",
        sanitationRequired: true,
        externalLabels: [],
      },
    });
    expect(triage.category).toBe("reply_required");
    expect(triage.priority).toBe("high");
    expect(triage.disposition).toBe("reply");
    expect(triage.needsFollowUp).toBe(true);
    expect(triage.followUpWindowHours).toBe(24);
    expect(triage.suggestedReplyStarter).toContain("Hi Alice");
    expect(triage.suggestedReplySubject).toBe("Re: Urgent: please review contract today");
    expect(triage.suggestedReplyDraft).toContain("Before I send a final answer");
    expect(triage.suggestedReplyQuality).toBe("review_required");
    expect(triage.suggestedReplyWarnings.length).toBeGreaterThan(0);
  });

  it("marks notification traffic as low priority informational mail", () => {
    const triage = buildEmailInboundTriage({
      providerId: "imap",
      accountId: "primary",
      messageId: "<msg-002@example.com>",
      threadId: "<thread-002@example.com>",
      receivedAt: Date.now(),
      subject: "Weekly Digest Notification",
      from: [{ address: "noreply@example.com" }],
      to: [{ address: "team@example.com" }],
      cc: [],
      bcc: [],
      replyTo: [],
      snippet: "This is your weekly digest.",
      attachments: [],
      references: [],
      headers: {},
      metadata: {},
      security: {
        sourceTrust: "external_untrusted",
        sanitationRequired: true,
        externalLabels: [],
      },
    });
    expect(triage.category).toBe("low_priority");
    expect(triage.priority).toBe("low");
    expect(triage.disposition).toBe("ignore");
    expect(triage.suggestedReplyStarter).toBeUndefined();
    expect(triage.suggestedReplyDraft).toBeUndefined();
    expect(triage.suggestedReplyWarnings).toEqual([]);
  });
});
