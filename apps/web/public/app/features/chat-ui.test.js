// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createChatEventsFeature } from "./chat-events.js";
import { createChatUiFeature } from "./chat-ui.js";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function installMarkedStub(parseImpl) {
  let activeRenderer = null;

  class Renderer {}

  window.marked = {
    Renderer,
    use({ renderer }) {
      activeRenderer = renderer;
    },
    parse(text) {
      return parseImpl(text, activeRenderer);
    },
  };
}

function createFeature() {
  document.body.innerHTML = `
    <section class="chat-section">
      <div class="messages"></div>
    </section>
  `;

  const chatSection = document.querySelector(".chat-section");
  const messagesEl = document.querySelector(".messages");
  Object.defineProperty(chatSection, "scrollHeight", {
    configurable: true,
    value: 240,
  });

  const feature = createChatUiFeature({
    refs: {
      chatSection,
      messagesEl,
    },
    getAgentProfile: () => ({ name: "Belldandy", avatar: "B" }),
    getUserProfile: () => ({ name: "User", avatar: "U" }),
    getCurrentAgentId: () => "default",
    escapeHtml,
    showNotice: vi.fn(),
    getAvatarUploadHeaders: () => ({}),
    onAvatarUploaded: vi.fn(),
  });

  const bubble = feature.appendMessage("bot", "占位消息");
  return {
    bubble,
    chatSection,
    feature,
    messagesEl,
  };
}

function createChatEventsHarness(feature, overrides = {}) {
  const handleReactFinal = overrides.handleReactFinal || vi.fn();
  const forceScrollToBottom = overrides.forceScrollToBottom || feature.forceScrollToBottom;
  const onConversationDelta = overrides.onConversationDelta || vi.fn();
  const onConversationFinal = overrides.onConversationFinal || vi.fn();
  const getActiveConversationId = overrides.getActiveConversationId || (() => "");

  const chatEvents = createChatEventsFeature({
    appendMessage: feature.appendMessage,
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
    stripThinkBlocks: feature.stripThinkBlocks,
    configureMarkedOnce: feature.configureMarkedOnce,
    renderAssistantMessage: feature.renderAssistantMessage,
    updateMessageMeta: feature.updateMessageMeta,
    forceScrollToBottom,
    getCanvasApp: () => ({ handleReactFinal }),
    getActiveConversationId,
    onAgentStatusEvent: vi.fn(),
    onConversationDelta,
    onConversationFinal,
    escapeHtml,
  });

  return {
    chatEvents,
    forceScrollToBottom,
    handleReactFinal,
    onConversationDelta,
    onConversationFinal,
  };
}

