import { renderDoctorObservabilityCards } from "./doctor-observability.js";
import {
  ASSISTANT_MODE_PRESET_CUSTOM,
  applyAssistantModePreset,
  applyAssistantModeSettingsConfig,
  collectAssistantModeSettingsUpdates,
  readAssistantModeSettingsFromRefs,
  resolveAssistantModePreset,
} from "./assistant-mode-settings-config.js";
import { applyAssistantModeSettingsViewModel } from "./assistant-mode-settings-view-model.js";

export function createSettingsController({
  refs,
  isConnected,
  sendReq,
  makeId,
  setStatus,
  loadServerConfig,
  invalidateServerConfigCache,
  syncAttachmentLimitsFromConfig,
  onToggle,
  getConnectionAuthMode,
  onApprovePairing,
  onPairingRequired,
  onOpenCommunityConfig,
  onModelCatalogChanged,
  onOpenContinuationAction,
  redactedPlaceholder = "[REDACTED]",
  t = (_key, _params, fallback) => fallback ?? "",
}) {
  const {
    settingsModal,
    openSettingsBtn,
    closeSettingsBtn,
    saveSettingsBtn,
    restartBtn,
    doctorStatusEl,
    cfgApiKey,
    cfgBaseUrl,
    cfgModel,
    cfgModelPreferredProviders,
    refreshModelFallbackConfigBtn,
    modelFallbackConfigMeta,
    cfgModelFallbackContent,
    cfgAssistantModeEnabled,
    cfgAssistantModePreset,
    cfgExternalOutboundRequireConfirmation,
    cfgAssistantExternalDeliveryPreference,
    cfgHeartbeat,
    cfgHeartbeatEnabled,
    cfgHeartbeatActiveHours,
    cfgBrowserRelayEnabled,
    cfgRelayPort,
    cfgMcpEnabled,
    cfgCronEnabled,
    cfgEmbeddingEnabled,
    cfgEmbeddingApiKey,
    cfgEmbeddingBaseUrl,
    cfgEmbeddingModel,
    cfgToolsEnabled,
    cfgAgentToolControlMode,
    cfgAgentToolControlConfirmPassword,
    cfgTtsEnabled,
    cfgTtsProvider,
    cfgTtsVoice,
    cfgTtsOpenAIBaseUrl,
    cfgTtsOpenAIApiKey,
    cfgDashScopeApiKey,
    cfgFacetAnchor,
    cfgInjectAgents,
    cfgInjectSoul,
    cfgInjectMemory,
    cfgMaxSystemPromptChars,
    cfgMaxHistory,
    pairingPendingList,
    cfgConversationKindMain,
    cfgConversationKindSubtask,
    cfgConversationKindGoal,
    cfgConversationKindHeartbeat,
    channelsSettingsSection,
    openCommunityConfigBtn,
    cfgCommunityApiEnabled,
    cfgCommunityApiToken,
    cfgFeishuAppId,
    cfgFeishuAppSecret,
    cfgFeishuAgentId,
    cfgQqAppId,
    cfgQqAppSecret,
    cfgQqAgentId,
    cfgQqSandbox,
    cfgDiscordEnabled,
    cfgDiscordBotToken,
    refreshChannelSecurityBtn,
    channelSecurityConfigMeta,
    cfgChannelSecurityContent,
    channelReplyChunkingConfigMeta,
    cfgChannelReplyChunkingContent,
    channelSecurityPendingList,
    assistantModeConfigTitleEl,
    assistantModeConfigHelpEl,
    assistantModeConfigHintEl,
  } = refs;
  const assistantModeRefs = {
    cfgAssistantModeEnabled,
    cfgExternalOutboundRequireConfirmation,
    cfgAssistantExternalDeliveryPreference,
    cfgHeartbeat,
    cfgHeartbeatEnabled,
    cfgHeartbeatActiveHours,
    cfgCronEnabled,
  };
  const aliyunApiKeyTargets = [
    "DASHSCOPE_API_KEY",
    "BELLDANDY_COMPACTION_API_KEY",
    "BELLDANDY_MEMORY_EVOLUTION_API_KEY",
    "BELLDANDY_MEMORY_SUMMARY_API_KEY",
    "BELLDANDY_EMBEDDING_OPENAI_API_KEY",
  ];
  let lastLoadedConfig = null;
  let lastLoadedChannelSecurityContent = '{\n  "version": 1,\n  "channels": {}\n}\n';
  let lastLoadedChannelReplyChunkingContent = '{\n  "version": 1,\n  "channels": {}\n}\n';
  let doctorRequestVersion = 0;
  const conversationKindCheckboxes = {
    main: cfgConversationKindMain,
    subtask: cfgConversationKindSubtask,
    goal: cfgConversationKindGoal,
    heartbeat: cfgConversationKindHeartbeat,
  };
  function readCurrentAssistantModeSettings() {
    return readAssistantModeSettingsFromRefs(assistantModeRefs);
  }

  function applyAssistantModeCopy(options = {}) {
    return applyAssistantModeSettingsViewModel({
      assistantModeConfigTitleEl,
      assistantModeConfigHelpEl,
      assistantModeConfigHintEl,
      cfgAssistantModePreset,
    }, t, options);
  }

  function syncAssistantModeForm(options = {}) {
    const settings = applyAssistantModeSettingsConfig(
      assistantModeRefs,
      collectAssistantModeSettingsUpdates(assistantModeRefs, options),
    );
    applyAssistantModeCopy({ settings });
    return settings;
  }

  function extractPairingRequiredPayload(res) {
    if (!res || res.ok !== false || res.error?.code !== "pairing_required") {
      return null;
    }
    const message = typeof res.error?.message === "string" && res.error.message.trim()
      ? res.error.message.trim()
      : "Pairing required.";
    const codeMatch = message.match(/Code:\s*([A-Z0-9-]+)/i);
    return {
      code: codeMatch ? codeMatch[1] : "",
      message,
    };
  }

  function handlePairingRequiredResponse(res) {
    const payload = extractPairingRequiredPayload(res);
    if (!payload) return false;
    onPairingRequired?.(payload);
    applyAssistantModeCopy({
      pairingRequired: true,
      settings: readCurrentAssistantModeSettings(),
    });
    return true;
  }

  applyAssistantModeCopy();
  if (cfgAssistantModePreset && typeof cfgAssistantModePreset.addEventListener === "function") {
    cfgAssistantModePreset.addEventListener("change", () => {
      const presetKey = cfgAssistantModePreset.value || ASSISTANT_MODE_PRESET_CUSTOM;
      if (presetKey !== ASSISTANT_MODE_PRESET_CUSTOM) {
        const settings = applyAssistantModePreset(assistantModeRefs, presetKey);
        applyAssistantModeCopy({
          settings,
          currentPreset: presetKey,
        });
        return;
      }
      applyAssistantModeCopy({
        settings: readCurrentAssistantModeSettings(),
        currentPreset: resolveAssistantModePreset(readCurrentAssistantModeSettings()),
      });
    });
  }
  if (cfgAssistantModeEnabled && typeof cfgAssistantModeEnabled.addEventListener === "function") {
    cfgAssistantModeEnabled.addEventListener("change", () => {
      syncAssistantModeForm({
        applyEnabledDefaults: cfgAssistantModeEnabled.checked === true,
      });
    });
  }
  for (const inputEl of [cfgHeartbeatEnabled, cfgCronEnabled]) {
    if (!inputEl || typeof inputEl.addEventListener !== "function") continue;
    inputEl.addEventListener("change", () => {
      const settings = applyAssistantModeSettingsConfig(
        assistantModeRefs,
        collectAssistantModeSettingsUpdates(assistantModeRefs, {
          useDriverState: true,
          applyEnabledDefaults: false,
        }),
      );
      applyAssistantModeCopy({ settings });
    });
  }
  for (const inputEl of [
    cfgExternalOutboundRequireConfirmation,
    cfgAssistantExternalDeliveryPreference,
    cfgHeartbeat,
    cfgHeartbeatActiveHours,
  ]) {
    if (!inputEl || typeof inputEl.addEventListener !== "function") continue;
    inputEl.addEventListener("change", () => {
      applyAssistantModeCopy({
        settings: readCurrentAssistantModeSettings(),
      });
    });
  }

  function loadConversationAllowedKinds(rawValue) {
    const defaultKinds = ["main", "subtask", "goal", "heartbeat"];
    const normalized = typeof rawValue === "string" ? rawValue.trim().toLowerCase() : "";
    const kinds = !normalized || normalized === "all"
      ? defaultKinds
      : normalized === "none"
        ? []
      : normalized.split(",").map((item) => item.trim()).filter(Boolean);
    Object.entries(conversationKindCheckboxes).forEach(([kind, inputEl]) => {
      if (!inputEl) return;
      inputEl.checked = kinds.includes(kind);
    });
  }

  function serializeConversationAllowedKinds() {
    const kinds = Object.entries(conversationKindCheckboxes)
      .filter(([, inputEl]) => Boolean(inputEl?.checked))
      .map(([kind]) => kind)
      .join(",");
    return kinds || "none";
  }

  if (openSettingsBtn) {
    openSettingsBtn.addEventListener("click", () => {
      void toggle(true);
    });
  }
  if (closeSettingsBtn) {
    closeSettingsBtn.addEventListener("click", () => {
      void toggle(false);
    });
  }
  if (saveSettingsBtn) {
    saveSettingsBtn.addEventListener("click", () => {
      void saveConfig();
    });
  }
  if (restartBtn) {
    restartBtn.addEventListener("click", () => {
      void restartServer();
    });
  }
  if (openCommunityConfigBtn) {
    openCommunityConfigBtn.addEventListener("click", () => {
      void openCommunityConfig();
    });
  }
  if (refreshModelFallbackConfigBtn) {
    refreshModelFallbackConfigBtn.addEventListener("click", () => {
      void loadModelFallbackConfig();
    });
  }
  if (refreshChannelSecurityBtn) {
    refreshChannelSecurityBtn.addEventListener("click", () => {
      void loadChannelSecuritySurface();
    });
  }
  if (channelSecurityPendingList) {
    channelSecurityPendingList.addEventListener("click", (event) => {
      const target = event.target instanceof HTMLElement ? event.target.closest("button[data-channel-security-action]") : null;
      if (!target) return;
      const action = target.getAttribute("data-channel-security-action");
      const requestId = target.getAttribute("data-channel-security-request-id");
      if (!action || !requestId) return;
      void handleChannelSecurityPendingAction(action, requestId, target);
    });
  }
  if (pairingPendingList) {
    pairingPendingList.addEventListener("click", (event) => {
      const target = event.target instanceof HTMLElement ? event.target.closest("button[data-pairing-action]") : null;
      if (!target) return;
      const action = target.getAttribute("data-pairing-action");
      const code = target.getAttribute("data-pairing-code");
      if (action !== "approve" || !code) return;
      void handlePairingPendingAction(code, target);
    });
  }
  async function toggle(show, options = {}) {
    if (!settingsModal) return;
    if (show) {
      settingsModal.classList.remove("hidden");
      onToggle?.(true);
      if (!options.skipLoad) {
        await loadConfig();
        await Promise.all([
          loadModelFallbackConfig(),
          loadChannelSecuritySurface(),
          runDoctor(),
        ]);
      }
      if (options.section === "channels" && channelsSettingsSection) {
        channelsSettingsSection.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (options.section === "pairing-pending" && pairingPendingList) {
        pairingPendingList.scrollIntoView({ behavior: "smooth", block: "start" });
      } else if (options.section === "channel-security-pending" && channelSecurityPendingList) {
        channelSecurityPendingList.scrollIntoView({ behavior: "smooth", block: "start" });
      }
      return;
    }
    onToggle?.(false);
    settingsModal.classList.add("hidden");
  }

  async function loadConfig() {
    if (!isConnected()) return;
    const c = await loadServerConfig?.();
    if (!c) return;
    lastLoadedConfig = c;
    syncAttachmentLimitsFromConfig(c);
    cfgApiKey.value = c["BELLDANDY_OPENAI_API_KEY"] || "";
    cfgBaseUrl.value = c["BELLDANDY_OPENAI_BASE_URL"] || "";
    cfgModel.value = c["BELLDANDY_OPENAI_MODEL"] || "";
    if (cfgModelPreferredProviders) {
      cfgModelPreferredProviders.value = c["BELLDANDY_MODEL_PREFERRED_PROVIDERS"] || "";
    }
    const assistantModeSettings = applyAssistantModeSettingsConfig({
      cfgAssistantModeEnabled,
      cfgAssistantModePreset,
      cfgExternalOutboundRequireConfirmation,
      cfgAssistantExternalDeliveryPreference,
      cfgHeartbeat,
      cfgHeartbeatEnabled,
      cfgHeartbeatActiveHours,
      cfgCronEnabled,
    }, c);
    applyAssistantModeCopy({ settings: assistantModeSettings });
    cfgBrowserRelayEnabled.checked = c["BELLDANDY_BROWSER_RELAY_ENABLED"] === "true";
    cfgRelayPort.value = c["BELLDANDY_RELAY_PORT"] || "";
    cfgMcpEnabled.checked = c["BELLDANDY_MCP_ENABLED"] === "true";
    cfgEmbeddingEnabled.checked = c["BELLDANDY_EMBEDDING_ENABLED"] === "true";
    cfgEmbeddingApiKey.value = c["BELLDANDY_EMBEDDING_OPENAI_API_KEY"] || "";
    cfgEmbeddingBaseUrl.value = c["BELLDANDY_EMBEDDING_OPENAI_BASE_URL"] || "";
    cfgEmbeddingModel.value = c["BELLDANDY_EMBEDDING_MODEL"] || "";
    cfgToolsEnabled.checked = c["BELLDANDY_TOOLS_ENABLED"] === "true";
    cfgAgentToolControlMode.value = c["BELLDANDY_AGENT_TOOL_CONTROL_MODE"] || "disabled";
    cfgAgentToolControlConfirmPassword.value = c["BELLDANDY_AGENT_TOOL_CONTROL_CONFIRM_PASSWORD"] || "";
    cfgTtsEnabled.checked = c["BELLDANDY_TTS_ENABLED"] === "true";
    cfgTtsProvider.value = c["BELLDANDY_TTS_PROVIDER"] || "edge";
    cfgTtsVoice.value = c["BELLDANDY_TTS_VOICE"] || "";
    cfgTtsOpenAIBaseUrl.value = c["BELLDANDY_TTS_OPENAI_BASE_URL"] || "";
    cfgTtsOpenAIApiKey.value = c["BELLDANDY_TTS_OPENAI_API_KEY"] || "";
    cfgDashScopeApiKey.value = aliyunApiKeyTargets
      .map((key) => c[key] || "")
      .find((value) => value) || "";
    cfgFacetAnchor.value = c["BELLDANDY_FACET_ANCHOR"] || "";
    cfgInjectAgents.checked = c["BELLDANDY_INJECT_AGENTS"] === "true";
    cfgInjectSoul.checked = c["BELLDANDY_INJECT_SOUL"] === "true";
    cfgInjectMemory.checked = c["BELLDANDY_INJECT_MEMORY"] === "true";
    cfgMaxSystemPromptChars.value = c["BELLDANDY_MAX_SYSTEM_PROMPT_CHARS"] || "";
    cfgMaxHistory.value = c["BELLDANDY_MAX_HISTORY"] || "";
    loadConversationAllowedKinds(c["BELLDANDY_CONVERSATION_ALLOWED_KINDS"]);
    if (cfgCommunityApiEnabled) cfgCommunityApiEnabled.checked = c["BELLDANDY_COMMUNITY_API_ENABLED"] === "true";
    if (cfgCommunityApiToken) cfgCommunityApiToken.value = c["BELLDANDY_COMMUNITY_API_TOKEN"] || "";
    if (cfgFeishuAppId) cfgFeishuAppId.value = c["BELLDANDY_FEISHU_APP_ID"] || "";
    if (cfgFeishuAppSecret) cfgFeishuAppSecret.value = c["BELLDANDY_FEISHU_APP_SECRET"] || "";
    if (cfgFeishuAgentId) cfgFeishuAgentId.value = c["BELLDANDY_FEISHU_AGENT_ID"] || "";
    if (cfgQqAppId) cfgQqAppId.value = c["BELLDANDY_QQ_APP_ID"] || "";
    if (cfgQqAppSecret) cfgQqAppSecret.value = c["BELLDANDY_QQ_APP_SECRET"] || "";
    if (cfgQqAgentId) cfgQqAgentId.value = c["BELLDANDY_QQ_AGENT_ID"] || "";
    if (cfgQqSandbox) cfgQqSandbox.checked = c["BELLDANDY_QQ_SANDBOX"] !== "false";
    if (cfgDiscordEnabled) cfgDiscordEnabled.checked = c["BELLDANDY_DISCORD_ENABLED"] === "true";
    if (cfgDiscordBotToken) cfgDiscordBotToken.value = c["BELLDANDY_DISCORD_BOT_TOKEN"] || "";
  }

  async function loadModelFallbackConfig() {
    if (!isConnected()) return;
    const configRes = await sendReq({ type: "req", id: makeId(), method: "models.config.get" });

    if (cfgModelFallbackContent && configRes?.ok) {
      const content = typeof configRes.payload?.content === "string"
        ? configRes.payload.content
        : '{\n  "fallbacks": []\n}\n';
      cfgModelFallbackContent.value = content;
    }
    if (modelFallbackConfigMeta) {
      if (configRes?.ok) {
        modelFallbackConfigMeta.textContent = t(
          "settings.modelFallbackConfigMeta",
          { path: configRes.payload?.path || "models.json" },
          `配置文件：${configRes.payload?.path || "models.json"}`,
        );
      } else if (handlePairingRequiredResponse(configRes)) {
        modelFallbackConfigMeta.textContent = t(
          "settings.modelFallbackConfigPairingRequired",
          {},
          "当前会话尚未完成 Pairing，完成批准后再读取模型 fallback 配置。",
        );
      } else {
        modelFallbackConfigMeta.textContent = t(
          "settings.modelFallbackConfigLoadFailed",
          {},
          "读取模型 fallback 配置失败",
        );
      }
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function formatDateTime(value) {
    if (!value) return "-";
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return String(value);
    return date.toLocaleString();
  }

  function renderChannelSecurityPending(pending = []) {
    if (!channelSecurityPendingList) return;
    if (!Array.isArray(pending) || pending.length === 0) {
      channelSecurityPendingList.innerHTML = `<div class="memory-viewer-empty">${escapeHtml(t("settings.channelSecurityPendingEmpty", {}, "当前没有待审批 sender。"))}</div>`;
      return;
    }
    channelSecurityPendingList.innerHTML = pending.map((item) => `
      <div class="memory-detail-card">
        <span class="memory-detail-label">${escapeHtml(`${item.channel}${item.accountId ? `/${item.accountId}` : ""}:${item.senderId}`)}</span>
        <div class="memory-detail-text">${escapeHtml(item.senderName || "-")}</div>
        <div class="memory-list-item-meta">
          <span>${escapeHtml(item.chatId || "-")}</span>
          <span>${escapeHtml(formatDateTime(item.updatedAt || item.requestedAt))}</span>
          <span>${escapeHtml(`seen ${Number(item.seenCount || 0)}`)}</span>
        </div>
        ${item.messagePreview ? `<div class="memory-list-item-snippet">${escapeHtml(item.messagePreview)}</div>` : ""}
        <div class="goal-detail-actions goal-checkpoint-actions">
          <button type="button" class="button goal-inline-action" data-channel-security-action="approve" data-channel-security-request-id="${escapeHtml(item.id)}">${escapeHtml(t("settings.channelSecurityApprove", {}, "批准"))}</button>
          <button type="button" class="button goal-inline-action-secondary" data-channel-security-action="reject" data-channel-security-request-id="${escapeHtml(item.id)}">${escapeHtml(t("settings.channelSecurityReject", {}, "拒绝"))}</button>
        </div>
      </div>
    `).join("");
  }

  function renderPairingPending(pending = []) {
    if (!pairingPendingList) return;
    if (!Array.isArray(pending) || pending.length === 0) {
      pairingPendingList.innerHTML = `<div class="memory-viewer-empty">${escapeHtml(t("settings.pairingPendingEmpty", {}, "当前没有待批准的配对码。"))}</div>`;
      return;
    }
    pairingPendingList.innerHTML = pending.map((item) => `
      <div class="memory-detail-card">
        <span class="memory-detail-label">Pairing Code: ${escapeHtml(item.code || "-")}</span>
        <div class="memory-detail-text">${escapeHtml(item.message || t("settings.pairingPendingDefaultMessage", {}, "当前 WebChat 会话需要完成配对批准。"))}</div>
        <div class="memory-list-item-meta">
          <span>${escapeHtml(item.clientId || "-")}</span>
          <span>${escapeHtml(formatDateTime(item.updatedAt))}</span>
        </div>
        <div class="goal-detail-actions goal-checkpoint-actions">
          <button type="button" class="button goal-inline-action" data-pairing-action="approve" data-pairing-code="${escapeHtml(item.code || "")}">${escapeHtml(t("settings.pairingApprove", {}, "批准"))}</button>
        </div>
      </div>
    `).join("");
  }

  async function loadChannelSecurityConfig() {
    if (!isConnected()) return;
    const configRes = await sendReq({ type: "req", id: makeId(), method: "channel.security.get" });

    if (cfgChannelSecurityContent && configRes?.ok) {
      const content = typeof configRes.payload?.content === "string"
        ? configRes.payload.content
        : '{\n  "version": 1,\n  "channels": {}\n}\n';
      cfgChannelSecurityContent.value = content;
      lastLoadedChannelSecurityContent = content;
    }
    if (channelSecurityConfigMeta) {
      if (configRes?.ok) {
        channelSecurityConfigMeta.textContent = t(
          "settings.channelSecurityMeta",
          { path: configRes.payload?.path || "channel-security.json" },
          `配置文件：${configRes.payload?.path || "channel-security.json"}`,
        );
      } else if (handlePairingRequiredResponse(configRes)) {
        channelSecurityConfigMeta.textContent = t(
          "settings.channelSecurityPairingRequired",
          {},
          "当前会话尚未完成 Pairing，完成批准后再读取渠道安全配置。",
        );
      } else {
        channelSecurityConfigMeta.textContent = t("settings.channelSecurityLoadFailed", {}, "读取渠道安全配置失败");
      }
    }
  }

  async function loadChannelReplyChunkingConfig() {
    if (!isConnected()) return;
    const configRes = await sendReq({ type: "req", id: makeId(), method: "channel.reply_chunking.get" });

    if (cfgChannelReplyChunkingContent && configRes?.ok) {
      const content = typeof configRes.payload?.content === "string"
        ? configRes.payload.content
        : '{\n  "version": 1,\n  "channels": {}\n}\n';
      cfgChannelReplyChunkingContent.value = content;
      lastLoadedChannelReplyChunkingContent = content;
    }
    if (channelReplyChunkingConfigMeta) {
      if (configRes?.ok) {
        channelReplyChunkingConfigMeta.textContent = t(
          "settings.channelReplyChunkingMeta",
          { path: configRes.payload?.path || "channel-reply-chunking.json" },
          `配置文件：${configRes.payload?.path || "channel-reply-chunking.json"}`,
        );
      } else if (handlePairingRequiredResponse(configRes)) {
        channelReplyChunkingConfigMeta.textContent = t(
          "settings.channelReplyChunkingPairingRequired",
          {},
          "当前会话尚未完成 Pairing，完成批准后再读取渠道回复分段配置。",
        );
      } else {
        channelReplyChunkingConfigMeta.textContent = t("settings.channelReplyChunkingLoadFailed", {}, "读取渠道回复分段配置失败");
      }
    }
  }

  async function loadChannelSecurityPendingList() {
    if (!isConnected()) return;
    const pendingRes = await sendReq({ type: "req", id: makeId(), method: "channel.security.pending.list" });
    renderChannelSecurityPending(pendingRes?.ok ? pendingRes.payload?.pending : []);
  }

  async function loadChannelSecuritySurface() {
    if (!isConnected()) return;
    await Promise.all([
      loadChannelSecurityConfig(),
      loadChannelReplyChunkingConfig(),
      loadChannelSecurityPendingList(),
    ]);
  }

  async function saveChannelSecurityConfig() {
    if (!cfgChannelSecurityContent) return { ok: true };
    const content = cfgChannelSecurityContent.value || '{\n  "version": 1,\n  "channels": {}\n}\n';
    const res = await sendReq({
      type: "req",
      id: makeId(),
      method: "channel.security.update",
      params: { content },
    });
    if (!res?.ok) {
      return {
        ok: false,
        message: res?.error?.message || "Failed to save channel security config",
      };
    }
    const nextContent = typeof res.payload?.content === "string" ? res.payload.content : content;
    cfgChannelSecurityContent.value = nextContent;
    lastLoadedChannelSecurityContent = nextContent;
    if (channelSecurityConfigMeta) {
      channelSecurityConfigMeta.textContent = t(
        "settings.channelSecurityMeta",
        { path: res.payload?.path || "channel-security.json" },
        `配置文件：${res.payload?.path || "channel-security.json"}`,
      );
    }
    return { ok: true };
  }

  async function saveModelFallbackConfig() {
    if (!cfgModelFallbackContent) return { ok: true };
    const content = cfgModelFallbackContent.value || '{\n  "fallbacks": []\n}\n';
    const res = await sendReq({
      type: "req",
      id: makeId(),
      method: "models.config.update",
      params: { content },
    });
    if (!res?.ok) {
      return {
        ok: false,
        message: res?.error?.message || "Failed to save model fallback config",
      };
    }
    const nextContent = typeof res.payload?.content === "string" ? res.payload.content : content;
    cfgModelFallbackContent.value = nextContent;
    if (modelFallbackConfigMeta) {
      modelFallbackConfigMeta.textContent = t(
        "settings.modelFallbackConfigMeta",
        { path: res.payload?.path || "models.json" },
        `配置文件：${res.payload?.path || "models.json"}`,
      );
    }
    return { ok: true };
  }

  async function saveChannelReplyChunkingConfig() {
    if (!cfgChannelReplyChunkingContent) return { ok: true };
    const content = cfgChannelReplyChunkingContent.value || '{\n  "version": 1,\n  "channels": {}\n}\n';
    const res = await sendReq({
      type: "req",
      id: makeId(),
      method: "channel.reply_chunking.update",
      params: { content },
    });
    if (!res?.ok) {
      return {
        ok: false,
        message: res?.error?.message || "Failed to save channel reply chunking config",
      };
    }
    const nextContent = typeof res.payload?.content === "string" ? res.payload.content : content;
    cfgChannelReplyChunkingContent.value = nextContent;
    lastLoadedChannelReplyChunkingContent = nextContent;
    if (channelReplyChunkingConfigMeta) {
      channelReplyChunkingConfigMeta.textContent = t(
        "settings.channelReplyChunkingMeta",
        { path: res.payload?.path || "channel-reply-chunking.json" },
        `配置文件：${res.payload?.path || "channel-reply-chunking.json"}`,
      );
    }
    return { ok: true };
  }

  async function handleChannelSecurityPendingAction(action, requestId, buttonEl) {
    if (!isConnected()) return;
    const originalText = buttonEl.textContent;
    buttonEl.disabled = true;
    buttonEl.textContent = t("settings.channelSecurityProcessing", {}, "处理中...");
    const method = action === "approve" ? "channel.security.approve" : "channel.security.reject";
    const res = await sendReq({
      type: "req",
      id: makeId(),
      method,
      params: { requestId },
    });
    if (!res?.ok) {
      buttonEl.disabled = false;
      buttonEl.textContent = originalText;
      alert(t("settings.channelSecurityActionFailed", { message: res?.error?.message || "Unknown error" }, "渠道安全审批操作失败：{message}"));
      return;
    }
    await loadChannelSecuritySurface();
    await runDoctor({ forceRefresh: true });
  }

  async function handlePairingPendingAction(code, buttonEl) {
    if (!isConnected()) return;
    if (typeof onApprovePairing !== "function") return;
    const originalText = buttonEl.textContent;
    buttonEl.disabled = true;
    buttonEl.textContent = t("settings.pairingProcessing", {}, "处理中...");
    const res = await onApprovePairing(code);
    if (!res?.ok) {
      buttonEl.disabled = false;
      buttonEl.textContent = originalText;
      alert(t("settings.pairingApproveFailed", { message: res?.message || "Unknown error" }, "配对批准失败：{message}"));
    }
  }

  function assignSecretUpdate(updates, key, inputEl) {
    if (!inputEl) return;
    const value = inputEl.value.trim();
    if (value === redactedPlaceholder) return;
    updates[key] = value;
  }

  function assignSecretUpdates(updates, keys, inputEl) {
    if (!Array.isArray(keys)) return;
    keys.forEach((key) => assignSecretUpdate(updates, key, inputEl));
  }

  const doctorToggleBtn = document.getElementById("doctorToggleBtn");
  if (doctorToggleBtn) {
    doctorToggleBtn.addEventListener("click", () => {
      if (doctorStatusEl) doctorStatusEl.classList.toggle("hidden");
    });
  }

  function renderDoctorPayload(payload, options = {}) {
    if (!doctorStatusEl || !doctorToggleBtn || !payload?.checks) return false;
    let hasFail = false;
    let hasWarn = false;
    doctorStatusEl.innerHTML = "";

    const doctorPerformance = payload.performance;
    if (doctorPerformance && Number.isFinite(Number(doctorPerformance.totalMs))) {
      const timingBadge = document.createElement("span");
      timingBadge.className = "badge doctor-summary-badge";
      const stages = Array.isArray(doctorPerformance.stages) ? doctorPerformance.stages : [];
      const slowStages = stages
        .filter((stage) => Number.isFinite(Number(stage?.durationMs)))
        .sort((left, right) => Number(right.durationMs || 0) - Number(left.durationMs || 0))
        .slice(0, 2)
        .map((stage) => `${stage.name}:${Math.round(Number(stage.durationMs || 0))}ms`);
      timingBadge.textContent = slowStages.length > 0
        ? t(
          "settings.doctorTimingSummary",
          { totalMs: Math.round(Number(doctorPerformance.totalMs || 0)), slowStages: slowStages.join(", ") },
          `耗时 ${Math.round(Number(doctorPerformance.totalMs || 0))}ms · ${slowStages.join(", ")}`,
        )
        : t(
          "settings.doctorTiming",
          { totalMs: Math.round(Number(doctorPerformance.totalMs || 0)) },
          `耗时 ${Math.round(Number(doctorPerformance.totalMs || 0))}ms`,
        );
      doctorStatusEl.appendChild(timingBadge);
    }

    if (options.detailPending) {
      const pendingBadge = document.createElement("span");
      pendingBadge.className = "badge doctor-summary-badge";
      pendingBadge.textContent = t(
        "settings.doctorLoadingDetails",
        {},
        "正在加载详细观察项...",
      );
      doctorStatusEl.appendChild(pendingBadge);
    }

    payload.checks.forEach((check) => {
      if (check.status === "fail") {
        hasFail = true;
      } else if (check.status === "warn") {
        hasWarn = true;
      }
      const badge = document.createElement("span");
      badge.className = `badge doctor-summary-badge ${check.status}`;
      badge.textContent = `${check.name}: ${check.message || check.status}`;
      doctorStatusEl.appendChild(badge);
    });

    if (options.includeCards) {
      renderDoctorObservabilityCards(doctorStatusEl, payload, t, {
        onOpenContinuationAction,
      });
    }

    if (hasFail) {
      doctorToggleBtn.className = "button badge fail";
      doctorToggleBtn.textContent = t("settings.doctorHasIssues", {}, "存在未通过的检查");
    } else if (hasWarn) {
      doctorToggleBtn.className = "button badge warn";
      doctorToggleBtn.textContent = t("settings.doctorHasWarnings", {}, "存在需关注项");
    } else {
      doctorToggleBtn.className = "button badge pass";
      doctorToggleBtn.textContent = t("settings.doctorAllPassed", {}, "所有检查通过");
    }

    return true;
  }

  async function loadDoctorDetails(version, requestParams = {}) {
    const res = await sendReq({
      type: "req",
      id: makeId(),
      method: "system.doctor",
      params: {
        ...requestParams,
        surface: "full",
      },
    });
    if (version !== doctorRequestVersion || !doctorStatusEl) {
      return;
    }
    if (res?.ok && res.payload?.checks) {
      renderDoctorPayload(res.payload, { includeCards: true });
      return;
    }
    const badge = document.createElement("span");
    badge.className = "badge doctor-summary-badge warn";
    badge.textContent = t(
      "settings.doctorDetailLoadFailed",
      {},
      "详细观察项加载失败，当前显示的是摘要结果。",
    );
    doctorStatusEl.appendChild(badge);
  }

  async function runDoctor(options = {}) {
    if (!doctorStatusEl || !doctorToggleBtn) return;
    const version = ++doctorRequestVersion;
    doctorToggleBtn.className = "button button-muted badge";
    doctorToggleBtn.innerHTML = `<span data-i18n="settings.doctorChecking">${t("settings.doctorChecking", {}, "检查中...")}</span>`;
    doctorStatusEl.innerHTML = "";
    
    if (!isConnected()) {
      doctorToggleBtn.className = "button badge fail";
      doctorToggleBtn.innerHTML = `<span data-i18n="settings.doctorDisconnected">${t("settings.doctorDisconnected", {}, "Disconnected")}</span>`;
      return;
    }

    const requestParams = options.forceRefresh === true ? { forceRefresh: true } : {};
    const res = await sendReq({
      type: "req",
      id: makeId(),
      method: "system.doctor",
      params: {
        ...requestParams,
        surface: "summary",
      },
    });
    if (version !== doctorRequestVersion) {
      return;
    }
    if (res && res.ok && res.payload && res.payload.checks) {
      renderDoctorPayload(res.payload, {
        includeCards: false,
        detailPending: true,
      });
      void loadDoctorDetails(version, requestParams);
      return;
    }
    if (handlePairingRequiredResponse(res)) {
      doctorToggleBtn.className = "button badge warn";
      doctorToggleBtn.textContent = t("settings.doctorPairingRequired", {}, "等待配对批准");
      const badge = document.createElement("span");
      badge.className = "badge doctor-summary-badge warn";
      badge.textContent = t(
        "settings.doctorPairingRequiredHelp",
        {},
        "系统检查依赖已完成 Pairing 的当前 WebChat 会话；请先批准配对码后再重试。",
      );
      doctorStatusEl.appendChild(badge);
      return;
    }
    doctorToggleBtn.className = "button badge fail";
    doctorToggleBtn.innerHTML = `<span data-i18n="settings.doctorCheckFailed">${t("settings.doctorCheckFailed", {}, "Check Failed")}</span>`;
  }

  async function saveConfig() {
    if (!isConnected()) {
      alert(t("settings.notConnectedError", {}, "Error: Not connected to server.\nPlease refresh the page or check if the Gateway is running."));
      return;
    }
    if (saveSettingsBtn) {
      saveSettingsBtn.textContent = t("settings.saving", {}, "Saving...");
      saveSettingsBtn.disabled = true;
    }

    const updates = {};
    const mainApiKey = cfgApiKey.value.trim();
    assignSecretUpdate(updates, "BELLDANDY_OPENAI_API_KEY", cfgApiKey);
    updates["BELLDANDY_OPENAI_BASE_URL"] = cfgBaseUrl.value.trim() || "https://api.openai.com/v1";
    updates["BELLDANDY_OPENAI_MODEL"] = cfgModel.value.trim();
    if (cfgModelPreferredProviders) {
      updates["BELLDANDY_MODEL_PREFERRED_PROVIDERS"] = cfgModelPreferredProviders.value.trim();
    }
    Object.assign(updates, collectAssistantModeSettingsUpdates({
      cfgAssistantModeEnabled,
      cfgExternalOutboundRequireConfirmation,
      cfgAssistantExternalDeliveryPreference,
      cfgHeartbeat,
      cfgHeartbeatEnabled,
      cfgHeartbeatActiveHours,
      cfgCronEnabled,
    }, {
      applyEnabledDefaults: true,
    }));
    updates["BELLDANDY_BROWSER_RELAY_ENABLED"] = cfgBrowserRelayEnabled.checked ? "true" : "false";
    updates["BELLDANDY_RELAY_PORT"] = cfgRelayPort.value.trim();
    updates["BELLDANDY_MCP_ENABLED"] = cfgMcpEnabled.checked ? "true" : "false";
    updates["BELLDANDY_EMBEDDING_ENABLED"] = cfgEmbeddingEnabled.checked ? "true" : "false";
    assignSecretUpdate(updates, "BELLDANDY_EMBEDDING_OPENAI_API_KEY", cfgEmbeddingApiKey);
    updates["BELLDANDY_EMBEDDING_OPENAI_BASE_URL"] = cfgEmbeddingBaseUrl.value.trim();
    updates["BELLDANDY_EMBEDDING_MODEL"] = cfgEmbeddingModel.value.trim();
    updates["BELLDANDY_TOOLS_ENABLED"] = cfgToolsEnabled.checked ? "true" : "false";
    updates["BELLDANDY_AGENT_TOOL_CONTROL_MODE"] = cfgAgentToolControlMode.value.trim() || "disabled";
    assignSecretUpdate(updates, "BELLDANDY_AGENT_TOOL_CONTROL_CONFIRM_PASSWORD", cfgAgentToolControlConfirmPassword);
    updates["BELLDANDY_TTS_ENABLED"] = cfgTtsEnabled.checked ? "true" : "false";
    updates["BELLDANDY_TTS_PROVIDER"] = cfgTtsProvider.value.trim() || "edge";
    updates["BELLDANDY_TTS_VOICE"] = cfgTtsVoice.value.trim();
    updates["BELLDANDY_TTS_OPENAI_BASE_URL"] = cfgTtsOpenAIBaseUrl.value.trim();
    assignSecretUpdate(updates, "BELLDANDY_TTS_OPENAI_API_KEY", cfgTtsOpenAIApiKey);
    assignSecretUpdates(updates, aliyunApiKeyTargets, cfgDashScopeApiKey);
    updates["BELLDANDY_FACET_ANCHOR"] = cfgFacetAnchor.value.trim();
    updates["BELLDANDY_INJECT_AGENTS"] = cfgInjectAgents.checked ? "true" : "false";
    updates["BELLDANDY_INJECT_SOUL"] = cfgInjectSoul.checked ? "true" : "false";
    updates["BELLDANDY_INJECT_MEMORY"] = cfgInjectMemory.checked ? "true" : "false";
    updates["BELLDANDY_MAX_SYSTEM_PROMPT_CHARS"] = cfgMaxSystemPromptChars.value.trim();
    updates["BELLDANDY_MAX_HISTORY"] = cfgMaxHistory.value.trim();
    updates["BELLDANDY_CONVERSATION_ALLOWED_KINDS"] = serializeConversationAllowedKinds();
    if (cfgCommunityApiEnabled) updates["BELLDANDY_COMMUNITY_API_ENABLED"] = cfgCommunityApiEnabled.checked ? "true" : "false";
    assignSecretUpdate(updates, "BELLDANDY_COMMUNITY_API_TOKEN", cfgCommunityApiToken);
    if (cfgFeishuAppId) updates["BELLDANDY_FEISHU_APP_ID"] = cfgFeishuAppId.value.trim();
    assignSecretUpdate(updates, "BELLDANDY_FEISHU_APP_SECRET", cfgFeishuAppSecret);
    if (cfgFeishuAgentId) updates["BELLDANDY_FEISHU_AGENT_ID"] = cfgFeishuAgentId.value.trim();
    if (cfgQqAppId) updates["BELLDANDY_QQ_APP_ID"] = cfgQqAppId.value.trim();
    assignSecretUpdate(updates, "BELLDANDY_QQ_APP_SECRET", cfgQqAppSecret);
    if (cfgQqAgentId) updates["BELLDANDY_QQ_AGENT_ID"] = cfgQqAgentId.value.trim();
    if (cfgQqSandbox) updates["BELLDANDY_QQ_SANDBOX"] = cfgQqSandbox.checked ? "true" : "false";
    if (cfgDiscordEnabled) updates["BELLDANDY_DISCORD_ENABLED"] = cfgDiscordEnabled.checked ? "true" : "false";
    assignSecretUpdate(updates, "BELLDANDY_DISCORD_BOT_TOKEN", cfgDiscordBotToken);

    if (mainApiKey && mainApiKey !== redactedPlaceholder) {
      updates["BELLDANDY_AGENT_PROVIDER"] = "openai";
    }

    const effectiveAuthMode = String(
      lastLoadedConfig?.BELLDANDY_AUTH_MODE
      ?? getConnectionAuthMode?.()
      ?? "none",
    ).trim().toLowerCase();
    if (updates.BELLDANDY_COMMUNITY_API_ENABLED === "true" && effectiveAuthMode === "none") {
      if (saveSettingsBtn) {
        saveSettingsBtn.textContent = t("settings.failed", {}, "Failed");
        saveSettingsBtn.disabled = false;
      }
      alert(t(
        "settings.communityApiRequiresAuth",
        {},
        "Community API cannot be used with AUTH_MODE=none. Switch to token or password first.",
      ));
      return;
    }

    const modelFallbackSave = await saveModelFallbackConfig();
    if (!modelFallbackSave.ok) {
      if (saveSettingsBtn) {
        saveSettingsBtn.textContent = t("settings.failed", {}, "Failed");
        saveSettingsBtn.disabled = false;
      }
      alert(t(
        "settings.modelFallbackConfigSaveFailed",
        { message: modelFallbackSave.message || "Unknown error" },
        "Model fallback config save failed: {message}",
      ));
      return;
    }

    const channelSecuritySave = await saveChannelSecurityConfig();
    if (!channelSecuritySave.ok) {
      if (saveSettingsBtn) {
        saveSettingsBtn.textContent = t("settings.failed", {}, "Failed");
        saveSettingsBtn.disabled = false;
      }
      alert(t(
        "settings.channelSecuritySaveFailed",
        { message: channelSecuritySave.message || "Unknown error" },
        "Channel security save failed: {message}",
      ));
      return;
    }

    const channelReplyChunkingSave = await saveChannelReplyChunkingConfig();
    if (!channelReplyChunkingSave.ok) {
      if (saveSettingsBtn) {
        saveSettingsBtn.textContent = t("settings.failed", {}, "Failed");
        saveSettingsBtn.disabled = false;
      }
      alert(t(
        "settings.channelReplyChunkingSaveFailed",
        { message: channelReplyChunkingSave.message || "Unknown error" },
        "Channel reply chunking save failed: {message}",
      ));
      return;
    }

    const res = await sendReq({
      type: "req",
      id: makeId(),
      method: "config.update",
      params: { updates },
    });

    if (res && res.ok) {
      invalidateServerConfigCache?.();
      await onModelCatalogChanged?.();
      if (saveSettingsBtn) {
        saveSettingsBtn.textContent = t("settings.saved", {}, "Saved");
      }

      const restartResult = await restartServer({
        confirmRestart: false,
        reason: "settings updated",
        showAlertOnFailure: false,
      });
      if (restartResult.ok) {
        if (saveSettingsBtn) {
          saveSettingsBtn.textContent = t("settings.restartingStatus", {}, "Restarting...");
        }
        return;
      }

      if (saveSettingsBtn) {
        saveSettingsBtn.textContent = t("settings.save", {}, "Save");
        saveSettingsBtn.disabled = false;
      }
      alert(t(
        "settings.configSavedAutoRestartFailed",
        { message: restartResult.message || "Unknown error" },
        "Configuration saved, but automatic restart failed: {message}. Please restart the server manually.",
      ));
      return;
    }

    if (saveSettingsBtn) {
      saveSettingsBtn.textContent = t("settings.failed", {}, "Failed");
      saveSettingsBtn.disabled = false;
    }
    alert(t("settings.saveFailed", { message: res?.error ? res.error.message : "Unknown error" }, "Save failed: {message}"));
  }

  async function restartServer(options = {}) {
    const {
      confirmRestart = true,
      reason = "",
      showAlertOnFailure = true,
    } = options;
    if (confirmRestart && !confirm(t("settings.restartConfirm", {}, "Are you sure you want to restart the server?"))) {
      return { ok: false, cancelled: true };
    }
    if (!isConnected()) {
      return {
        ok: false,
        message: t("settings.notConnectedError", {}, "Error: Not connected to server.\nPlease refresh the page or check if the Gateway is running."),
      };
    }
    const res = await sendReq({
      type: "req",
      id: makeId(),
      method: "system.restart",
      params: typeof reason === "string" && reason.trim() ? { reason: reason.trim() } : {},
    });
    if (res?.ok) {
      setStatus(t("settings.restartingStatus", {}, "Restarting..."));
      return { ok: true };
    }
    const message = res?.error?.message || "Unknown error";
    if (showAlertOnFailure) {
      alert(t("settings.restartFailed", { message }, `Restart failed: ${message}`));
    }
    return { ok: false, message };
  }

  async function openCommunityConfig() {
    if (typeof onOpenCommunityConfig !== "function") return;
    await toggle(false);
    onOpenCommunityConfig();
  }

  return {
    toggle,
    renderPairingPending,
    loadConfig,
    saveConfig,
    markPairingRequired() {
      applyAssistantModeCopy({
        pairingRequired: true,
        settings: readCurrentAssistantModeSettings(),
      });
    },
    openPairingPending(options = {}) {
      return toggle(true, { section: "pairing-pending", skipLoad: options.skipLoad === true });
    },
    openChannels() {
      return toggle(true, { section: "channels" });
    },
    openChannelSecurityPending() {
      return toggle(true, { section: "channel-security-pending" });
    },
    refreshChannelSecurityPending() {
      return loadChannelSecurityPendingList();
    },
  };
}
