import { describe, expect, it } from "vitest";

import { ExternalOutboundConfirmationStore } from "./external-outbound-confirmation-store.js";
import { handleExternalOutboundConfirmWithQueryRuntime } from "./query-runtime-external-outbound.js";

describe("query runtime external outbound confirm", () => {
  it("approves a pending request and emits resolved event", async () => {
    const confirmationStore = new ExternalOutboundConfirmationStore(60_000);
    confirmationStore.create({
      requestId: "REQ-1",
      conversationId: "conv-1",
      channel: "feishu",
      content: "hello",
      resolvedSessionKey: "channel=feishu:chat=chat-1",
      resolution: "latest_binding",
      targetChatId: "chat-1",
    });
    const events: Array<Record<string, unknown>> = [];
    const audits: Array<Record<string, unknown>> = [];

    const res = await handleExternalOutboundConfirmWithQueryRuntime({
      requestId: "req-runtime-1",
      clientId: "client-web-1",
      confirmationStore,
      senderRegistry: {
        async resolveTarget() {
          throw new Error("not used");
        },
        async sendResolvedText() {
          return {
            ok: true as const,
            channel: "feishu" as const,
            resolvedSessionKey: "channel=feishu:chat=chat-1",
          };
        },
      } as any,
      auditStore: {
        async append(record) {
          audits.push(record as Record<string, unknown>);
        },
        async listRecent() {
          return [];
        },
      },
      emitEvent(frame) {
        events.push(frame as Record<string, unknown>);
      },
    }, {
      requestId: "REQ-1",
      decision: "approve",
      conversationId: "conv-1",
    });

    expect(res.ok).toBe(true);
    expect(confirmationStore.get("REQ-1")).toBeUndefined();
    expect(audits).toHaveLength(1);
    expect(audits[0].delivery).toBe("sent");
    expect(events).toHaveLength(1);
    expect(events[0].event).toBe("external_outbound.confirm.resolved");
    expect((events[0].payload as Record<string, unknown>).decision).toBe("approved");
  });

  it("rejects a pending request without sending", async () => {
    const confirmationStore = new ExternalOutboundConfirmationStore(60_000);
    confirmationStore.create({
      requestId: "REQ-2",
      conversationId: "conv-2",
      channel: "qq",
      content: "hello",
      resolvedSessionKey: "channel=qq:chat=chat-2",
      resolution: "latest_binding",
      targetChatId: "chat-2",
    });
    const audits: Array<Record<string, unknown>> = [];

    const res = await handleExternalOutboundConfirmWithQueryRuntime({
      requestId: "req-runtime-2",
      confirmationStore,
      senderRegistry: {
        async resolveTarget() {
          throw new Error("not used");
        },
        async sendResolvedText() {
          throw new Error("should not send on reject");
        },
      } as any,
      auditStore: {
        async append(record) {
          audits.push(record as Record<string, unknown>);
        },
        async listRecent() {
          return [];
        },
      },
      emitEvent() {},
    }, {
      requestId: "REQ-2",
      decision: "reject",
      conversationId: "conv-2",
    });

    expect(res.ok).toBe(true);
    expect(audits).toHaveLength(1);
    expect(audits[0].decision).toBe("rejected");
    expect(audits[0].delivery).toBe("rejected");
    expect(confirmationStore.get("REQ-2")).toBeUndefined();
  });

  it("records send error code when approval send fails", async () => {
    const confirmationStore = new ExternalOutboundConfirmationStore(60_000);
    confirmationStore.create({
      requestId: "REQ-3",
      conversationId: "conv-3",
      channel: "discord",
      content: "hello",
      resolvedSessionKey: "channel=discord:chat=room-3",
      resolution: "latest_binding",
      targetChatId: "room-3",
    });
    const audits: Array<Record<string, unknown>> = [];

    const res = await handleExternalOutboundConfirmWithQueryRuntime({
      requestId: "req-runtime-3",
      confirmationStore,
      senderRegistry: {
        async resolveTarget() {
          throw new Error("not used");
        },
        async sendResolvedText() {
          return {
            ok: false as const,
            channel: "discord" as const,
            code: "send_failed" as const,
            message: "discord send failed",
          };
        },
      } as any,
      auditStore: {
        async append(record) {
          audits.push(record as Record<string, unknown>);
        },
        async listRecent() {
          return [];
        },
      },
      emitEvent() {},
    }, {
      requestId: "REQ-3",
      decision: "approve",
      conversationId: "conv-3",
    });

    expect(res.ok).toBe(false);
    expect(audits).toHaveLength(1);
    expect(audits[0].delivery).toBe("failed");
    expect(audits[0].errorCode).toBe("send_failed");
  });
});
