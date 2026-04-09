import { describe, expect, it } from "vitest";

import type { ToolContext } from "../types.js";
import { createSendChannelMessageTool } from "./send-channel-message.js";

function createContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    conversationId: "conv-1",
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

describe("send_channel_message", () => {
  it("creates a pending webchat confirmation request", async () => {
    const broadcasts: Array<{ event: string; payload: Record<string, unknown> }> = [];
    const pendingRequests: Array<Record<string, unknown>> = [];
    const tool = createSendChannelMessageTool({
      senderRegistry: {
        async resolveTarget() {
          return {
            ok: true as const,
            channel: "feishu" as const,
            resolution: "latest_binding" as const,
            resolvedSessionKey: "channel=feishu:chat=chat-1",
            targetChatId: "chat-1",
          };
        },
        async sendResolvedText() {
          return {
            ok: true as const,
            channel: "feishu" as const,
            resolvedSessionKey: "channel=feishu:chat=chat-1",
          };
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
      getRequireConfirmation: () => true,
    });

    const result = await tool.execute({
      channel: "feishu",
      content: "请在飞书里提醒我开会。",
    }, createContext({
      broadcast: (event, payload) => broadcasts.push({ event, payload }),
    }));

    expect(result.success).toBe(true);
    expect(result.output).toContain("待确认");
    expect(pendingRequests).toHaveLength(1);
    expect(broadcasts).toHaveLength(1);
    expect(broadcasts[0].event).toBe("external_outbound.confirm.required");
    expect(broadcasts[0].payload.targetClientId).toBe("client-web-1");
    expect(broadcasts[0].payload.targetSessionKey).toBe("channel=feishu:chat=chat-1");
  });

  it("auto sends and records audit when confirmation is disabled", async () => {
    const audits: Array<Record<string, unknown>> = [];
    const tool = createSendChannelMessageTool({
      senderRegistry: {
        async resolveTarget() {
          return {
            ok: true as const,
            channel: "discord" as const,
            resolution: "explicit_session_key" as const,
            resolvedSessionKey: "channel=discord:chat=room-1",
            targetChatId: "room-1",
          };
        },
        async sendResolvedText() {
          return {
            ok: true as const,
            channel: "discord" as const,
            resolvedSessionKey: "channel=discord:chat=room-1",
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
      getRequireConfirmation: () => false,
    });

    const result = await tool.execute({
      channel: "discord",
      sessionKey: "channel=discord:chat=room-1",
      content: "这是直接发送。",
    }, createContext());

    expect(result.success).toBe(true);
    expect(result.output).toContain("已向 discord 发送文本消息");
    expect(audits).toHaveLength(1);
    expect(audits[0].decision).toBe("auto_approved");
    expect(audits[0].delivery).toBe("sent");
  });

  it("returns standardized error code text and stores audit error code on send failure", async () => {
    const audits: Array<Record<string, unknown>> = [];
    const tool = createSendChannelMessageTool({
      senderRegistry: {
        async resolveTarget() {
          return {
            ok: true as const,
            channel: "community" as const,
            resolution: "latest_binding" as const,
            resolvedSessionKey: "channel=community:chat=room-1",
            targetChatId: "room-1",
          };
        },
        async sendResolvedText() {
          return {
            ok: false as const,
            channel: "community" as const,
            code: "send_failed",
            message: "community send failed",
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
      getRequireConfirmation: () => false,
    });

    const result = await tool.execute({
      channel: "community",
      content: "直接发送失败。",
    }, createContext());

    expect(result.success).toBe(false);
    expect(result.error).toBe("[send_failed] community send failed");
    expect(audits).toHaveLength(1);
    expect(audits[0].errorCode).toBe("send_failed");
  });

  it("records audit when target resolution fails before sending", async () => {
    const audits: Array<Record<string, unknown>> = [];
    const tool = createSendChannelMessageTool({
      senderRegistry: {
        async resolveTarget() {
          return {
            ok: false as const,
            code: "binding_not_found",
            message: "当前没有可用于 qq 的最新会话绑定，请先在目标渠道产生一条会话。",
          };
        },
        async sendResolvedText() {
          throw new Error("should not send when resolution fails");
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
      getRequireConfirmation: () => false,
    });

    const result = await tool.execute({
      channel: "qq",
      content: "目标还没绑定。",
    }, createContext());

    expect(result.success).toBe(false);
    expect(result.error).toBe("[binding_not_found] 当前没有可用于 qq 的最新会话绑定，请先在目标渠道产生一条会话。");
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({
      targetChannel: "qq",
      resolution: "latest_binding",
      delivery: "failed",
      errorCode: "binding_not_found",
    });
    expect(audits[0].targetSessionKey).toBeUndefined();
  });
});
