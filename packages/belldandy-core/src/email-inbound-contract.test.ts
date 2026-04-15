import { describe, expect, it } from "vitest";

import { normalizeEmailInboundEvent } from "./email-inbound-contract.js";

describe("normalizeEmailInboundEvent", () => {
  it("normalizes inbound addresses, thread fallback, and security envelope", () => {
    const result = normalizeEmailInboundEvent({
      providerId: " imap ",
      accountId: " primary ",
      messageId: " <msg-001@example.com> ",
      receivedAt: "2026-04-15T03:10:00.000Z",
      subject: "  Project Update  ",
      from: [
        { address: " alice@example.com ", name: " Alice " },
        { address: "ALICE@example.com" },
      ],
      to: [{ address: " bob@example.com " }],
      snippet: "  Please review the latest patch.  ",
      references: [" <thread-root@example.com> ", " <thread-root@example.com> "],
      attachments: [
        {
          filename: " report.pdf ",
          contentType: " application/pdf ",
          sizeBytes: 12.8,
        },
      ],
      metadata: {
        " x-mailbox ": " inbox ",
        empty: "   ",
      },
      security: {
        externalLabels: [" unseen ", " flagged ", " unseen "],
      },
    });

    expect(result).toEqual({
      ok: true,
      value: {
        providerId: "imap",
        accountId: "primary",
        messageId: "<msg-001@example.com>",
        threadId: "<thread-root@example.com>",
        receivedAt: Date.parse("2026-04-15T03:10:00.000Z"),
        subject: "Project Update",
        from: [{ address: "alice@example.com", name: "Alice" }],
        to: [{ address: "bob@example.com" }],
        cc: [],
        bcc: [],
        replyTo: [],
        snippet: "Please review the latest patch.",
        attachments: [
          {
            filename: "report.pdf",
            contentType: "application/pdf",
            sizeBytes: 12,
          },
        ],
        references: ["<thread-root@example.com>"],
        headers: {},
        metadata: {
          "x-mailbox": "inbox",
        },
        security: {
          sourceTrust: "external_untrusted",
          sanitationRequired: true,
          externalLabels: ["unseen", "flagged"],
        },
      },
    });
  });

  it("rejects events without sender or content", () => {
    const result = normalizeEmailInboundEvent({
      providerId: "imap",
      accountId: "primary",
      messageId: "<msg-001@example.com>",
      receivedAt: "2026-04-15T03:10:00.000Z",
      from: [],
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected invalid inbound event");
    }
    expect(result.issues).toEqual([
      "at least one sender is required",
      "snippet, textBody, or htmlBody is required",
    ]);
  });
});
