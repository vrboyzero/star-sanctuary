function createNoopPromptController() {
  return {
    syncHeight() {},
    restoreText() {},
  };
}

export function initPromptController({
  promptEl,
  maxHeightPx = 120,
  onSubmit,
  documentRef = globalThis.document,
  requestAnimationFrameFn = globalThis.requestAnimationFrame?.bind(globalThis) ?? ((callback) => setTimeout(callback, 0)),
}) {
  if (!promptEl) return createNoopPromptController();

  let promptBaseHeightPx = 0;

  function measurePromptBaseHeight() {
    const computed = globalThis.getComputedStyle(promptEl);
    const lineHeight = Number.parseFloat(computed.lineHeight) || 24;
    const paddingTop = Number.parseFloat(computed.paddingTop) || 0;
    const paddingBottom = Number.parseFloat(computed.paddingBottom) || 0;
    const borderTop = Number.parseFloat(computed.borderTopWidth) || 0;
    const borderBottom = Number.parseFloat(computed.borderBottomWidth) || 0;
    promptBaseHeightPx = Math.max(
      promptBaseHeightPx,
      Math.ceil(lineHeight + paddingTop + paddingBottom + borderTop + borderBottom),
    );
  }

  function syncHeight() {
    const baseHeight = promptBaseHeightPx || promptEl.scrollHeight;
    const hasText = Boolean(promptEl.value);
    if (!hasText) {
      promptEl.style.height = `${baseHeight}px`;
      promptEl.style.overflowY = "hidden";
      return;
    }
    promptEl.style.height = "auto";
    const nextHeight = Math.min(promptEl.scrollHeight, maxHeightPx);
    promptEl.style.height = `${Math.max(baseHeight, nextHeight)}px`;
    promptEl.style.overflowY = promptEl.scrollHeight > maxHeightPx ? "auto" : "hidden";
  }

  function initialize() {
    measurePromptBaseHeight();
    syncHeight();
  }

  function restoreText(text) {
    if (!text) return;
    promptEl.value = text;
    syncHeight();
  }

  promptEl.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSubmit?.();
    }
    requestAnimationFrameFn(syncHeight);
  });

  promptEl.addEventListener("input", () => {
    syncHeight();
  });

  initialize();
  if (documentRef?.fonts?.ready) {
    documentRef.fonts.ready.then(() => {
      initialize();
    }).catch(() => {});
  }

  return {
    syncHeight,
    restoreText,
  };
}
