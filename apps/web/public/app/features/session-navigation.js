export function createSessionNavigationFeature({
  refs,
  setActiveConversationId,
  renderCanvasGoalContext,
  switchMode,
  getChatEventsFeature,
  loadConversationMeta,
  getSessionDigestFeature,
  t = (_key, _params, fallback) => fallback ?? "",
}) {
  const { messagesEl } = refs;

  function openConversationSession(conversationId, hintText, options = {}) {
    if (!conversationId) return;
    const switchToChat = options.switchToChat !== false;
    const renderHint = options.renderHint !== false;
    setActiveConversationId(conversationId);
    renderCanvasGoalContext?.();
    if (switchToChat) {
      switchMode("chat");
    }
    getChatEventsFeature?.()?.resetStreamingState();
    if (messagesEl && renderHint) {
      messagesEl.innerHTML = "";
      const hint = document.createElement("div");
      hint.className = "system-msg";
      hint.textContent = hintText || t(
        "canvas.switchedConversationHint",
        { conversationId },
        `Switched to conversation: ${conversationId}`,
      );
      messagesEl.appendChild(hint);
    }
    void loadConversationMeta(conversationId, { showGoalEntryBanner: true });
    void getSessionDigestFeature?.()?.loadSessionDigest(conversationId);
  }

  return {
    openConversationSession,
  };
}
