// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { createChatEventsFeature } from "./chat-events.js";

describe("chat events pairing", () => {
  it("delegates pairing.required to the provided WebChat approval handler", () => {
    const target = { innerHTML: "" };
    const appendMessage = vi.fn(() => target);
    const onPairingRequired = vi.fn();
    const feature = createChatEventsFeature({
      appendMessage,
      onPairingRequired,
      escapeHtml: (value) => String(value),
    });

    const handled = feature.handleEvent("pairing.required", {
      code: "ABCD1234",
      message: "pairing required: approve this code to allow messages",
    });

    expect(handled).toBe(true);
    expect(appendMessage).toHaveBeenCalledWith("bot", "", expect.any(Object));
    expect(onPairingRequired).toHaveBeenCalledTimes(1);
    expect(onPairingRequired).toHaveBeenCalledWith({
      target,
      code: "ABCD1234",
      clientId: "",
      message: "pairing required: approve this code to allow messages",
    });
  });

  it("replaces an empty streaming bubble with an interrupted system message when conversation.run.stopped arrives", () => {
    document.body.innerHTML = "<div id=\"messages\"></div>";
    const messagesEl = document.getElementById("messages");
    const appendMessage = vi.fn((kind, text) => {
      if (kind === "system") {
        const systemEl = document.createElement("div");
        systemEl.className = "system-msg";
        systemEl.textContent = text;
        messagesEl.appendChild(systemEl);
        return systemEl;
      }
      const wrapper = document.createElement("div");
      wrapper.className = `msg-wrapper ${kind}`;
      const bubble = document.createElement("div");
      bubble.className = `msg ${kind}`;
      bubble.textContent = text;
      wrapper.appendChild(bubble);
      messagesEl.appendChild(wrapper);
      return bubble;
    });
    const onConversationStopped = vi.fn();
    const feature = createChatEventsFeature({
      appendMessage,
      onPairingRequired: vi.fn(),
      showRestartCountdown: vi.fn(),
      setTokenUsageRunning: vi.fn(),
      updateTokenUsage: vi.fn(),
      showTaskTokenResult: vi.fn(),
      onChannelSecurityPending: vi.fn(),
      queueGoalUpdateEvent: vi.fn(),
      onSubtaskUpdated: vi.fn(),
      onToolSettingsConfirmRequired: vi.fn(),
      onToolSettingsConfirmResolved: vi.fn(),
      onExternalOutboundConfirmRequired: vi.fn(),
      onExternalOutboundConfirmResolved: vi.fn(),
      onToolsConfigUpdated: vi.fn(),
      onConversationDigestUpdated: vi.fn(),
      stripThinkBlocks: (value) => value,
      configureMarkedOnce: vi.fn(),
      renderAssistantMessage: vi.fn(),
      updateMessageMeta: vi.fn(),
      forceScrollToBottom: vi.fn(),
      getCanvasApp: () => null,
      getActiveConversationId: () => "",
      onAgentStatusEvent: vi.fn(),
      onConversationDelta: vi.fn(),
      onConversationFinal: vi.fn(),
      onConversationStopped,
      getStoppedMessageText: () => "Interrupted",
      escapeHtml: (value) => String(value),
    });

    feature.beginStreamingReply({ timestampMs: 1, isLatest: false });
    expect(messagesEl.querySelectorAll(".msg-wrapper.bot")).toHaveLength(1);

    const handled = feature.handleEvent("conversation.run.stopped", {
      conversationId: "conv-stop",
      runId: "run-stop",
      reason: "Stopped by user.",
    });

    expect(handled).toBe(true);
    expect(onConversationStopped).toHaveBeenCalledWith({
      conversationId: "conv-stop",
      runId: "run-stop",
      reason: "Stopped by user.",
    });
    expect(messagesEl.querySelectorAll(".msg-wrapper.bot")).toHaveLength(0);
    expect(messagesEl.querySelector(".system-msg")?.textContent).toBe("Interrupted");
  });
});
