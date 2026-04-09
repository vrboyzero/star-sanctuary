import { describe, expect, it, vi } from "vitest";

const larkMock = vi.hoisted(() => {
  const createMessage = vi.fn(async () => ({}));
  class Client {
    public im = {
      message: {
        create: createMessage,
      },
    };

    constructor(_config: unknown) {}
  }

  class WSClient {
    constructor(_config: unknown) {}
    start() {}
    stop() {}
  }

  return {
    Client,
    WSClient,
    LoggerLevel: { info: "info" },
    createMessage,
  };
});

vi.mock("@larksuiteoapi/node-sdk", () => larkMock);

import { ConversationStore } from "@belldandy/agent";

import { FeishuChannel } from "./feishu.js";

describe("FeishuChannel", () => {
  it("does not fall back to lastChatId when binding is missing", async () => {
    const channel = new FeishuChannel({
      appId: "app-id",
      appSecret: "app-secret",
      conversationStore: new ConversationStore(),
      agent: { async *run() {} } as any,
    });

    const sent = await channel.sendProactiveMessage("manual");

    expect(sent).toBe(false);
    expect(larkMock.createMessage).not.toHaveBeenCalled();
  });

  it("rejects explicit sessionKey when binding belongs to another channel", async () => {
    const channel = new FeishuChannel({
      appId: "app-id",
      appSecret: "app-secret",
      conversationStore: new ConversationStore(),
      agent: { async *run() {} } as any,
      currentConversationBindingStore: {
        async upsert() {},
        async get() {
          return {
            channel: "qq",
            sessionKey: "channel=qq:scope=per-channel-peer:chat=channel-a:peer=user-a",
            sessionScope: "per-channel-peer",
            legacyConversationId: "qq_channel-a",
            chatKind: "channel",
            chatId: "channel-a",
            updatedAt: Date.now(),
            target: { chatId: "channel-a" },
          };
        },
        async getLatestByChannel() {
          return undefined;
        },
      },
    });

    const sent = await channel.sendProactiveMessage("manual", {
      sessionKey: "channel=qq:scope=per-channel-peer:chat=channel-a:peer=user-a",
    });

    expect(sent).toBe(false);
    expect(larkMock.createMessage).not.toHaveBeenCalled();
  });
});
