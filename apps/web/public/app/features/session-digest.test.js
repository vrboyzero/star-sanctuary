// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { createSessionDigestFeature } from "./session-digest.js";

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")
    .replaceAll("'", "&#39;");
}

function createFeatureHarness() {
  document.body.innerHTML = `
    <div id="sessionDigestSummary"></div>
    <button id="sessionDigestRefresh">刷新摘要</button>
    <div id="sessionDigestModal" class="hidden">
      <span id="sessionDigestModalTitle"></span>
      <div id="sessionDigestModalMeta"></div>
      <div id="sessionDigestModalActions"></div>
      <div id="sessionDigestModalContent"></div>
      <button id="sessionDigestModalClose">关闭</button>
    </div>
  `;

  const onOpenContinuationAction = vi.fn();
  const feature = createSessionDigestFeature({
    refs: {
      sessionDigestSummaryEl: document.getElementById("sessionDigestSummary"),
      sessionContinuationSummaryEl: null,
      sessionDigestRefreshBtn: document.getElementById("sessionDigestRefresh"),
      sessionDigestModalEl: document.getElementById("sessionDigestModal"),
      sessionDigestModalTitleEl: document.getElementById("sessionDigestModalTitle"),
      sessionDigestModalMetaEl: document.getElementById("sessionDigestModalMeta"),
      sessionDigestModalActionsEl: document.getElementById("sessionDigestModalActions"),
      sessionDigestModalContentEl: document.getElementById("sessionDigestModalContent"),
      sessionDigestModalCloseBtn: document.getElementById("sessionDigestModalClose"),
    },
    isConnected: () => true,
    sendReq: vi.fn(),
    makeId: () => "req-1",
    getActiveConversationId: () => "conversation:current",
    onSendHistoryAction: vi.fn(),
    onOpenContinuationAction,
    escapeHtml,
    formatDateTime: () => "2026-04-21 09:30:00",
    showNotice: vi.fn(),
    t: (_key, _params, fallback) => fallback ?? "",
  });

  return {
    feature,
    onOpenContinuationAction,
    refs: {
      sessionDigestSummaryEl: document.getElementById("sessionDigestSummary"),
      sessionDigestModalEl: document.getElementById("sessionDigestModal"),
      sessionDigestModalContentEl: document.getElementById("sessionDigestModalContent"),
    },
  };
}

describe("session digest modal continuation details", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    vi.restoreAllMocks();
  });

  it("keeps continuation next action out of the top bar and renders it inside the digest modal", () => {
    const { feature, onOpenContinuationAction, refs } = createFeatureHarness();

    feature.handleDigestUpdated({
      conversationId: "conversation:current",
      source: "event",
      digest: {
        status: "ready",
        messageCount: 12,
        pendingMessageCount: 2,
        threshold: 5,
        digestedMessageCount: 10,
        lastDigestAt: 1713663000000,
        rollingSummary: "会话摘要主内容。",
      },
    });

    feature.setContinuationState({
      resumeMode: "ask_user",
      targetType: "conversation",
      recommendedTargetId: "conversation:follow-up",
      nextAction: "等待用户补充完整的 Provider 偏好。",
      summary: "当前要先确认后续续跑目标。",
      checkpoints: {
        openCount: 1,
        blockerCount: 0,
        labels: ["等待用户回复", "模型选择"],
      },
      progress: {
        current: "等待回复",
        recent: ["已提示用户提供更多筛选条件。"],
      },
    }, { conversationId: "conversation:current" });

    expect(refs.sessionDigestSummaryEl.textContent).toContain("会话摘要主内容。");
    expect(refs.sessionDigestSummaryEl.textContent).not.toContain("等待用户补充完整的 Provider 偏好。");

    refs.sessionDigestSummaryEl.querySelector(".session-digest-card")?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(refs.sessionDigestModalEl.classList.contains("hidden")).toBe(false);
    expect(refs.sessionDigestModalContentEl.textContent).toContain("会话摘要主内容。");
    expect(refs.sessionDigestModalContentEl.textContent).toContain("等待用户补充完整的 Provider 偏好。");
    expect(refs.sessionDigestModalContentEl.textContent).toContain("当前要先确认后续续跑目标。");

    refs.sessionDigestModalContentEl
      .querySelector("[data-continuation-action]")
      ?.dispatchEvent(new MouseEvent("click", { bubbles: true }));

    expect(onOpenContinuationAction).toHaveBeenCalledWith({
      kind: "conversation",
      conversationId: "conversation:follow-up",
    });
  });
});
