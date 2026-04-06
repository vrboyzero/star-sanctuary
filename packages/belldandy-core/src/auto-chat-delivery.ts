import type { ConversationStore } from "@belldandy/agent";
import { buildResidentMainConversationId } from "./resident-agent-runtime.js";

type AutoChatFinalFrame = {
  type: "event";
  event: "chat.final";
  payload: {
    conversationId: string;
    agentId: string;
    text: string;
    messageMeta: {
      timestampMs: number;
      isLatest: true;
    };
  };
};

export function deliverAutoMessageToResidentChannel(input: {
  conversationStore: ConversationStore;
  broadcast: (frame: AutoChatFinalFrame) => void;
  text: string;
  agentId?: string;
  timestampMs?: number;
  channel?: string;
}): {
  agentId: string;
  conversationId: string;
  timestampMs: number;
} {
  const agentId = typeof input.agentId === "string" && input.agentId.trim()
    ? input.agentId.trim()
    : "default";
  const conversationId = buildResidentMainConversationId(agentId);
  const assistantMessage = input.conversationStore.addMessage(
    conversationId,
    "assistant",
    input.text,
    {
      agentId,
      channel: input.channel ?? "webchat",
      timestampMs: input.timestampMs,
    },
  );

  input.broadcast({
    type: "event",
    event: "chat.final",
    payload: {
      conversationId,
      agentId,
      text: input.text,
      messageMeta: {
        timestampMs: assistantMessage.timestamp,
        isLatest: true,
      },
    },
  });

  return {
    agentId,
    conversationId,
    timestampMs: assistantMessage.timestamp,
  };
}
