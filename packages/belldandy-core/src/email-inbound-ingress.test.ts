import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ConversationStore, type AgentRunInput, type AgentStreamItem, type BelldandyAgent } from "@belldandy/agent";

import { ingestEmailInboundEvent } from "./email-inbound-ingress.js";
import {
  createFileEmailThreadBindingStore,
  resolveEmailThreadBindingStorePath,
} from "./email-thread-binding-store.js";

const tempDirs: string[] = [];

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => fs.rm(dir, { recursive: true, force: true }).catch(() => {})));
});

class EchoAgent implements BelldandyAgent {
  async *run(input: AgentRunInput): AsyncIterable<AgentStreamItem> {
    yield { type: "status", status: "running" };
    yield { type: "final", text: `echo:${input.text.slice(0, 24)}` };
    yield { type: "status", status: "done" };
  }
}

describe("ingestEmailInboundEvent", () => {
  it("creates a thread-bound conversation and reuses it for the same thread", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-email-ingress-"));
    tempDirs.push(stateDir);
    const conversationStore = new ConversationStore();
    const threadBindingStore = createFileEmailThreadBindingStore(resolveEmailThreadBindingStorePath(stateDir));
    const frames: any[] = [];

    const first = await ingestEmailInboundEvent({
      agentFactory: () => new EchoAgent(),
      conversationStore,
      threadBindingStore,
      log: {
        info() {},
        warn() {},
        error() {},
      },
      broadcastEvent(frame) {
        frames.push(frame);
      },
    }, {
      event: {
        providerId: "imap",
        accountId: "primary",
        messageId: "<msg-001@example.com>",
        threadId: "<thread-001@example.com>",
        receivedAt: Date.parse("2026-04-15T03:20:00.000Z"),
        subject: "Project Update",
        from: [{ address: "alice@example.com", name: "Alice" }],
        to: [{ address: "team@example.com" }],
        cc: [],
        bcc: [],
        replyTo: [],
        snippet: "Please review the latest patch.",
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
      requestedAgentId: "default",
    });

    const second = await ingestEmailInboundEvent({
      agentFactory: () => new EchoAgent(),
      conversationStore,
      threadBindingStore,
      log: {
        info() {},
        warn() {},
        error() {},
      },
    }, {
      event: {
        providerId: "imap",
        accountId: "primary",
        messageId: "<msg-002@example.com>",
        threadId: "<thread-001@example.com>",
        receivedAt: Date.parse("2026-04-15T03:22:00.000Z"),
        subject: "Re: Project Update",
        from: [{ address: "alice@example.com", name: "Alice" }],
        to: [{ address: "team@example.com" }],
        cc: [],
        bcc: [],
        replyTo: [],
        textBody: "Here is a follow-up.",
        attachments: [],
        references: ["<thread-001@example.com>"],
        headers: {},
        metadata: {},
        security: {
          sourceTrust: "external_untrusted",
          sanitationRequired: true,
          externalLabels: [],
        },
      },
      requestedAgentId: "default",
    });

    expect(first.createdBinding).toBe(true);
    expect(second.createdBinding).toBe(false);
    expect(second.conversationId).toBe(first.conversationId);
    const history = conversationStore.get(first.conversationId);
    expect(history?.channel).toBe("email");
    expect(history?.messages).toHaveLength(4);
    expect(history?.messages[0]?.role).toBe("user");
    expect(history?.messages[1]?.role).toBe("assistant");
    expect(history?.messages[2]?.role).toBe("user");
    expect(history?.messages[3]?.role).toBe("assistant");
    expect(history?.messages[0]?.content).toContain("[Inbound Email Context]");
    expect(history?.messages[0]?.content).toContain("Thread State: new_thread");
    expect(history?.messages[0]?.content).toContain("Reply Semantics: new_thread");
    expect(history?.messages[0]?.content).toContain("[Inbound Email Triage]");
    expect(history?.messages[0]?.content).toContain("Triage Category:");
    expect(history?.messages[2]?.content).toContain("Thread State: existing_thread");
    expect(history?.messages[2]?.content).toContain("Reply Semantics: reply_to_thread");
    expect(history?.messages[2]?.content).toContain("Suggested send_email.threadId: <thread-001@example.com>");
    expect(history?.messages[2]?.content).toContain("Suggested Reply Quality:");
    expect(history?.messages[2]?.content).toContain("Reply Review Checklist:");
    expect(history?.messages[2]?.content).not.toContain("Suggested Reply Starter:");
    expect(history?.messages[2]?.content).not.toContain("Suggested Reply Draft:");
    await expect(threadBindingStore.getByThread({
      providerId: "imap",
      accountId: "primary",
      threadId: "<thread-001@example.com>",
    })).resolves.toEqual(expect.objectContaining({
      conversationId: first.conversationId,
      lastMessageId: "<msg-002@example.com>",
      lastSubject: "Re: Project Update",
    }));
    expect(frames.some((frame) => frame.type === "event" && frame.event === "chat.final")).toBe(true);
  });
});
