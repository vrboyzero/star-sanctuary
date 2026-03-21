export function createChatEventsFeature({
  appendMessage,
  showRestartCountdown,
  setTokenUsageRunning,
  updateTokenUsage,
  showTaskTokenResult,
  queueGoalUpdateEvent,
  onToolSettingsConfirmRequired,
  onToolSettingsConfirmResolved,
  onToolsConfigUpdated,
  stripThinkBlocks,
  configureMarkedOnce,
  parseMarkdown,
  sanitizeAssistantHtml,
  processMediaInMessage,
  forceScrollToBottom,
  getCanvasApp,
  escapeHtml,
}) {
  let botMessageEl = null;
  let botRawHtmlBuffer = "";

  function resetStreamingState() {
    botMessageEl = null;
    botRawHtmlBuffer = "";
  }

  function beginStreamingReply() {
    resetStreamingState();
    return ensureBotMessage();
  }

  function ensureBotMessage() {
    if (!botMessageEl) {
      botMessageEl = appendMessage("bot", "");
      botRawHtmlBuffer = "";
    }
    return botMessageEl;
  }

  function renderStreamingMarkdown(rawText) {
    const target = ensureBotMessage();
    botRawHtmlBuffer = rawText;
    const strippedText = stripThinkBlocks(botRawHtmlBuffer);
    configureMarkedOnce();
    const parsedHtml = parseMarkdown(strippedText);
    target.innerHTML = sanitizeAssistantHtml(parsedHtml);
    return target;
  }

  function autoplayAssistantAudio(target) {
    const audioEl = target?.querySelector("audio");
    if (!audioEl) return;
    audioEl.play().catch((err) => {
      console.warn("Auto-play blocked:", err);
    });
  }

  function handleEvent(event, payload) {
    if (event === "pairing.required") {
      const code = payload && payload.code ? String(payload.code) : "";
      const safeCode = escapeHtml?.(code) || code;
      const target = ensureBotMessage();
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
      if (payload && payload.status === "restarting" && payload.countdown !== undefined) {
        showRestartCountdown(payload.countdown, payload.reason || "");
      }
      setTokenUsageRunning(payload?.status === "running");
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

    if (event === "goal.update") {
      queueGoalUpdateEvent(payload);
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

    if (event === "tools.config.updated") {
      onToolsConfigUpdated(payload);
      return true;
    }

    if (event === "chat.delta") {
      const delta = payload && payload.delta ? String(payload.delta) : "";
      if (!delta) return true;
      renderStreamingMarkdown(botRawHtmlBuffer + delta);
      forceScrollToBottom();
      return true;
    }

    if (event === "chat.final") {
      const text = payload && payload.text ? String(payload.text) : "";
      const target = renderStreamingMarkdown(text);
      processMediaInMessage(target);
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
      getCanvasApp()?.handleReactEvent("tool_call", payload);
      return true;
    }

    if (event === "tool_result") {
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
