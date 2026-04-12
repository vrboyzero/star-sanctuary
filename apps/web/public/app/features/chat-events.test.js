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
});
