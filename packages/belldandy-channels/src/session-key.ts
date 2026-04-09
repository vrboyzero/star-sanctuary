import type { ChannelKind, ChatKind } from "./router/types.js";

export type ChannelSessionScope =
  | "main"
  | "per-peer"
  | "per-channel-peer"
  | "per-account-channel-peer";

export type ChannelSessionDescriptor = {
  channel: ChannelKind;
  chatKind: ChatKind;
  chatId: string;
  accountId?: string;
  peerId?: string;
  sessionScope: ChannelSessionScope;
  sessionKey: string;
  legacyConversationId: string;
};

function normalizeValue(value: string | undefined): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function encodeValue(value: string): string {
  return encodeURIComponent(value);
}

export function buildLegacyChannelConversationId(input: {
  channel: ChannelKind;
  chatId: string;
}): string {
  const chatId = normalizeValue(input.chatId) ?? "";
  switch (input.channel) {
    case "qq":
      return `qq_${chatId}`;
    case "community":
      return `community:${chatId}`;
    case "discord":
    case "feishu":
    case "webhook":
    default:
      return chatId;
  }
}

export function buildChannelSessionDescriptor(input: {
  channel: ChannelKind;
  chatKind: ChatKind;
  chatId: string;
  accountId?: string;
  senderId?: string;
}): ChannelSessionDescriptor {
  const chatId = normalizeValue(input.chatId) ?? "";
  const accountId = normalizeValue(input.accountId);
  const senderId = normalizeValue(input.senderId);
  const peerId = input.chatKind === "dm"
    ? (senderId ?? chatId)
    : senderId;
  const sessionScope: ChannelSessionScope =
    input.chatKind === "dm"
      ? "per-peer"
      : accountId
        ? "per-account-channel-peer"
        : "per-channel-peer";
  const peerKey = peerId ?? "unknown";
  const parts = [
    `channel=${encodeValue(input.channel)}`,
    `scope=${encodeValue(sessionScope)}`,
    `chatKind=${encodeValue(input.chatKind)}`,
    `chat=${encodeValue(chatId)}`,
  ];
  if (accountId) {
    parts.push(`account=${encodeValue(accountId)}`);
  }
  parts.push(`peer=${encodeValue(peerKey)}`);

  return {
    channel: input.channel,
    chatKind: input.chatKind,
    chatId,
    ...(accountId ? { accountId } : {}),
    ...(peerId ? { peerId } : {}),
    sessionScope,
    sessionKey: parts.join(":"),
    legacyConversationId: buildLegacyChannelConversationId({
      channel: input.channel,
      chatId,
    }),
  };
}
