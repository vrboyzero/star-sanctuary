import { describe, expect, it } from "vitest";

import { normalizeEmailOutboundDraft } from "./email-outbound-contract.js";
import { EmailOutboundProviderRegistry } from "./email-outbound-provider-registry.js";

describe("normalizeEmailOutboundDraft", () => {
  it("normalizes recipients, attachments, and metadata", () => {
    const result = normalizeEmailOutboundDraft({
      accountId: " primary-account ",
      providerId: " smtp ",
      to: [
        { address: " alice@example.com ", name: " Alice " },
        { address: "ALICE@example.com" },
      ],
      cc: [{ address: " bob@example.com " }],
      bcc: [],
      subject: "  Project Update  ",
      text: "  Hello  ",
      attachments: [
        {
          filename: " report.pdf ",
          filePath: " E:\\tmp\\report.pdf ",
          contentType: " application/pdf ",
          sizeBytes: 12.7,
        },
      ],
      metadata: {
        " x-trace-id ": " trace-001 ",
        empty: "   ",
      },
    });

    expect(result).toEqual({
      ok: true,
      value: {
        accountId: "primary-account",
        providerId: "smtp",
        to: [{ address: "alice@example.com", name: "Alice" }],
        cc: [{ address: "bob@example.com" }],
        bcc: [],
        subject: "Project Update",
        text: "Hello",
        attachments: [
          {
            filename: "report.pdf",
            filePath: "E:\\tmp\\report.pdf",
            contentType: "application/pdf",
            sizeBytes: 12,
          },
        ],
        metadata: {
          "x-trace-id": "trace-001",
        },
      },
    });
  });

  it("rejects drafts without recipients or body", () => {
    const result = normalizeEmailOutboundDraft({
      accountId: "primary-account",
      to: [],
      subject: "No body",
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error("expected invalid draft");
    }
    expect(result.issues).toEqual([
      "at least one recipient is required",
      "text or html is required",
    ]);
  });
});

describe("EmailOutboundProviderRegistry", () => {
  it("uses the default provider when no providerId is specified", async () => {
    const registry = new EmailOutboundProviderRegistry();
    registry.register({
      providerId: "smtp",
      async send({ draft }) {
        return {
          ok: true,
          providerId: "smtp",
          providerMessageId: `${draft.accountId}:msg-001`,
        };
      },
    });

    const result = await registry.send({
      draft: {
        accountId: "primary-account",
        to: [{ address: "alice@example.com" }],
        subject: "Hello",
        text: "World",
      },
    });

    expect(result).toEqual({
      ok: true,
      providerId: "smtp",
      providerMessageId: "primary-account:msg-001",
      draft: {
        accountId: "primary-account",
        to: [{ address: "alice@example.com" }],
        cc: [],
        bcc: [],
        subject: "Hello",
        text: "World",
        attachments: [],
        metadata: {},
      },
    });
  });

  it("returns provider_unavailable when the requested provider is missing", async () => {
    const registry = new EmailOutboundProviderRegistry();

    const result = await registry.send({
      providerId: "smtp",
      draft: {
        accountId: "primary-account",
        to: [{ address: "alice@example.com" }],
        text: "Hello",
      },
    });

    expect(result).toEqual({
      ok: false,
      providerId: "smtp",
      code: "provider_unavailable",
      message: "Email outbound provider is not registered: smtp",
      draft: {
        accountId: "primary-account",
        to: [{ address: "alice@example.com" }],
        cc: [],
        bcc: [],
        subject: "",
        text: "Hello",
        attachments: [],
        metadata: {},
      },
    });
  });

  it("returns provider send failures without losing the normalized draft", async () => {
    const registry = new EmailOutboundProviderRegistry();
    registry.register({
      providerId: "smtp",
      async send() {
        return {
          ok: false,
          providerId: "smtp",
          code: "send_failed",
          message: "SMTP 535 authentication failed",
          retryable: false,
        };
      },
    });

    const result = await registry.send({
      draft: {
        accountId: "primary-account",
        to: [{ address: "alice@example.com" }],
        html: "<p>Hello</p>",
      },
    });

    expect(result).toEqual({
      ok: false,
      providerId: "smtp",
      code: "send_failed",
      message: "SMTP 535 authentication failed",
      draft: {
        accountId: "primary-account",
        to: [{ address: "alice@example.com" }],
        cc: [],
        bcc: [],
        subject: "",
        html: "<p>Hello</p>",
        attachments: [],
        metadata: {},
      },
    });
  });
});
