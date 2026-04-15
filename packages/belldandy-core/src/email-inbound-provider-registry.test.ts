import { describe, expect, it } from "vitest";

import { EmailInboundProviderRegistry } from "./email-inbound-provider-registry.js";

describe("EmailInboundProviderRegistry", () => {
  it("uses the default provider when no providerId is specified", async () => {
    const registry = new EmailInboundProviderRegistry();
    registry.register({
      providerId: "imap",
      normalizeInboundEvent({ accountId }) {
        return {
          ok: true,
          value: {
            providerId: "imap",
            accountId,
            messageId: "<msg-001@example.com>",
            threadId: "<thread-001@example.com>",
            receivedAt: 1713140000000,
            subject: "Hello",
            from: [{ address: "alice@example.com" }],
            to: [],
            cc: [],
            bcc: [],
            replyTo: [],
            snippet: "Hello",
            attachments: [],
            references: [],
            headers: {},
            metadata: {},
            security: {
              sourceTrust: "external_untrusted",
              sanitationRequired: true,
              externalLabels: [],
            },
          },
        };
      },
    });

    const result = await registry.normalizeInboundEvent({
      accountId: "primary",
      raw: { any: "value" },
    });

    expect(result).toEqual({
      ok: true,
      value: {
        providerId: "imap",
        accountId: "primary",
        messageId: "<msg-001@example.com>",
        threadId: "<thread-001@example.com>",
        receivedAt: 1713140000000,
        subject: "Hello",
        from: [{ address: "alice@example.com" }],
        to: [],
        cc: [],
        bcc: [],
        replyTo: [],
        snippet: "Hello",
        attachments: [],
        references: [],
        headers: {},
        metadata: {},
        security: {
          sourceTrust: "external_untrusted",
          sanitationRequired: true,
          externalLabels: [],
        },
      },
    });
  });

  it("returns provider_unavailable when the requested provider is missing", async () => {
    const registry = new EmailInboundProviderRegistry();

    const result = await registry.normalizeInboundEvent({
      providerId: "imap",
      accountId: "primary",
      raw: {},
    });

    expect(result).toEqual({
      ok: false,
      providerId: "imap",
      code: "provider_unavailable",
      message: "Email inbound provider is not registered: imap",
    });
  });

  it("surfaces provider validation failures", async () => {
    const registry = new EmailInboundProviderRegistry();
    registry.register({
      providerId: "imap",
      normalizeInboundEvent() {
        return {
          ok: false,
          code: "invalid_event",
          message: "messageId is required",
          issues: ["messageId is required"],
        };
      },
    });

    const result = await registry.normalizeInboundEvent({
      accountId: "primary",
      raw: {},
    });

    expect(result).toEqual({
      ok: false,
      providerId: "imap",
      code: "invalid_event",
      message: "messageId is required",
      issues: ["messageId is required"],
    });
  });
});
