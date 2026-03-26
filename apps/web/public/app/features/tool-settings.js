export function createToolSettingsController({
  refs,
  isConnected,
  sendReq,
  makeId,
  clientId,
  escapeHtml,
  showNotice,
  t = (_key, _params, fallback) => fallback ?? "",
}) {
  const {
    toolSettingsConfirmModal,
    toolSettingsConfirmImpactEl,
    toolSettingsConfirmSummaryEl,
    toolSettingsConfirmExpiryEl,
    toolSettingsConfirmApproveBtn,
    toolSettingsConfirmRejectBtn,
    toolSettingsModal,
    openToolSettingsBtn,
    closeToolSettingsBtn,
    saveToolSettingsBtn,
    toolSettingsBody,
    toolTabButtons,
  } = refs;

  let toolSettingsData = null;
  let toolSettingsActiveTab = "builtin";
  let toolSettingsLoadSeq = 0;
  let pendingToolSettingsConfirm = null;
  let toolSettingsConfirmTimer = null;
  let saveButtonState = "default";

  function updateSaveButton() {
    if (!saveToolSettingsBtn) return;
    const map = {
      default: { key: "common.save", fallback: "Save" },
      saving: { key: "toolSettings.saveSaving", fallback: "Saving..." },
      saved: { key: "toolSettings.saveSaved", fallback: "Saved" },
      failed: { key: "toolSettings.saveFailedShort", fallback: "Failed" },
    };
    const entry = map[saveButtonState] || map.default;
    saveToolSettingsBtn.textContent = t(entry.key, {}, entry.fallback);
  }

  function renderEmpty(messageKey, fallback) {
    if (!toolSettingsBody) return;
    toolSettingsBody.innerHTML = `<div class="tool-settings-empty">${escapeHtml(t(messageKey, {}, fallback))}</div>`;
  }

  if (openToolSettingsBtn) {
    openToolSettingsBtn.addEventListener("click", () => {
      void toggle(true);
    });
  }
  if (closeToolSettingsBtn) {
    closeToolSettingsBtn.addEventListener("click", () => {
      void toggle(false);
    });
  }
  if (saveToolSettingsBtn) {
    saveToolSettingsBtn.addEventListener("click", () => {
      void saveToolSettings();
    });
  }
  if (toolSettingsConfirmApproveBtn) {
    toolSettingsConfirmApproveBtn.addEventListener("click", () => {
      void submitToolSettingsConfirm("approve");
    });
  }
  if (toolSettingsConfirmRejectBtn) {
    toolSettingsConfirmRejectBtn.addEventListener("click", () => {
      void submitToolSettingsConfirm("reject");
    });
  }

  for (const tab of toolTabButtons || []) {
    tab.addEventListener("click", () => {
      for (const item of toolTabButtons) {
        item.classList.remove("active");
      }
      tab.classList.add("active");
      toolSettingsActiveTab = tab.dataset.tab;
      renderToolSettingsTab();
    });
  }

  async function toggle(show) {
    if (!toolSettingsModal) return;
    if (show) {
      toolSettingsModal.classList.remove("hidden");
      toolSettingsData = null;
      await loadToolSettings();
      return;
    }
    toolSettingsModal.classList.add("hidden");
  }

  function shouldHandleToolSettingsConfirmPayload(payload) {
    if (!payload || typeof payload !== "object") return false;
    const targetClientId = payload.targetClientId ? String(payload.targetClientId).trim() : "";
    return !targetClientId || targetClientId === clientId;
  }

  function normalizeToolSettingsConfirmPayload(payload) {
    if (!payload || typeof payload !== "object") return null;
    const requestId = payload.requestId ? String(payload.requestId).trim() : "";
    const conversationId = payload.conversationId ? String(payload.conversationId).trim() : "";
    if (!requestId || !conversationId) return null;
    const summary = Array.isArray(payload.summary)
      ? payload.summary.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [];
    return {
      requestId,
      conversationId,
      impact: payload.impact
        ? String(payload.impact)
        : t(
          "toolSettings.confirmImpactDefault",
          {},
          "This is a global tool settings change and will affect other sessions on the current Gateway.",
        ),
      summary,
      expiresAt: Number(payload.expiresAt || 0),
    };
  }

  function setToolSettingsConfirmBusy(busy) {
    if (toolSettingsConfirmApproveBtn) toolSettingsConfirmApproveBtn.disabled = busy;
    if (toolSettingsConfirmRejectBtn) toolSettingsConfirmRejectBtn.disabled = busy;
  }

  function stopToolSettingsConfirmTimer() {
    if (toolSettingsConfirmTimer) {
      clearInterval(toolSettingsConfirmTimer);
      toolSettingsConfirmTimer = null;
    }
  }

  function formatToolSettingsConfirmExpiry(expiresAt) {
    if (!Number.isFinite(expiresAt) || expiresAt <= 0) return "";
    const remainingMs = expiresAt - Date.now();
    if (remainingMs <= 0) return t("toolSettings.confirmExpired", {}, "This confirmation request has expired. Please trigger the tool switch change again.");
    const remainingSec = Math.ceil(remainingMs / 1000);
    if (remainingSec < 60) {
      return t("toolSettings.confirmInSeconds", { seconds: remainingSec }, `Please complete confirmation within ${remainingSec} seconds.`);
    }
    const minutes = Math.floor(remainingSec / 60);
    const seconds = remainingSec % 60;
    return t(
      "toolSettings.confirmInMinutes",
      { minutes, seconds: seconds.toString().padStart(2, "0") },
      `Please complete confirmation within ${minutes}m ${seconds.toString().padStart(2, "0")}s.`,
    );
  }

  function renderToolSettingsConfirmModal() {
    if (!pendingToolSettingsConfirm || !toolSettingsConfirmModal) return;
    if (toolSettingsConfirmImpactEl) {
      toolSettingsConfirmImpactEl.textContent = pendingToolSettingsConfirm.impact;
    }
    if (toolSettingsConfirmSummaryEl) {
      const lines = pendingToolSettingsConfirm.summary.length > 0
        ? pendingToolSettingsConfirm.summary
        : [t("toolSettings.confirmNoSummary", {}, "No displayable change summary was provided for this request.")];
      toolSettingsConfirmSummaryEl.innerHTML = lines
        .map((line) => `<li>${escapeHtml(line)}</li>`)
        .join("");
    }
    if (toolSettingsConfirmExpiryEl) {
      toolSettingsConfirmExpiryEl.textContent = formatToolSettingsConfirmExpiry(pendingToolSettingsConfirm.expiresAt);
    }
  }

  function clearToolSettingsConfirmModal() {
    pendingToolSettingsConfirm = null;
    stopToolSettingsConfirmTimer();
    setToolSettingsConfirmBusy(false);
    if (toolSettingsConfirmModal) toolSettingsConfirmModal.classList.add("hidden");
  }

  function handleConfirmRequired(payload) {
    if (!shouldHandleToolSettingsConfirmPayload(payload)) return;
    const normalized = normalizeToolSettingsConfirmPayload(payload);
    if (!normalized) return;
    pendingToolSettingsConfirm = normalized;
    setToolSettingsConfirmBusy(false);
    renderToolSettingsConfirmModal();
    if (toolSettingsConfirmModal) toolSettingsConfirmModal.classList.remove("hidden");
    stopToolSettingsConfirmTimer();
    toolSettingsConfirmTimer = setInterval(() => {
      if (!pendingToolSettingsConfirm) {
        stopToolSettingsConfirmTimer();
        return;
      }
      renderToolSettingsConfirmModal();
    }, 1000);
  }

  function handleConfirmResolved(payload) {
    if (!shouldHandleToolSettingsConfirmPayload(payload)) return;
    const requestId = payload && payload.requestId ? String(payload.requestId).trim() : "";
    if (!pendingToolSettingsConfirm || pendingToolSettingsConfirm.requestId !== requestId) return;
    const approved = payload && payload.decision === "approved";
    clearToolSettingsConfirmModal();
    showNotice(
      approved
        ? t("toolSettings.noticeConfirmedTitle", {}, "Tool settings confirmed")
        : t("toolSettings.noticeRejectedTitle", {}, "Tool settings rejected"),
      approved
        ? t("toolSettings.noticeConfirmedMessage", {}, "Global tool switch changes have been applied.")
        : t("toolSettings.noticeRejectedMessage", {}, "This tool switch change was rejected."),
      approved ? "success" : "info",
      2600,
    );
  }

  async function submitToolSettingsConfirm(decision) {
    if (!pendingToolSettingsConfirm) return;
    if (!isConnected()) {
      showNotice(
        t("toolSettings.noticeHandleErrorTitle", {}, "Unable to process confirmation"),
        t("toolSettings.noticeNotConnected", {}, "Not connected to the server."),
        "error",
      );
      return;
    }
    setToolSettingsConfirmBusy(true);
    const currentRequest = pendingToolSettingsConfirm;
    const res = await sendReq({
      type: "req",
      id: makeId(),
      method: "tool_settings.confirm",
      params: {
        requestId: currentRequest.requestId,
        conversationId: currentRequest.conversationId,
        decision,
      },
    });
    if (!res || res.ok === false) {
      setToolSettingsConfirmBusy(false);
      showNotice(
        decision === "approve"
          ? t("toolSettings.approveFailedTitle", {}, "Approval failed")
          : t("toolSettings.rejectFailedTitle", {}, "Rejection failed"),
        res?.error?.message || t("toolSettings.requestIncomplete", {}, "Request was not completed."),
        "error",
      );
      if (res?.error?.code === "not_found") {
        clearToolSettingsConfirmModal();
      }
      return;
    }
    clearToolSettingsConfirmModal();
    showNotice(
      decision === "approve"
        ? t("toolSettings.noticeConfirmedTitle", {}, "Tool settings confirmed")
        : t("toolSettings.noticeRejectedTitle", {}, "Tool settings rejected"),
      decision === "approve"
        ? t("toolSettings.noticeConfirmedMessage", {}, "Global tool switch changes have been applied.")
        : t("toolSettings.noticeRejectedMessage", {}, "This tool switch change was rejected."),
      decision === "approve" ? "success" : "info",
      2600,
    );
  }

  async function loadToolSettings() {
    const seq = ++toolSettingsLoadSeq;
    if (!isConnected()) {
      renderEmpty("toolSettings.emptyDisconnected", "Disconnected");
      return;
    }
    renderEmpty("toolSettings.emptyLoading", "Loading...");

    const res = await sendReq({ type: "req", id: makeId(), method: "tools.list" });
    if (seq !== toolSettingsLoadSeq) return;
    if (res && res.ok && res.payload) {
      toolSettingsData = res.payload;
      renderToolSettingsTab();
      return;
    }
    renderEmpty("toolSettings.emptyLoadFailed", "Load failed");
  }

  function renderToolSettingsTab() {
    if (!toolSettingsData) return;
    const { builtin, mcp, plugins, skills, disabled } = toolSettingsData;

    if (toolSettingsActiveTab === "builtin") {
      renderBuiltinTab(builtin, disabled.builtin || []);
    } else if (toolSettingsActiveTab === "mcp") {
      renderMCPTab(mcp, disabled.mcp_servers || []);
    } else if (toolSettingsActiveTab === "skills") {
      renderSkillsTab(skills || [], disabled.skills || []);
    } else {
      renderPluginsTab(plugins, disabled.plugins || []);
    }
  }

  function renderBuiltinTab(tools, disabledList) {
    if (!tools || tools.length === 0) {
      renderEmpty("toolSettings.emptyUnavailable", "Tool system is disabled (BELLDANDY_TOOLS_ENABLED=false)");
      return;
    }
    const disabledSet = new Set(disabledList);
    const enabledCount = tools.length - disabledSet.size;
    let html = `<div class="tool-section-header"><span>${escapeHtml(t("toolSettings.sectionBuiltin", {}, "Built-in Tools"))}</span><span class="tool-section-count">${escapeHtml(t("toolSettings.enabledCount", { enabled: enabledCount, total: tools.length }, `${enabledCount}/${tools.length} enabled`))}</span></div>`;
    for (const name of tools.sort()) {
      const checked = !disabledSet.has(name);
      html += `<div class="tool-item${checked ? "" : " disabled"}">
      <span class="tool-item-name">${escapeHtml(name)}</span>
      <label class="toggle-switch">
        <input type="checkbox" data-category="builtin" data-name="${escapeHtml(name)}" ${checked ? "checked" : ""}>
        <span class="toggle-slider"></span>
      </label>
    </div>`;
    }
    toolSettingsBody.innerHTML = html;
    bindToggleEvents();
  }

  function renderMCPTab(mcpServers, disabledList) {
    const serverIds = Object.keys(mcpServers || {});
    if (serverIds.length === 0) {
      renderEmpty("toolSettings.emptyNoMcp", "No MCP servers configured");
      return;
    }
    const disabledSet = new Set(disabledList);
    const enabledCount = serverIds.length - disabledSet.size;
    let html = `<div class="tool-section-header"><span>${escapeHtml(t("toolSettings.sectionMcp", {}, "MCP Servers"))}</span><span class="tool-section-count">${escapeHtml(t("toolSettings.enabledCount", { enabled: enabledCount, total: serverIds.length }, `${enabledCount}/${serverIds.length} enabled`))}</span></div>`;
    for (const serverId of serverIds.sort()) {
      const server = mcpServers[serverId];
      const checked = !disabledSet.has(serverId);
      const toolList = (server.tools || []).map((toolName) => {
        const short = toolName.replace(`mcp_${serverId}_`, "");
        return escapeHtml(short);
      }).join(", ");

      html += `<div class="mcp-group">
      <div class="mcp-group-header">
        <span class="mcp-group-name">${escapeHtml(serverId)}</span>
        <label class="toggle-switch">
          <input type="checkbox" data-category="mcp_servers" data-name="${escapeHtml(serverId)}" ${checked ? "checked" : ""}>
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="mcp-group-tools">${toolList || escapeHtml(t("toolSettings.emptyNoTools", {}, "No tools"))}</div>
    </div>`;
    }
    toolSettingsBody.innerHTML = html;
    bindToggleEvents();
  }

  function renderPluginsTab(pluginList, disabledList) {
    if (!pluginList || pluginList.length === 0) {
      renderEmpty("toolSettings.emptyNoPlugins", "No plugins loaded (put .js/.mjs files into ~/.star_sanctuary/plugins/)");
      return;
    }
    const disabledSet = new Set(disabledList);
    const enabledCount = pluginList.length - disabledSet.size;
    let html = `<div class="tool-section-header"><span>${escapeHtml(t("toolSettings.sectionPlugins", {}, "Plugins"))}</span><span class="tool-section-count">${escapeHtml(t("toolSettings.enabledCount", { enabled: enabledCount, total: pluginList.length }, `${enabledCount}/${pluginList.length} enabled`))}</span></div>`;
    for (const name of pluginList.sort()) {
      const checked = !disabledSet.has(name);
      html += `<div class="tool-item${checked ? "" : " disabled"}">
      <span class="tool-item-name">${escapeHtml(name)}</span>
      <label class="toggle-switch">
        <input type="checkbox" data-category="plugins" data-name="${escapeHtml(name)}" ${checked ? "checked" : ""}>
        <span class="toggle-slider"></span>
      </label>
    </div>`;
    }
    toolSettingsBody.innerHTML = html;
    bindToggleEvents();
  }

  function renderSkillsTab(skillList, disabledList) {
    if (!skillList || skillList.length === 0) {
      renderEmpty("toolSettings.emptyNoSkills", "No skills loaded (put SKILL.md into ~/.star_sanctuary/skills/)");
      return;
    }
    const disabledSet = new Set(disabledList);
    const enabledCount = skillList.length - disabledSet.size;
    const sourceLabel = {
      bundled: t("toolSettings.sourceBundled", {}, "Bundled"),
      user: t("toolSettings.sourceUser", {}, "User"),
      plugin: t("toolSettings.sourcePlugin", {}, "Plugin"),
    };
    const priorityLabel = {
      always: t("toolSettings.priorityAlways", {}, "Always Inject"),
      high: t("toolSettings.priorityHigh", {}, "High"),
      normal: t("toolSettings.priorityNormal", {}, "Normal"),
      low: t("toolSettings.priorityLow", {}, "Low"),
    };

    let html = `<div class="tool-section-header"><span>${escapeHtml(t("toolSettings.sectionSkills", {}, "Skills"))}</span><span class="tool-section-count">${escapeHtml(t("toolSettings.enabledCount", { enabled: enabledCount, total: skillList.length }, `${enabledCount}/${skillList.length} enabled`))}</span></div>`;
    for (const skill of skillList.sort((a, b) => a.name.localeCompare(b.name))) {
      const checked = !disabledSet.has(skill.name);
      const src = sourceLabel[skill.source] || skill.source;
      const pri = priorityLabel[skill.priority] || skill.priority;
      const tags = (skill.tags || []).map((tag) => `<span class="skill-tag">${escapeHtml(tag)}</span>`).join("");
      html += `<div class="tool-item${checked ? "" : " disabled"}">
      <div class="skill-item-info">
        <span class="tool-item-name">${escapeHtml(skill.name)}</span>
        <span class="skill-meta">${src} · ${pri}</span>
        ${skill.description ? `<span class="skill-desc">${escapeHtml(skill.description)}</span>` : ""}
        ${tags ? `<div class="skill-tags">${tags}</div>` : ""}
      </div>
      <label class="toggle-switch">
        <input type="checkbox" data-category="skills" data-name="${escapeHtml(skill.name)}" ${checked ? "checked" : ""}>
        <span class="toggle-slider"></span>
      </label>
    </div>`;
    }
    toolSettingsBody.innerHTML = html;
    bindToggleEvents();
  }

  function bindToggleEvents() {
    toolSettingsBody.querySelectorAll("input[type=checkbox]").forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        const category = checkbox.dataset.category;
        const name = checkbox.dataset.name;
        if (!toolSettingsData || !category || !name) return;

        const list = toolSettingsData.disabled[category] || [];
        if (checkbox.checked) {
          toolSettingsData.disabled[category] = list.filter((item) => item !== name);
        } else {
          if (!list.includes(name)) list.push(name);
          toolSettingsData.disabled[category] = list;
        }

        const item = checkbox.closest(".tool-item");
        if (item) {
          item.classList.toggle("disabled", !checkbox.checked);
        }
        renderToolSettingsTab();
      });
    });
  }

  async function saveToolSettings() {
    if (!isConnected() || !toolSettingsData) return;
    if (saveToolSettingsBtn) {
      saveButtonState = "saving";
      updateSaveButton();
      saveToolSettingsBtn.disabled = true;
    }

    const res = await sendReq({
      type: "req",
      id: makeId(),
      method: "tools.update",
      params: { disabled: toolSettingsData.disabled },
    });

    if (res && res.ok) {
      if (saveToolSettingsBtn) {
        saveButtonState = "saved";
        updateSaveButton();
      }
      setTimeout(() => {
        if (saveToolSettingsBtn) {
          saveButtonState = "default";
          updateSaveButton();
          saveToolSettingsBtn.disabled = false;
        }
      }, 1500);
      return;
    }

    if (saveToolSettingsBtn) {
      saveButtonState = "failed";
      updateSaveButton();
      saveToolSettingsBtn.disabled = false;
    }
    alert(t("toolSettings.saveFailedAlert", { message: res?.error?.message || t("toolSettings.unknownError", {}, "Unknown error") }, "Save failed: {message}"));
  }

  function handleToolsConfigUpdated(payload) {
    if (toolSettingsModal && !toolSettingsModal.classList.contains("hidden")) {
      void loadToolSettings();
      return;
    }
    if (payload && payload.disabled) {
      if (!toolSettingsData) {
        toolSettingsData = { builtin: [], mcp: {}, plugins: [], skills: [], disabled: payload.disabled };
      } else {
        toolSettingsData.disabled = payload.disabled;
      }
    }
  }

  return {
    refreshLocale() {
      updateSaveButton();
      renderToolSettingsConfirmModal();
      if (toolSettingsData) {
        renderToolSettingsTab();
      }
    },
    toggle,
    handleConfirmRequired,
    handleConfirmResolved,
    handleToolsConfigUpdated,
  };
}
