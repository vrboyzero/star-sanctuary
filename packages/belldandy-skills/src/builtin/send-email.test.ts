import { describe, expect, it } from "vitest";

import type { ToolContext } from "../types.js";
import { createSendEmailTool } from "./send-email.js";

function createContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    conversationId: "conv-email-1",
    workspaceRoot: "/tmp/workspace",
    roomContext: { environment: "local", clientId: "client-web-1" },
    policy: {
      allowedPaths: [],
      deniedPaths: [],
      allowedDomains: [],
      deniedDomains: [],
      maxTimeoutMs: 1000,
      maxResponseBytes: 1000,
    },
    ...overrides,
  };
}

describe("send_email", () => {
  it("creates a pending webchat confirmation request", async () => {
    const broadcasts: Array<{ event: string; payload: Record<string, unknown> }> = [];
    const pendingRequests: Array<Record<string, unknown>> = [];
    const tool = createSendEmailTool({
      providerRegistry: {
        async send() {
          throw new Error("should not send before confirmation");
        },
      },
      confirmationStore: {
        create(request) {
          pendingRequests.push(request);
          return {
            requestId: request.requestId,
            expiresAt: Date.now() + 60_000,
          };
        },
        cleanupExpired() {},
      },
      auditStore: {
        async append() {},
      },
      normalizeDraft(draft) {
        return {
          ok: true,
          value: {
            accountId: String(draft.accountId),
            providerId: String(draft.providerId),
            to: [{ address: "alice@example.com" }],
            cc: [],
            bcc: [],
            subject: "Status Update",
            text: "Hello",
            attachments: [
              {
                filename: "status.txt",
                filePath: "/tmp/status.txt",
              },
            ],
            threadId: "<thread-001@example.com>",
            replyToMessageId: "<reply-001@example.com>",
            metadata: {},
          },
        };
      },
      getRequireConfirmation: () => true,
      getDefaultAccountId: () => "default",
      getDefaultProviderId: () => "smtp",
    });

    const result = await tool.execute({
      to: ["alice@example.com"],
      subject: "Status Update",
      text: "Hello",
    }, createContext({
      broadcast: (event, payload) => broadcasts.push({ event, payload }),
    }));

    expect(result.success).toBe(true);
    expect(result.output).toContain("待确认");
    expect(pendingRequests).toHaveLength(1);
    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0].event).toBe("email_outbound.confirm.required");
    expect(broadcasts[0].payload.targetClientId).toBe("client-web-1");
    expect(broadcasts[0].payload.subject).toBe("Status Update");
    expect(broadcasts[0].payload.attachmentCount).toBe(1);
    expect(broadcasts[0].payload.threadId).toBe("<thread-001@example.com>");
    expect(broadcasts[0].payload.replyToMessageId).toBe("<reply-001@example.com>");
  });

  it("auto sends and records audit when confirmation is disabled", async () => {
    const audits: Array<Record<string, unknown>> = [];
    const sentDrafts: Array<Record<string, unknown>> = [];
    const resolvedReminders: Array<Record<string, unknown>> = [];
    const tool = createSendEmailTool({
      providerRegistry: {
        async send({ draft }) {
          sentDrafts.push(draft as unknown as Record<string, unknown>);
          return {
            ok: true as const,
            providerId: "smtp",
            draft,
            providerMessageId: "<msg-001@example.com>",
            providerThreadId: "<thread-001@example.com>",
          };
        },
      },
      confirmationStore: {
        create() {
          throw new Error("should not create pending confirmation");
        },
        cleanupExpired() {},
      },
      auditStore: {
        async append(record) {
          audits.push(record as Record<string, unknown>);
        },
      },
      reminderStore: {
        async resolveByThread(input) {
          resolvedReminders.push(input as Record<string, unknown>);
        },
      },
      normalizeDraft() {
        return {
          ok: true,
          value: {
            accountId: "default",
            providerId: "smtp",
            to: [{ address: "alice@example.com" }],
            cc: [],
            bcc: [],
            subject: "Hello",
            text: "World",
            attachments: [
              {
                filename: "hello.txt",
                contentBase64: "aGVsbG8=",
              },
            ],
            threadId: "<thread-001@example.com>",
            replyToMessageId: "<reply-001@example.com>",
            metadata: {},
          },
        };
      },
      getRequireConfirmation: () => false,
      getDefaultAccountId: () => "default",
      getDefaultProviderId: () => "smtp",
    });

    const result = await tool.execute({
      to: ["alice@example.com"],
      subject: "Hello",
      text: "World",
      attachments: [
        {
          filename: "hello.txt",
          contentBase64: "aGVsbG8=",
        },
      ],
      threadId: "<thread-001@example.com>",
      replyToMessageId: "<reply-001@example.com>",
    }, createContext());

    expect(result.success).toBe(true);
    expect(result.output).toContain("已通过 smtp 发送邮件");
    expect(result.output).toContain("Attachments: 1");
    expect(result.output).toContain("Thread: <thread-001@example.com>");
    expect(result.output).toContain("Reply-To Message ID: <reply-001@example.com>");
    expect(audits).toHaveLength(1);
    expect(audits[0].decision).toBe("auto_approved");
    expect(audits[0].delivery).toBe("sent");
    expect(audits[0].attachmentCount).toBe(1);
    expect(audits[0].threadId).toBe("<thread-001@example.com>");
    expect(audits[0].replyToMessageId).toBe("<reply-001@example.com>");
    expect(audits[0].providerThreadId).toBe("<thread-001@example.com>");
    expect(resolvedReminders).toEqual([
      {
        providerId: "smtp",
        accountId: "default",
        threadId: "<thread-001@example.com>",
        resolutionSource: "send_email.auto_send",
      },
    ]);
    expect(sentDrafts[0]?.attachments).toEqual([
      {
        filename: "hello.txt",
        contentBase64: "aGVsbG8=",
      },
    ]);
    expect(sentDrafts[0]?.threadId).toBe("<thread-001@example.com>");
    expect(sentDrafts[0]?.replyToMessageId).toBe("<reply-001@example.com>");
  });

  it("surfaces thread guidance when send_email is called inside an email thread conversation", async () => {
    const tool = createSendEmailTool({
      providerRegistry: {
        async send() {
          throw new Error("should not send before confirmation");
        },
      },
      confirmationStore: {
        create(request) {
          return {
            requestId: request.requestId,
            expiresAt: Date.now() + 60_000,
          };
        },
        cleanupExpired() {},
      },
      auditStore: {
        async append() {},
      },
      normalizeDraft() {
        return {
          ok: true,
          value: {
            accountId: "default",
            providerId: "smtp",
            to: [{ address: "alice@example.com" }],
            cc: [],
            bcc: [],
            subject: "Thread follow-up",
            text: "Hello again",
            attachments: [],
            metadata: {},
          },
        };
      },
      getRequireConfirmation: () => true,
      getDefaultAccountId: () => "default",
      getDefaultProviderId: () => "smtp",
    });

    const result = await tool.execute({
      to: ["alice@example.com"],
      subject: "Thread follow-up",
      text: "Hello again",
    }, createContext({
      conversationId: "channel=email:scope=per-account-thread:provider=imap:account=primary:thread=%3Cthread-001%40example.com%3E",
      broadcast() {},
    }));

    expect(result.success).toBe(true);
    expect(result.output).toContain("Current Email Thread: <thread-001@example.com>");
    expect(result.output).toContain("add threadId=<thread-001@example.com>");
    expect(result.output).toContain("no replyToMessageId was provided");
  });

  it("allows send_email from a webchat-opened email thread conversation even when roomContext is not local", async () => {
    const broadcasts: Array<{ event: string; payload: Record<string, unknown> }> = [];
    const tool = createSendEmailTool({
      providerRegistry: {
        async send() {
          throw new Error("should not send before confirmation");
        },
      },
      confirmationStore: {
        create(request) {
          return {
            requestId: request.requestId,
            expiresAt: Date.now() + 60_000,
          };
        },
        cleanupExpired() {},
      },
      auditStore: {
        async append() {},
      },
      normalizeDraft() {
        return {
          ok: true,
          value: {
            accountId: "default",
            providerId: "smtp",
            to: [{ address: "alice@example.com" }],
            cc: [],
            bcc: [],
            subject: "Reply from email thread",
            text: "Hello from opened thread",
            attachments: [],
            metadata: {},
          },
        };
      },
      getRequireConfirmation: () => true,
      getDefaultAccountId: () => "default",
      getDefaultProviderId: () => "smtp",
    });

    const result = await tool.execute({
      to: ["alice@example.com"],
      subject: "Reply from email thread",
      text: "Hello from opened thread",
    }, createContext({
      conversationId: "channel=email:scope=per-account-thread:provider=imap:account=default:thread=%3Cthread-002%40example.com%3E",
      roomContext: { environment: "channel", clientId: "client-web-2" } as ToolContext["roomContext"],
      broadcast: (event, payload) => broadcasts.push({ event, payload }),
    }));

    expect(result.success).toBe(true);
    expect(result.output).toContain("待确认");
    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0].event).toBe("email_outbound.confirm.required");
  });
});
