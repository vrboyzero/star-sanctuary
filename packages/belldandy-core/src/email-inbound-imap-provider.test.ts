import { describe, expect, it } from "vitest";

import { ImapPollingEmailInboundProvider } from "./email-inbound-imap-provider.js";

describe("ImapPollingEmailInboundProvider", () => {
  it("normalizes a polled IMAP message into the unified inbound event shape", () => {
    const provider = new ImapPollingEmailInboundProvider({
      accountId: "primary",
    });

    const result = provider.normalizeInboundEvent({
      accountId: "",
      raw: {
        uid: 42,
        messageId: " <msg-002@example.com> ",
        subject: " Re: Project Update ",
        from: [{ address: " alice@example.com ", name: " Alice " }],
        to: [{ address: " team@example.com " }],
        textBody: "  Here is the latest status.  ",
        receivedAt: "2026-04-15T03:15:00.000Z",
        references: [" <thread-root@example.com> "],
        inReplyToMessageId: " <reply-001@example.com> ",
        mailbox: " INBOX ",
        flags: [" seen ", " flagged "],
        attachments: [
          {
            filename: " status.txt ",
            contentType: " text/plain ",
            sizeBytes: 99.4,
          },
        ],
        headers: {
          " message-id ": " <msg-002@example.com> ",
        },
      },
    });

    expect(result).toEqual({
      ok: true,
      value: {
        providerId: "imap",
        accountId: "primary",
        messageId: "<msg-002@example.com>",
        threadId: "<thread-root@example.com>",
        receivedAt: Date.parse("2026-04-15T03:15:00.000Z"),
        subject: "Re: Project Update",
        from: [{ address: "alice@example.com", name: "Alice" }],
        to: [{ address: "team@example.com" }],
        cc: [],
        bcc: [],
        replyTo: [],
        textBody: "Here is the latest status.",
        attachments: [
          {
            filename: "status.txt",
            contentType: "text/plain",
            sizeBytes: 99,
          },
        ],
        references: ["<thread-root@example.com>", "<reply-001@example.com>"],
        inReplyToMessageId: "<reply-001@example.com>",
        headers: {
          "message-id": "<msg-002@example.com>",
        },
        metadata: {
          imapUid: "42",
          mailbox: "INBOX",
          flags: "seen,flagged",
        },
        security: {
          sourceTrust: "external_untrusted",
          sanitationRequired: true,
          externalLabels: ["seen", "flagged"],
        },
      },
    });
  });

  it("falls back threadId to messageId when references are absent", () => {
    const provider = new ImapPollingEmailInboundProvider({
      accountId: "primary",
    });

    const result = provider.normalizeInboundEvent({
      accountId: "",
      raw: {
        messageId: "<msg-standalone@example.com>",
        from: [{ address: "alice@example.com" }],
        snippet: "Standalone message",
        receivedAt: "2026-04-15T03:15:00.000Z",
      },
    });

    expect(result).toEqual(expect.objectContaining({
      ok: true,
      value: expect.objectContaining({
        threadId: "<msg-standalone@example.com>",
      }),
    }));
  });
});