describe("chat ui rich text rendering", () => {
  beforeEach(() => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete window.marked;
    document.body.innerHTML = "";
  });

  it("keeps assistant message accessibility metadata in sync after stripping think blocks", () => {
    installMarkedStub((text) => text);
    const { bubble, feature } = createFeature();

    const rawText = "<think>内部推理</think><p>第一段</p><p>第二段 <strong>重点</strong></p>";
    feature.renderAssistantMessage(bubble, rawText);

    const body = bubble.querySelector(".msg-body");
    expect(body?.getAttribute("role")).toBe("article");
    expect(body?.getAttribute("aria-live")).toBe("polite");
    expect(body?.getAttribute("aria-atomic")).toBe("true");
    expect(body?.dataset.messageText).toBe("第一段第二段 重点");
    expect(body?.getAttribute("aria-label")).toBe("第一段第二段 重点");
    expect(bubble.dataset.messageText).toBe("第一段第二段 重点");
    expect(body?.textContent).not.toContain("内部推理");
  });

  it("renders fenced code blocks with stable selectors for automation", () => {
    installMarkedStub((text, renderer) => {
      const match = text.match(/```(\w+)\n([\s\S]*?)```/);
      if (!match || !renderer?.code) return text;
      return renderer.code(match[2], match[1]);
    });
    const { bubble, feature } = createFeature();

    feature.renderAssistantMessage(bubble, "```ts\nconst html = '<div>';\n```");

    const body = bubble.querySelector(".msg-body");
    expect(body?.querySelector(".code-block-wrapper")).not.toBeNull();
    expect(body?.querySelector(".code-block-header")).not.toBeNull();
    expect(body?.querySelector(".code-block-lang")?.textContent).toBe("ts");
    expect(body?.querySelector(".copy-code-btn")?.getAttribute("title")).toBe("Copy code");
    expect(body?.querySelector("code")?.className).toBe("language-ts");
    expect(body?.innerHTML).toContain("&lt;div&gt;");
  });

  it("preserves tables and rewrites image or video content into stable thumbnails", () => {
    installMarkedStub((text) => text);
    const { bubble, feature } = createFeature();

    feature.renderAssistantMessage(
      bubble,
      [
        "<table><thead><tr><th>字段</th></tr></thead><tbody><tr><td>值</td></tr></tbody></table>",
        "<img src=\"https://example.com/demo.png\" alt=\"示例图\" onclick=\"alert('x')\">",
        "<video src=\"https://example.com/demo.mp4\" controls></video>",
      ].join(""),
    );

    const body = bubble.querySelector(".msg-body");
    expect(body?.querySelector("table")).not.toBeNull();
    expect(body?.querySelector("thead")).not.toBeNull();
    expect(body?.querySelector("tbody")).not.toBeNull();
    expect(body?.querySelector("img")).toBeNull();
    expect(body?.querySelector("video")).toBeNull();
    expect(body?.querySelectorAll(".media-thumbnail")).toHaveLength(2);
    expect(body?.querySelector(".video-thumbnail")).not.toBeNull();
    expect(body?.querySelector("[onclick]")).toBeNull();
  });

  it("sanitizes unsafe rich text while preserving safe assistant links", () => {
    installMarkedStub((text) => text);
    const { bubble, feature } = createFeature();

    feature.renderAssistantMessage(
      bubble,
      [
        "<script>alert('x')</script>",
        "<a href=\"javascript:alert('x')\" target=\"_blank\">危险链接</a>",
        "<a href=\"https://example.com/docs\" target=\"_blank\">安全链接</a>",
        "<img src=\"javascript:alert('x')\" alt=\"bad\">",
      ].join(""),
    );

    const body = bubble.querySelector(".msg-body");
    const links = body?.querySelectorAll("a") || [];
    expect(body?.querySelector("script")).toBeNull();
    expect(links).toHaveLength(2);
    expect(links[0]?.getAttribute("href")).toBeNull();
    expect(links[1]?.getAttribute("href")).toBe("https://example.com/docs");
    expect(links[1]?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(body?.querySelector("img")).toBeNull();
  });

  it("provides copy feedback for code and message copy buttons", async () => {
    vi.useFakeTimers();
    let clickHandler = null;
    vi.spyOn(document, "addEventListener").mockImplementation((type, handler) => {
      if (type === "click") {
        clickHandler = handler;
      }
    });
    const clipboard = {
      writeText: vi.fn().mockResolvedValue(undefined),
    };
    Object.defineProperty(window.navigator, "clipboard", {
      configurable: true,
      value: clipboard,
    });
    installMarkedStub((text, renderer) => {
      const match = text.match(/```(\w+)\n([\s\S]*?)```/);
      if (!match || !renderer?.code) return text;
      return renderer.code(match[2], match[1]);
    });
    const { bubble, feature } = createFeature();

    feature.initCopyButtonDelegation();
    expect(clickHandler).toBeTypeOf("function");

    feature.renderAssistantMessage(bubble, "```ts\nconst html = '<div>';\n```");
    const codeButton = bubble.querySelector(".copy-code-btn");
    await clickHandler({ target: codeButton });
    expect(clipboard.writeText).toHaveBeenNthCalledWith(1, "const html = '<div>';\n");
    expect(codeButton?.innerHTML).toBe("Copied");
    vi.advanceTimersByTime(2000);
    expect(codeButton?.innerHTML).toContain("Copy");

    const textBubble = feature.appendMessage("bot", "");
    feature.renderAssistantMessage(textBubble, "<p>第一段 <strong>重点</strong></p>");
    const messageButton = textBubble?.closest(".msg-content-wrapper")?.querySelector(".copy-msg-btn");
    const metaRow = textBubble?.closest(".msg-content-wrapper")?.querySelector(".msg-meta");
    expect(messageButton).not.toBeNull();
    expect(metaRow?.firstElementChild?.classList.contains("msg-meta-actions")).toBe(true);
    expect(metaRow?.querySelector(".msg-meta-actions .copy-msg-btn")).toBe(messageButton);
    expect(metaRow?.querySelector(".msg-time")).not.toBeNull();
    await clickHandler({ target: messageButton });
    expect(clipboard.writeText).toHaveBeenNthCalledWith(2, "第一段 重点");
    expect(messageButton?.innerHTML).toBe("Copied");
    vi.advanceTimersByTime(2000);
    expect(messageButton?.innerHTML).toContain("Copy");
  });

  it("opens image and video media modals from rewritten thumbnails", () => {
    installMarkedStub((text) => text);
    const { bubble, feature } = createFeature();

    feature.renderAssistantMessage(
      bubble,
      [
        "<img src=\"https://example.com/demo.png\" alt=\"示例图\">",
        "<video src=\"https://example.com/demo.mp4\" controls></video>",
      ].join(""),
    );

    const imageThumbnail = bubble.querySelector(".media-thumbnail:not(.video-thumbnail)");
    imageThumbnail?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const imageModal = document.body.querySelector(".media-modal");
    expect(imageModal?.querySelector("img")?.getAttribute("src")).toBe("https://example.com/demo.png");
    imageModal?.querySelector(".media-modal-close")?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(document.body.querySelector(".media-modal")).toBeNull();

    const videoThumbnail = bubble.querySelector(".video-thumbnail");
    videoThumbnail?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    const videoModal = document.body.querySelector(".media-modal");
    expect(videoModal?.querySelector("video")?.getAttribute("src")).toBe("https://example.com/demo.mp4");
  });

  it("keeps media modal open on content click and closes it on backdrop click", () => {
    const { feature } = createFeature();

    feature.openMediaModal("https://example.com/demo.png", "image");

    const modal = document.body.querySelector(".media-modal");
    const content = modal?.querySelector(".media-modal-content");
    content?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(document.body.querySelector(".media-modal")).not.toBeNull();

    modal?.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    expect(document.body.querySelector(".media-modal")).toBeNull();
  });

  it("reuses the same assistant bubble while streaming markdown becomes rich text", () => {
    installMarkedStub((text, renderer) => {
      const match = text.match(/^([\s\S]*?)```(\w+)\n([\s\S]*?)```$/);
      if (!match || !renderer?.code) {
        return `<p>${escapeHtml(text)}</p>`;
      }
      const prefix = match[1].trim();
      return `${prefix ? `<p>${escapeHtml(prefix)}</p>` : ""}${renderer.code(match[3], match[2])}`;
    });
    const { feature, messagesEl } = createFeature();
    const { chatEvents, handleReactFinal } = createChatEventsHarness(feature);

    chatEvents.beginStreamingReply({ timestampMs: 1, isLatest: true });
    chatEvents.handleEvent("chat.delta", { delta: "说明\n\n```js\nconst total = 1" });

    let body = messagesEl.querySelector(".msg-body");
    expect(messagesEl.querySelectorAll(".msg-wrapper.bot")).toHaveLength(2);
    expect(body?.querySelector(".code-block-wrapper")).toBeNull();
    expect(body?.dataset.messageText).toContain("说明");
    expect(body?.dataset.messageText).toContain("const total = 1");

    chatEvents.handleEvent("chat.delta", { delta: ";\n```" });

    body = messagesEl.querySelector(".msg-body");
    expect(messagesEl.querySelectorAll(".msg-wrapper.bot")).toHaveLength(2);
    expect(body?.querySelector(".code-block-wrapper")).not.toBeNull();
    expect(body?.querySelector(".code-block-lang")?.textContent).toBe("js");
    expect(body?.dataset.messageText).toContain("const total = 1;");

    chatEvents.handleEvent("chat.final", {
      text: "说明\n\n```js\nconst total = 1;\n```",
      messageMeta: {
        timestampMs: 2,
        displayTimeText: "2026-04-13 11:00:00 GMT+8",
        isLatest: true,
      },
    });

    body = messagesEl.querySelector(".msg-body");
    expect(messagesEl.querySelectorAll(".msg-wrapper.bot")).toHaveLength(2);
    expect(body?.querySelector(".code-block-wrapper")).not.toBeNull();
    expect(handleReactFinal).toHaveBeenCalledWith("说明\n\n```js\nconst total = 1;\n```");
  });

  it("autoplays assistant audio and refreshes latest meta on final rich text", async () => {
    installMarkedStub((text) => {
      if (text === "[audio]") {
        return "<audio src=\"https://example.com/voice.mp3\" controls></audio>";
      }
      return `<p>${escapeHtml(text)}</p>`;
    });
    const playSpy = vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
    const { feature, messagesEl, chatSection } = createFeature();
    const { chatEvents } = createChatEventsHarness(feature);

    const previousBubble = messagesEl.querySelector(".msg-wrapper.bot .msg");
    feature.updateMessageMeta(previousBubble, { timestampMs: 1, isLatest: true });
    chatEvents.beginStreamingReply({ timestampMs: 2, displayTimeText: "2026-04-13 11:00:00 GMT+8", isLatest: true });
    chatEvents.handleEvent("chat.final", {
      text: "[audio]",
      messageMeta: {
        timestampMs: 3,
        displayTimeText: "2026-04-13 11:30:00 GMT+8",
        isLatest: true,
      },
    });
    await Promise.resolve();

    const wrappers = messagesEl.querySelectorAll(".msg-wrapper.bot");
    const finalWrapper = wrappers[1];
    const finalBubble = finalWrapper?.querySelector(".msg");
    const finalMeta = finalWrapper?.querySelector(".msg-meta");
    expect(wrappers).toHaveLength(2);
    expect(previousBubble?.getAttribute("data-latest")).toBe("false");
    expect(finalWrapper?.getAttribute("data-latest")).toBe("true");
    expect(finalBubble?.querySelector("audio")?.getAttribute("src")).toBe("https://example.com/voice.mp3");
    expect(finalMeta?.querySelector(".msg-time")?.getAttribute("title")).toBe("2026-04-13 11:30:00 GMT+8");
    expect(finalMeta?.querySelector(".msg-latest-badge")?.classList.contains("hidden")).toBe(false);
    expect(playSpy).toHaveBeenCalledTimes(1);
    expect(chatSection.scrollTop).toBe(240);
  });

  it("forces instant auto-scroll during message appends to avoid smooth-scroll bounce", () => {
    const originalRaf = globalThis.requestAnimationFrame;
    const originalCancelRaf = globalThis.cancelAnimationFrame;
    const scheduled = [];
    let nextHandle = 1;
    globalThis.requestAnimationFrame = (callback) => {
      const handle = nextHandle++;
      scheduled.push({ handle, callback });
      return handle;
    };
    globalThis.cancelAnimationFrame = (handle) => {
      const index = scheduled.findIndex((item) => item.handle === handle);
      if (index >= 0) {
        scheduled.splice(index, 1);
      }
    };

    const { feature, chatSection } = createFeature();
    chatSection.style.scrollBehavior = "smooth";

    feature.forceScrollToBottom();

    expect(chatSection.scrollTop).toBe(240);
    expect(chatSection.style.scrollBehavior).toBe("auto");

    const pending = scheduled.shift();
    pending?.callback(0);

    expect(chatSection.style.scrollBehavior).toBe("smooth");
    globalThis.requestAnimationFrame = originalRaf;
    globalThis.cancelAnimationFrame = originalCancelRaf;
  });

  it("ignores rich text deltas from inactive conversations", () => {
    installMarkedStub((text) => `<p>${escapeHtml(text)}</p>`);
    const { feature, messagesEl } = createFeature();
    const forceScrollToBottom = vi.fn();
    const { chatEvents, onConversationDelta, onConversationFinal } = createChatEventsHarness(feature, {
      forceScrollToBottom,
      getActiveConversationId: () => "conv-active",
    });

    chatEvents.beginStreamingReply({ timestampMs: 1, isLatest: true });
    const streamingBubble = messagesEl.querySelectorAll(".msg-wrapper.bot .msg")[1];

    chatEvents.handleEvent("chat.delta", {
      conversationId: "conv-other",
      delta: "不会渲染",
    });
    chatEvents.handleEvent("chat.final", {
      conversationId: "conv-other",
      text: "不会落到当前会话",
    });

    expect(onConversationDelta).toHaveBeenCalledTimes(1);
    expect(onConversationFinal).toHaveBeenCalledTimes(1);
    expect(forceScrollToBottom).not.toHaveBeenCalled();
    expect(streamingBubble?.querySelector(".msg-body")).toBeNull();
    expect(streamingBubble?.dataset.messageText || "").toBe("");
  });

  it("starts a fresh assistant bubble after streaming state reset", () => {
    installMarkedStub((text) => `<p>${escapeHtml(text)}</p>`);
    const { feature, messagesEl } = createFeature();
    const { chatEvents } = createChatEventsHarness(feature);

    chatEvents.beginStreamingReply({ timestampMs: 1, isLatest: true });
    chatEvents.handleEvent("chat.final", {
      text: "第一轮完成",
      messageMeta: {
        timestampMs: 2,
        displayTimeText: "2026-04-13 12:00:00 GMT+8",
        isLatest: true,
      },
    });

    chatEvents.resetStreamingState();
    chatEvents.handleEvent("chat.delta", { delta: "第二轮开始" });

    const wrappers = messagesEl.querySelectorAll(".msg-wrapper.bot");
    const latestBubble = wrappers[2]?.querySelector(".msg");
    expect(wrappers).toHaveLength(3);
    expect(wrappers[1]?.querySelector(".msg-body")?.dataset.messageText).toBe("第一轮完成");
    expect(latestBubble?.querySelector(".msg-body")?.dataset.messageText).toBe("第二轮开始");
    expect(wrappers[1]?.getAttribute("data-latest")).toBe("false");
    expect(wrappers[2]?.getAttribute("data-latest")).toBe("true");
  });

  it("warns instead of throwing when assistant audio autoplay is blocked", async () => {
    installMarkedStub(() => "<audio src=\"https://example.com/voice.mp3\" controls></audio>");
    vi.spyOn(HTMLMediaElement.prototype, "play").mockRejectedValue(new Error("blocked"));
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { feature, messagesEl } = createFeature();
    const { chatEvents } = createChatEventsHarness(feature);

    chatEvents.beginStreamingReply({ timestampMs: 1, isLatest: true });
    chatEvents.handleEvent("chat.final", {
      text: "[audio blocked]",
      messageMeta: {
        timestampMs: 2,
        displayTimeText: "2026-04-13 12:30:00 GMT+8",
        isLatest: true,
      },
    });
    await Promise.resolve();
    await Promise.resolve();

    expect(warnSpy).toHaveBeenCalledWith("Auto-play blocked:", expect.any(Error));
    expect(messagesEl.querySelectorAll(".msg-wrapper.bot")).toHaveLength(2);
    expect(messagesEl.querySelectorAll("audio")).toHaveLength(1);
  });
});
