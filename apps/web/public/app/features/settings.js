import { renderDoctorObservabilityCards } from "./doctor-observability.js";

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
  onOpenCommunityConfig,
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
    cfgDashScopeApiKey,
    cfgFacetAnchor,
    cfgInjectAgents,
    cfgInjectSoul,
    cfgInjectMemory,
    cfgMaxSystemPromptChars,
    cfgMaxHistory,
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
    cfgDiscordDefaultChannelId,
  } = refs;
  let lastLoadedConfig = null;
  const conversationKindCheckboxes = {
    main: cfgConversationKindMain,
    subtask: cfgConversationKindSubtask,
    goal: cfgConversationKindGoal,
    heartbeat: cfgConversationKindHeartbeat,
  };

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

  async function toggle(show, options = {}) {
    if (!settingsModal) return;
    if (show) {
      settingsModal.classList.remove("hidden");
      onToggle?.(true);
      await loadConfig();
      await runDoctor();
      if (options.section === "channels" && channelsSettingsSection) {
        channelsSettingsSection.scrollIntoView({ behavior: "smooth", block: "start" });
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
    cfgHeartbeat.value = c["BELLDANDY_HEARTBEAT_INTERVAL"] || "";
    cfgHeartbeatEnabled.checked = c["BELLDANDY_HEARTBEAT_ENABLED"] === "true";
    cfgHeartbeatActiveHours.value = c["BELLDANDY_HEARTBEAT_ACTIVE_HOURS"] || "";
    cfgBrowserRelayEnabled.checked = c["BELLDANDY_BROWSER_RELAY_ENABLED"] === "true";
    cfgRelayPort.value = c["BELLDANDY_RELAY_PORT"] || "";
    cfgMcpEnabled.checked = c["BELLDANDY_MCP_ENABLED"] === "true";
    cfgCronEnabled.checked = c["BELLDANDY_CRON_ENABLED"] === "true";
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
    cfgDashScopeApiKey.value = c["DASHSCOPE_API_KEY"] || "";
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
    if (cfgDiscordDefaultChannelId) cfgDiscordDefaultChannelId.value = c["BELLDANDY_DISCORD_DEFAULT_CHANNEL_ID"] || "";
  }

  function assignSecretUpdate(updates, key, inputEl) {
    if (!inputEl) return;
    const value = inputEl.value.trim();
    if (value === redactedPlaceholder) return;
    updates[key] = value;
  }

  const doctorToggleBtn = document.getElementById("doctorToggleBtn");
  if (doctorToggleBtn) {
    doctorToggleBtn.addEventListener("click", () => {
      if (doctorStatusEl) doctorStatusEl.classList.toggle("hidden");
    });
  }

  async function runDoctor() {
    if (!doctorStatusEl || !doctorToggleBtn) return;
    doctorToggleBtn.className = "button button-muted badge";
    doctorToggleBtn.innerHTML = `<span data-i18n="settings.doctorChecking">${t("settings.doctorChecking", {}, "检查中...")}</span>`;
    doctorStatusEl.innerHTML = "";
    
    if (!isConnected()) {
      doctorToggleBtn.className = "button badge fail";
      doctorToggleBtn.innerHTML = `<span data-i18n="settings.doctorDisconnected">${t("settings.doctorDisconnected", {}, "Disconnected")}</span>`;
      return;
    }

    const res = await sendReq({ type: "req", id: makeId(), method: "system.doctor" });
    if (res && res.ok && res.payload && res.payload.checks) {
      let hasFail = false;
      let hasWarn = false;
      res.payload.checks.forEach((check) => {
        if (check.status === "fail") {
          hasFail = true;
        } else if (check.status === "warn") {
          hasWarn = true;
        }
        const badge = document.createElement("span");
        badge.className = `badge ${check.status}`;
        badge.textContent = `${check.name}: ${check.message || check.status}`;
        doctorStatusEl.appendChild(badge);
      });
      renderDoctorObservabilityCards(doctorStatusEl, res.payload, t);
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
    updates["BELLDANDY_HEARTBEAT_ENABLED"] = cfgHeartbeatEnabled.checked ? "true" : "false";
    updates["BELLDANDY_HEARTBEAT_INTERVAL"] = cfgHeartbeat.value.trim();
    updates["BELLDANDY_HEARTBEAT_ACTIVE_HOURS"] = cfgHeartbeatActiveHours.value.trim();
    updates["BELLDANDY_BROWSER_RELAY_ENABLED"] = cfgBrowserRelayEnabled.checked ? "true" : "false";
    updates["BELLDANDY_RELAY_PORT"] = cfgRelayPort.value.trim();
    updates["BELLDANDY_MCP_ENABLED"] = cfgMcpEnabled.checked ? "true" : "false";
    updates["BELLDANDY_CRON_ENABLED"] = cfgCronEnabled.checked ? "true" : "false";
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
    assignSecretUpdate(updates, "DASHSCOPE_API_KEY", cfgDashScopeApiKey);
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
    if (cfgDiscordDefaultChannelId) updates["BELLDANDY_DISCORD_DEFAULT_CHANNEL_ID"] = cfgDiscordDefaultChannelId.value.trim();

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

    const res = await sendReq({
      type: "req",
      id: makeId(),
      method: "config.update",
      params: { updates },
    });

    if (res && res.ok) {
      invalidateServerConfigCache?.();
      if (saveSettingsBtn) {
        saveSettingsBtn.textContent = t("settings.saved", {}, "Saved");
      }
      setTimeout(() => {
        if (saveSettingsBtn) {
          saveSettingsBtn.textContent = t("settings.save", {}, "Save");
          saveSettingsBtn.disabled = false;
        }
        alert(t("settings.configSavedRestart", {}, "Configuration saved. Please restart server to apply changes."));
      }, 1000);
      return;
    }

    if (saveSettingsBtn) {
      saveSettingsBtn.textContent = t("settings.failed", {}, "Failed");
      saveSettingsBtn.disabled = false;
    }
    alert(t("settings.saveFailed", { message: res?.error ? res.error.message : "Unknown error" }, "Save failed: {message}"));
  }

  async function restartServer() {
    if (!confirm(t("settings.restartConfirm", {}, "Are you sure you want to restart the server?"))) return;
    if (!isConnected()) return;
    await sendReq({ type: "req", id: makeId(), method: "system.restart" });
    setStatus(t("settings.restartingStatus", {}, "Restarting..."));
  }

  async function openCommunityConfig() {
    if (typeof onOpenCommunityConfig !== "function") return;
    await toggle(false);
    onOpenCommunityConfig();
  }

  return {
    toggle,
    openChannels() {
      return toggle(true, { section: "channels" });
    },
  };
}
