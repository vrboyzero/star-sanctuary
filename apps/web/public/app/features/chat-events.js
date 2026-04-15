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
  escapeHtml,
}) {
  let botMessageEl = null;
  let botRawHtmlBuffer = "";
  let botMessageMeta = null;

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
          需要配对（Pairing）。配对码：<b>${safeCode}</b><br><br>
          <b>新手操作指南：</b><br>
          1. 不要关闭当前网页。<br>
          2. <b>保持那个运行着服务的黑色窗口不要关</b>，然后在项目目录下重新打开一个<b>新的黑色终端窗口</b>。<br>
          3. 在这个新窗口里，复制并粘贴下面的完整命令，然后按回车键：<br>
          <div style="background: var(--bg-secondary); padding: 8px; border-radius: 4px; margin: 8px 0; font-family: monospace;">
            corepack pnpm bdd pairing approve ${safeCode}
          </div>
          4. 终端提示成功后，在这个网页再发一次消息即可。
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
        setTokenUsageRunning(payload?.status === "running");
      }
      return true;
    }

    if (event === "token.usage") {
      updateTokenUsage(payload);
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
      queueGoalUpdateEvent(payload);
      return true;
    }

    if (event === "subtask.update") {
      onSubtaskUpdated?.(payload);
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
