// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import { createSessionNavigationFeature } from "./session-navigation.js";

describe("session navigation", () => {
  it("renders the thread organizer notice after loading the target conversation", async () => {
    document.body.innerHTML = `<div id="messages"></div>`;
    const messagesEl = document.getElementById("messages");
    let activeConversationId = "";
    const loadConversationMeta = vi.fn(async () => {
      messagesEl.innerHTML = `
        <div class="system-msg" data-email-inbound-session-banner="true">banner</div>
        <div class="msg-wrapper">history</div>
      `;
    });

    const feature = createSessionNavigationFeature({
      refs: { messagesEl },
      setActiveConversationId: (conversationId) => {
        activeConversationId = conversationId;
      },
      getActiveConversationId: () => activeConversationId,
      renderCanvasGoalContext: vi.fn(),
      switchMode: vi.fn(),
      getChatEventsFeature: () => ({ resetStreamingState: vi.fn() }),
      loadConversationMeta,
      getSessionDigestFeature: () => ({ loadSessionDigest: vi.fn() }),
    });

    feature.openConversationSession("channel=email:thread-1", "切换会话", {
      systemNoticeText: "线程整理摘要: 需要尽快回复",
    });
    await new Promise((resolve) => setTimeout(resolve, 0));

    const children = [...messagesEl.children];
    expect(loadConversationMeta).toHaveBeenCalledWith("channel=email:thread-1", { showGoalEntryBanner: true });
    expect(children).toHaveLength(3);
    expect(children[0].getAttribute("data-email-inbound-session-banner")).toBe("true");
    expect(children[1].getAttribute("data-session-open-note")).toBe("true");
    expect(children[1].textContent).toContain("需要尽快回复");
  });

  it("skips stale organizer notices after the active conversation changes", async () => {
    document.body.innerHTML = `<div id="messages"></div>`;
    const messagesEl = document.getElementById("messages");
    let activeConversationId = "";
    let resolveLoad;
    const loadConversationMeta = vi.fn(() => new Promise((resolve) => {
      resolveLoad = resolve;
    }));

    const feature = createSessionNavigationFeature({
      refs: { messagesEl },
      setActiveConversationId: (conversationId) => {
        activeConversationId = conversationId;
      },
      getActiveConversationId: () => activeConversationId,
      renderCanvasGoalContext: vi.fn(),
      switchMode: vi.fn(),
      getChatEventsFeature: () => ({ resetStreamingState: vi.fn() }),
      loadConversationMeta,
      getSessionDigestFeature: () => ({ loadSessionDigest: vi.fn() }),
    });

    feature.openConversationSession("channel=email:thread-1", "切换会话", {
      systemNoticeText: "线程整理摘要: 需要尽快回复",
    });
    activeConversationId = "agent:default:main";
    resolveLoad();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(messagesEl.querySelector("[data-session-open-note]")).toBeNull();
  });
});
