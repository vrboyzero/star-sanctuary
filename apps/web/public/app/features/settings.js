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
  } = refs;

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

  async function toggle(show) {
    if (!settingsModal) return;
    if (show) {
      settingsModal.classList.remove("hidden");
      onToggle?.(true);
      await loadConfig();
      await runDoctor();
      return;
    }
    onToggle?.(false);
    settingsModal.classList.add("hidden");
  }

  async function loadConfig() {
    if (!isConnected()) return;
    const c = await loadServerConfig?.();
    if (!c) return;
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
  }

  function assignSecretUpdate(updates, key, inputEl) {
    if (!inputEl) return;
    const value = inputEl.value.trim();
    if (value === redactedPlaceholder) return;
    updates[key] = value;
  }

  async function runDoctor() {
    if (!doctorStatusEl) return;
    if (!isConnected()) {
      doctorStatusEl.innerHTML = `<span class="badge fail">${t("settings.doctorDisconnected", {}, "Disconnected")}</span>`;
      return;
    }
    doctorStatusEl.innerHTML = `<span class="badge">${t("settings.doctorChecking", {}, "Checking...")}</span>`;

    const res = await sendReq({ type: "req", id: makeId(), method: "system.doctor" });
    if (res && res.ok && res.payload && res.payload.checks) {
      doctorStatusEl.innerHTML = "";
      res.payload.checks.forEach((check) => {
        const badge = document.createElement("span");
        badge.className = `badge ${check.status}`;
        badge.textContent = `${check.name}: ${check.message || check.status}`;
        doctorStatusEl.appendChild(badge);
      });
      return;
    }
    doctorStatusEl.innerHTML = `<span class="badge fail">${t("settings.doctorCheckFailed", {}, "Check Failed")}</span>`;
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

    if (mainApiKey && mainApiKey !== redactedPlaceholder) {
      updates["BELLDANDY_AGENT_PROVIDER"] = "openai";
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

  return {
    toggle,
  };
}
