import { describe, expect, it } from "vitest";
import { ConversationStore } from "@belldandy/agent";

import { deliverAutoMessageToResidentChannel } from "./auto-chat-delivery.js";

describe("deliverAutoMessageToResidentChannel", () => {
  it("persists and broadcasts auto messages to the resident main channel", () => {
    const conversationStore = new ConversationStore();
    const frames: Array<{
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
    }> = [];

    const result = deliverAutoMessageToResidentChannel({
      conversationStore,
      broadcast: (frame) => {
        frames.push(frame);
      },
      text: "scheduled follow-up",
      agentId: "default",
      timestampMs: 1234,
    });

    expect(result).toEqual({
      agentId: "default",
      conversationId: "agent:default:main",
      timestampMs: 1234,
    });

    expect(conversationStore.get("agent:default:main")?.messages.map((item) => item.content)).toEqual([
      "scheduled follow-up",
    ]);
    expect(frames).toEqual([{
      type: "event",
      event: "chat.final",
      payload: {
        conversationId: "agent:default:main",
        agentId: "default",
        text: "scheduled follow-up",
        messageMeta: {
          timestampMs: 1234,
          isLatest: true,
        },
      },
    }]);
  });
});
