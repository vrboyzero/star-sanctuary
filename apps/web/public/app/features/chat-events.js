export function createChatEventsFeature({
  appendMessage,
  onPairingRequired,
  showRestartCountdown,
  setTokenUsageRunning,
  updateTokenUsage,
  showTaskTokenResult,
  onChannelSecurityPending,
  queueGoalUpdateEvent,
  onSubtaskUpdated,
  onToolSettingsConfirmRequired,
  onToolSettingsConfirmResolved,
  onExternalOutboundConfirmRequired,
  onExternalOutboundConfirmResolved,
  onEmailOutboundConfirmRequired,
  onEmailOutboundConfirmResolved,
  onToolsConfigUpdated,
  onConversationDigestUpdated,
  stripThinkBlocks,
  configureMarkedOnce,
  renderAssistantMessage,
  updateMessageMeta,
  forceScrollToBottom,
  getCanvasApp,
  getActiveConversationId,
  onAgentStatusEvent,
  onConversationDelta,
  onConversationFinal,
  onConversationStopped,
  getStoppedMessageText,
  escapeHtml,
  t = (_key, _params, fallback) => fallback ?? "",
}) {
  let botMessageEl = null;
  let botRawHtmlBuffer = "";
  let botMessageMeta = null;
  let pendingFrameFlushHandle = null;
  let pendingTokenUsagePayload = null;
  let pendingTokenUsageRunning = null;
  const pendingGoalUpdates = new Map();
  const pendingSubtaskUpdates = new Map();

  function scheduleFrameFlush() {
    if (pendingFrameFlushHandle !== null) {
      return;
    }
    const schedule = typeof globalThis.requestAnimationFrame === "function"
      ? globalThis.requestAnimationFrame.bind(globalThis)
      : (callback) => globalThis.setTimeout(() => callback(Date.now()), 16);
    pendingFrameFlushHandle = schedule(() => {
      pendingFrameFlushHandle = null;
      flushPendingUiEvents();
    });
  }

  function flushPendingUiEvents() {
    if (pendingTokenUsageRunning !== null) {
      setTokenUsageRunning?.(pendingTokenUsageRunning);
      pendingTokenUsageRunning = null;
    }

    if (pendingTokenUsagePayload) {
      updateTokenUsage?.(pendingTokenUsagePayload);
      pendingTokenUsagePayload = null;
    }

    if (pendingGoalUpdates.size > 0) {
      for (const payload of pendingGoalUpdates.values()) {
        queueGoalUpdateEvent?.(payload);
      }
      pendingGoalUpdates.clear();
    }

    if (pendingSubtaskUpdates.size > 0) {
      for (const payload of pendingSubtaskUpdates.values()) {
        onSubtaskUpdated?.(payload);
      }
      pendingSubtaskUpdates.clear();
    }
  }

  function resetStreamingState() {
    botMessageEl = null;
    botRawHtmlBuffer = "";
    botMessageMeta = null;
  }

  function beginStreamingReply(initialMeta = {}) {
    resetStreamingState();
    return ensureBotMessage(initialMeta);
  }

  function ensureBotMessage(initialMeta = {}) {
    if (!botMessageEl) {
      botMessageMeta = {
        timestampMs: typeof initialMeta.timestampMs === "number" ? initialMeta.timestampMs : Date.now(),
        displayTimeText: typeof initialMeta.displayTimeText === "string" ? initialMeta.displayTimeText : "",
        isLatest: Boolean(initialMeta.isLatest),
      };
      botMessageEl = appendMessage("bot", "", botMessageMeta);
      botRawHtmlBuffer = "";
    }
    return botMessageEl;
  }

  function renderStreamingMarkdown(rawText) {
    const target = ensureBotMessage();
    botRawHtmlBuffer = rawText;
    renderAssistantMessage?.(target, botRawHtmlBuffer);
    if (botMessageMeta) {
      updateMessageMeta?.(target, { ...botMessageMeta, isLatest: true });
    }
    return target;
  }

  function discardStreamingBubbleIfEmpty() {
    if (!botMessageEl) return false;
    const hasPartialText = typeof botRawHtmlBuffer === "string" && botRawHtmlBuffer.trim().length > 0;
    if (hasPartialText) return false;
    const wrapper = botMessageEl.closest(".msg-wrapper");
    wrapper?.remove();
    return true;
  }

  function autoplayAssistantAudio(target) {
    const audioEl = target?.querySelector("audio");
    if (!audioEl) return;
    audioEl.play().catch((err) => {
      console.warn("Auto-play blocked:", err);
    });
  }

  function isActiveConversationPayload(payload) {
    const activeConversationId = typeof getActiveConversationId === "function"
      ? getActiveConversationId()
      : "";
    const payloadConversationId = payload && typeof payload.conversationId === "string"
      ? payload.conversationId
      : "";
    if (!activeConversationId || !payloadConversationId) {
      return true;
    }
    return payloadConversationId === activeConversationId;
  }

  function handleEvent(event, payload) {
    if (event === "pairing.required") {
      const code = payload && payload.code ? String(payload.code) : "";
      const target = ensureBotMessage();
      if (typeof onPairingRequired === "function") {
        onPairingRequired({
          target,
          code,
          clientId: payload && payload.clientId ? String(payload.clientId) : "",
          message: payload && payload.message ? String(payload.message) : "",
        });
        return true;
      }
      const safeCode = escapeHtml?.(code) || code;
      target.innerHTML = `
        <div style="line-height: 1.6;">
          <div>${escapeHtml?.(t("settings.pairingPendingDefaultMessage", {}, "The current WebChat session still needs pairing approval.")) || ""}</div>
          <div style="margin-top: 8px;">${escapeHtml?.(t("runtime.pairingCodeLabel", {}, "Pairing code")) || ""}：<b>${safeCode || "-"}</b></div>
          <div style="background: var(--bg-secondary); padding: 8px; border-radius: 4px; margin: 8px 0; font-family: monospace;">
            corepack pnpm bdd pairing approve ${safeCode}
          </div>
          <div style="color: var(--text-secondary); font-size: 12px;">
            ${escapeHtml?.(t("runtime.pairingCliHint", {}, "If the inline approval button is unavailable, run this command in a new terminal and then resend your message here.")) || ""}
          </div>
        </div>
      `;
      return true;
    }

    if (event === "agent.status") {
      onAgentStatusEvent?.(payload);
      if (payload && payload.status === "restarting" && payload.countdown !== undefined) {
        showRestartCountdown(payload.countdown, payload.reason || "");
      }
      if (isActiveConversationPayload(payload)) {
        pendingTokenUsageRunning = payload?.status === "running";
        scheduleFrameFlush();
      }
      return true;
    }

    if (event === "token.usage") {
      pendingTokenUsagePayload = payload || null;
      scheduleFrameFlush();
      return true;
    }

    if (event === "token.counter.result") {
      showTaskTokenResult(payload);
      return true;
    }

    if (event === "channel.security.pending") {
      onChannelSecurityPending?.(payload);
      return true;
    }

    if (event === "goal.update") {
      const goalId = typeof payload?.goal?.id === "string" ? payload.goal.id : "";
      if (goalId) {
        pendingGoalUpdates.set(goalId, payload);
        scheduleFrameFlush();
      } else {
        queueGoalUpdateEvent?.(payload);
      }
      return true;
    }

    if (event === "subtask.update") {
      const taskId = typeof payload?.item?.id === "string" ? payload.item.id : "";
      if (taskId) {
        pendingSubtaskUpdates.set(taskId, payload);
        scheduleFrameFlush();
      } else {
        onSubtaskUpdated?.(payload);
      }
      return true;
    }

    if (event === "tool_settings.confirm.required") {
      onToolSettingsConfirmRequired(payload);
      return true;
    }

    if (event === "tool_settings.confirm.resolved") {
      onToolSettingsConfirmResolved(payload);
      return true;
    }

    if (event === "external_outbound.confirm.required") {
      onExternalOutboundConfirmRequired?.(payload);
      return true;
    }

    if (event === "external_outbound.confirm.resolved") {
      onExternalOutboundConfirmResolved?.(payload);
      return true;
    }

    if (event === "email_outbound.confirm.required") {
      onEmailOutboundConfirmRequired?.(payload);
      return true;
    }

    if (event === "email_outbound.confirm.resolved") {
      onEmailOutboundConfirmResolved?.(payload);
      return true;
    }

    if (event === "tools.config.updated") {
      onToolsConfigUpdated(payload);
      return true;
    }

    if (event === "conversation.digest.updated") {
      onConversationDigestUpdated?.(payload);
      return true;
    }

    if (event === "chat.delta") {
      const delta = payload && payload.delta ? String(payload.delta) : "";
      if (!delta) return true;
      onConversationDelta?.(payload);
      if (!isActiveConversationPayload(payload)) {
        return true;
      }
      renderStreamingMarkdown(botRawHtmlBuffer + delta);
      forceScrollToBottom();
      return true;
    }

    if (event === "chat.final") {
      const text = payload && payload.text ? String(payload.text) : "";
      onConversationFinal?.(payload);
      if (!isActiveConversationPayload(payload)) {
        return true;
      }
      const target = renderStreamingMarkdown(text);
      const meta = payload?.messageMeta && typeof payload.messageMeta === "object"
        ? payload.messageMeta
        : {};
      if (meta && typeof meta === "object") {
        botMessageMeta = {
          timestampMs: typeof meta.timestampMs === "number" ? meta.timestampMs : (botMessageMeta?.timestampMs ?? Date.now()),
          displayTimeText: typeof meta.displayTimeText === "string" ? meta.displayTimeText : (botMessageMeta?.displayTimeText ?? ""),
          isLatest: meta.isLatest === true,
        };
        updateMessageMeta?.(target, { ...botMessageMeta, isLatest: true });
      } else if (botMessageMeta) {
        updateMessageMeta?.(target, { ...botMessageMeta, isLatest: true });
      }
      autoplayAssistantAudio(target);
      forceScrollToBottom();
      getCanvasApp()?.handleReactFinal(text);
      return true;
    }

    if (event === "conversation.run.stopped") {
      onConversationStopped?.(payload);
      if (!isActiveConversationPayload(payload)) {
        return true;
      }
      const removedEmptyBubble = discardStreamingBubbleIfEmpty();
      if (removedEmptyBubble) {
        appendMessage("system", getStoppedMessageText?.(payload) || t("common.interrupted", {}, "Interrupted"));
      }
      resetStreamingState();
      forceScrollToBottom();
      return true;
    }

    if (event === "canvas.update") {
      if (payload) {
      const canvasApp = getCanvasApp();
      const boardId = payload.boardId;
      const action = payload.action;
      const data = payload.payload;
      if (canvasApp && canvasApp.currentBoardId === boardId) {
          canvasApp.handleCanvasEvent(action, data);
        }
      }
      return true;
    }

    if (event === "tool_call") {
      if (!isActiveConversationPayload(payload)) {
        return true;
      }
      getCanvasApp()?.handleReactEvent("tool_call", payload);
      return true;
    }

    if (event === "tool_result") {
      if (!isActiveConversationPayload(payload)) {
        return true;
      }
      getCanvasApp()?.handleReactEvent("tool_result", payload);
      return true;
    }

    return false;
  }

  return {
    beginStreamingReply,
    handleEvent,
    resetStreamingState,
  };
}
