import { describe, expect, it } from "vitest";

import { buildChannelSessionDescriptor } from "./session-key.js";

describe("channel session key", () => {
  it("builds per-peer session keys for dm chats", () => {
    const result = buildChannelSessionDescriptor({
      channel: "discord",
      chatKind: "dm",
      chatId: "dm-42",
      senderId: "user-1",
    });

    expect(result).toMatchObject({
      sessionScope: "per-peer",
      peerId: "user-1",
      legacyConversationId: "dm-42",
    });
    expect(result.sessionKey).toContain("channel=discord");
    expect(result.sessionKey).toContain("scope=per-peer");
    expect(result.sessionKey).toContain("peer=user-1");
  });

  it("builds per-channel-peer session keys for group and channel chats", () => {
    const result = buildChannelSessionDescriptor({
      channel: "qq",
      chatKind: "channel",
      chatId: "channel-a",
      senderId: "user-a",
    });

    expect(result).toMatchObject({
      sessionScope: "per-channel-peer",
      peerId: "user-a",
      legacyConversationId: "qq_channel-a",
    });
    expect(result.sessionKey).toContain("chat=channel-a");
    expect(result.sessionKey).toContain("peer=user-a");
  });

  it("builds per-account-channel-peer session keys for community rooms", () => {
    const result = buildChannelSessionDescriptor({
      channel: "community",
      accountId: "贝露丹蒂",
      chatKind: "room",
      chatId: "room-1",
      senderId: "user-1",
    });

    expect(result).toMatchObject({
      sessionScope: "per-account-channel-peer",
      accountId: "贝露丹蒂",
      peerId: "user-1",
      legacyConversationId: "community:room-1",
    });
    expect(result.sessionKey).toContain("scope=per-account-channel-peer");
    expect(result.sessionKey).toContain(`account=${encodeURIComponent("贝露丹蒂")}`);
  });
});
