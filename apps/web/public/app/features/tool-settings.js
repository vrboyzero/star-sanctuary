export function createToolSettingsController({
  refs,
  isConnected,
  sendReq,
  makeId,
  clientId,
  getSelectedAgentId,
  getActiveConversationId,
  getSelectedSubtaskId,
  isSubtasksViewActive,
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

  function normalizeBuiltinContract(contract) {
    if (!contract || typeof contract !== "object") return null;
    const safeScopes = Array.isArray(contract.safeScopes)
      ? contract.safeScopes.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    const channels = Array.isArray(contract.channels)
      ? contract.channels.map((item) => String(item || "").trim()).filter(Boolean)
      : [];
    return {
      family: contract.family ? String(contract.family) : "",
      riskLevel: contract.riskLevel ? String(contract.riskLevel) : "",
      channels,
      safeScopes,
      needsPermission: contract.needsPermission === true,
      isReadOnly: contract.isReadOnly === true,
      isConcurrencySafe: contract.isConcurrencySafe === true,
      activityDescription: contract.activityDescription ? String(contract.activityDescription) : "",
      outputPersistencePolicy: contract.outputPersistencePolicy ? String(contract.outputPersistencePolicy) : "",
    };
  }

  function normalizeVisibility(entry) {
    if (!entry || typeof entry !== "object") return null;
    return {
      available: entry.available !== false,
      reasonCode: entry.reasonCode ? String(entry.reasonCode) : "available",
      reasonMessage: entry.reasonMessage ? String(entry.reasonMessage) : "",
      alwaysEnabled: entry.alwaysEnabled === true,
      contractReason: entry.contractReason ? String(entry.contractReason) : "",
    };
  }

  function normalizeToolControlState(entry) {
    if (!entry || typeof entry !== "object") return null;
    const pending = entry.pendingRequest && typeof entry.pendingRequest === "object"
      ? {
        requestId: entry.pendingRequest.requestId ? String(entry.pendingRequest.requestId) : "",
        conversationId: entry.pendingRequest.conversationId ? String(entry.pendingRequest.conversationId) : "",
        requestedByAgentId: entry.pendingRequest.requestedByAgentId ? String(entry.pendingRequest.requestedByAgentId) : "",
        expiresAt: Number(entry.pendingRequest.expiresAt || 0),
        summary: Array.isArray(entry.pendingRequest.summary)
          ? entry.pendingRequest.summary.map((item) => String(item || "").trim()).filter(Boolean)
          : [],
        passwordApproved: entry.pendingRequest.passwordApproved === true,
      }
      : null;
    return {
      mode: entry.mode ? String(entry.mode) : "disabled",
      requiresConfirmation: entry.requiresConfirmation === true,
      hasConfirmPassword: entry.hasConfirmPassword === true,
      pendingRequest: pending,
    };
  }

  function formatContractFamilyLabel(family) {
    const labels = {
      "network-read": t("toolSettings.familyNetworkRead", {}, "Network Read"),
      "workspace-read": t("toolSettings.familyWorkspaceRead", {}, "Workspace Read"),
      "workspace-write": t("toolSettings.familyWorkspaceWrite", {}, "Workspace Write"),
      patch: t("toolSettings.familyPatch", {}, "Patch"),
      "command-exec": t("toolSettings.familyCommandExec", {}, "Command Exec"),
      "process-control": t("toolSettings.familyProcessControl", {}, "Process Control"),
      "session-orchestration": t("toolSettings.familySession", {}, "Session"),
      memory: t("toolSettings.familyMemory", {}, "Memory"),
      browser: t("toolSettings.familyBrowser", {}, "Browser"),
      "service-admin": t("toolSettings.familyServiceAdmin", {}, "Service Admin"),
      "goal-governance": t("toolSettings.familyGoal", {}, "Goal Governance"),
      other: t("toolSettings.familyOther", {}, "Other"),
    };
    return labels[family] || family || t("toolSettings.familyUnknown", {}, "Unknown");
  }

  function formatContractRiskLabel(riskLevel) {
    const labels = {
      low: t("toolSettings.riskLow", {}, "Low Risk"),
      medium: t("toolSettings.riskMedium", {}, "Medium Risk"),
      high: t("toolSettings.riskHigh", {}, "High Risk"),
      critical: t("toolSettings.riskCritical", {}, "Critical Risk"),
    };
    return labels[riskLevel] || riskLevel || t("toolSettings.riskUnknown", {}, "Unknown Risk");
  }

  function formatContractScopeLabel(scope) {
    const labels = {
      "local-safe": t("toolSettings.scopeLocalSafe", {}, "Local Safe"),
      "web-safe": t("toolSettings.scopeWebSafe", {}, "Web Safe"),
      "bridge-safe": t("toolSettings.scopeBridgeSafe", {}, "Bridge Safe"),
      "remote-safe": t("toolSettings.scopeRemoteSafe", {}, "Remote Safe"),
      privileged: t("toolSettings.scopePrivileged", {}, "Privileged"),
    };
    return labels[scope] || scope;
  }

  function formatContractChannelLabel(channel) {
    const labels = {
      gateway: t("toolSettings.channelGateway", {}, "Gateway"),
      web: t("toolSettings.channelWeb", {}, "Web"),
      cli: t("toolSettings.channelCli", {}, "CLI"),
      "browser-extension": t("toolSettings.channelBrowserExtension", {}, "Browser Extension"),
    };
    return labels[channel] || channel;
  }

  function renderContractBadge(label, className = "") {
    return `<span class="tool-contract-badge${className ? ` ${className}` : ""}">${escapeHtml(label)}</span>`;
  }

  function formatVisibilityLabel(reasonCode) {
    const labels = {
      available: t("toolSettings.visibilityAvailable", {}, "Visible in Current Context"),
      "blocked-by-security-matrix": t("toolSettings.visibilityBlockedByMatrix", {}, "Blocked by Security Matrix"),
      "unsupported-channel": t("toolSettings.visibilityUnsupportedChannel", {}, "Blocked by Channel"),
      "outside-safe-scope": t("toolSettings.visibilityOutsideSafeScope", {}, "Blocked by Safe Scope"),
      "missing-contract": t("toolSettings.visibilityMissingContract", {}, "Missing Contract"),
      "disabled-by-settings": t("toolSettings.visibilityDisabledBySettings", {}, "Disabled by Settings"),
      "not-in-agent-whitelist": t("toolSettings.visibilityAgentWhitelist", {}, "Blocked by Agent Whitelist"),
      "conversation-restricted": t("toolSettings.visibilityConversationRestricted", {}, "Blocked by Conversation Scope"),
      "excluded-by-launch-toolset": t("toolSettings.visibilityExcludedByLaunchToolset", {}, "Excluded by Launch Toolset"),
      "blocked-by-launch-role-policy": t("toolSettings.visibilityBlockedByLaunchRolePolicy", {}, "Blocked by Launch Role Policy"),
      "blocked-by-launch-permission-mode": t("toolSettings.visibilityBlockedByLaunchPermission", {}, "Blocked by Launch Permission Mode"),
      "not-eligible": t("toolSettings.visibilityNotEligible", {}, "Not Eligible"),
    };
    return labels[reasonCode] || reasonCode || t("toolSettings.visibilityUnknown", {}, "Unknown Visibility");
  }

  function renderVisibilitySummary(visibility) {
    if (!visibility) return "";
    const badges = [
      renderContractBadge(
        formatVisibilityLabel(visibility.reasonCode),
        visibility.available ? "visibility-available" : "visibility-blocked",
      ),
    ];
    if (visibility.alwaysEnabled) {
      badges.push(renderContractBadge(t("toolSettings.visibilityAlwaysEnabled", {}, "Always Enabled"), "visibility-always-enabled"));
    }
    return `
      <div class="tool-visibility-badges">${badges.join("")}</div>
      ${visibility.reasonMessage ? `<span class="tool-visibility-reason">${escapeHtml(visibility.reasonMessage)}</span>` : ""}
    `;
  }

  function renderToolControlState(toolControl, visibilityContext) {
    if (!toolControl) return "";
    const contextParts = [
      `${t("toolSettings.contextAgent", {}, "Agent")}: ${visibilityContext?.agentId || "default"}`,
      `${t("toolSettings.contextConversation", {}, "Conversation")}: ${visibilityContext?.conversationId || t("toolSettings.contextConversationNone", {}, "None")}`,
    ];
    if (visibilityContext?.taskId) {
      contextParts.push(`${t("toolSettings.contextTask", {}, "Subtask")}: ${visibilityContext.taskId}`);
    }
    const modeText = toolControl.mode === "confirm"
      ? t("toolSettings.toolControlModeConfirm", {}, "Confirm")
      : toolControl.mode === "auto"
        ? t("toolSettings.toolControlModeAuto", {}, "Auto")
        : t("toolSettings.toolControlModeDisabled", {}, "Disabled");
    const details = [
      `${t("toolSettings.toolControlModeLabel", {}, "Tool Control")}: ${modeText}`,
      toolControl.requiresConfirmation
        ? (
          toolControl.hasConfirmPassword
            ? t("toolSettings.toolControlConfirmPassword", {}, "Confirmation is enabled and currently uses a password/approval secret.")
            : t("toolSettings.toolControlConfirmUi", {}, "Confirmation is enabled and current requests should be approved through the UI flow.")
        )
        : t("toolSettings.toolControlNoConfirm", {}, "Confirmation is not required for tool switch changes in the current mode."),
    ];
    if (toolControl.pendingRequest?.requestId) {
      details.push(
        t(
          "toolSettings.toolControlPending",
          { requestId: toolControl.pendingRequest.requestId },
          `Pending confirmation request: ${toolControl.pendingRequest.requestId}`,
        ),
      );
      for (const line of toolControl.pendingRequest.summary || []) {
        details.push(line);
      }
    }
    const launchSpec = visibilityContext?.launchSpec && typeof visibilityContext.launchSpec === "object"
      ? visibilityContext.launchSpec
      : null;
    const runtimeLines = launchSpec
      ? [
        t("toolSettings.runtimeScoped", {}, "Visibility is currently evaluated using the selected subtask launch runtime."),
        `${t("toolSettings.runtimeRole", {}, "Launch Role")}: ${launchSpec.role || "-"}`,
        `${t("toolSettings.runtimeRolePolicy", {}, "Role Policy")}: ${launchSpec.policySummary || "-"}`,
        `${t("toolSettings.runtimePermissionMode", {}, "Permission Mode")}: ${launchSpec.permissionMode || "-"}`,
        `${t("toolSettings.runtimeIsolationMode", {}, "Isolation")}: ${launchSpec.isolationMode || "-"}`,
        `${t("toolSettings.runtimeLaunchCwd", {}, "Launch CWD")}: ${launchSpec.cwd || "-"}`,
        `${t("toolSettings.runtimeResolvedCwd", {}, "Resolved CWD")}: ${launchSpec.resolvedCwd || launchSpec.cwd || "-"}`,
        `${t("toolSettings.runtimeWorktreeStatus", {}, "Worktree")}: ${launchSpec.worktreeStatus || "-"}`,
        `${t("toolSettings.runtimeWorktreePath", {}, "Worktree Path")}: ${launchSpec.worktreePath || "-"}`,
        `${t("toolSettings.runtimeToolSet", {}, "Tool Set")}: ${Array.isArray(launchSpec.toolSet) && launchSpec.toolSet.length ? launchSpec.toolSet.join(", ") : "-"}`,
        `${t("toolSettings.runtimeAllowedFamilies", {}, "Allowed Families")}: ${Array.isArray(launchSpec.allowedToolFamilies) && launchSpec.allowedToolFamilies.length ? launchSpec.allowedToolFamilies.join(", ") : "-"}`,
        `${t("toolSettings.runtimeMaxRisk", {}, "Max Risk")}: ${launchSpec.maxToolRiskLevel || "-"}`,
      ]
      : [];
    return `
      <div class="tool-settings-context">${escapeHtml(contextParts.join(" · "))}</div>
      <div class="tool-settings-policy-note">${details.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}</div>
      ${runtimeLines.length > 0
        ? `<div class="tool-settings-policy-note">${runtimeLines.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}</div>`
        : ""}
    `;
  }

  function renderBuiltinContractDetails(contract) {
    if (!contract) return "";
    const badges = [
      renderContractBadge(formatContractFamilyLabel(contract.family), "family"),
      renderContractBadge(formatContractRiskLabel(contract.riskLevel), `risk-${contract.riskLevel || "unknown"}`),
      renderContractBadge(
        contract.isReadOnly
          ? t("toolSettings.modeReadOnly", {}, "Read-only")
          : t("toolSettings.modeWritesState", {}, "Writes State"),
        contract.isReadOnly ? "mode-read" : "mode-write",
      ),
      renderContractBadge(
        contract.needsPermission
          ? t("toolSettings.permissionRequired", {}, "Permission Required")
          : t("toolSettings.permissionNotRequired", {}, "No Extra Permission"),
        contract.needsPermission ? "permission-needed" : "permission-free",
      ),
      renderContractBadge(
        contract.outputPersistencePolicy
          ? `${t("toolSettings.outputLabel", {}, "Output")}: ${contract.outputPersistencePolicy}`
          : t("toolSettings.outputLabel", {}, "Output"),
      ),
    ];
    const scopeText = contract.safeScopes.length > 0
      ? contract.safeScopes.map(formatContractScopeLabel).join(", ")
      : t("toolSettings.scopeUnknown", {}, "Unknown");
    const channelText = contract.channels.length > 0
      ? contract.channels.map(formatContractChannelLabel).join(", ")
      : t("toolSettings.channelUnknown", {}, "Unknown");
    const concurrencyText = contract.isConcurrencySafe
      ? t("toolSettings.concurrentSafe", {}, "Concurrency Safe")
      : t("toolSettings.concurrentSerialized", {}, "Serialized Access");
    return `
      ${contract.activityDescription ? `<span class="tool-contract-desc">${escapeHtml(contract.activityDescription)}</span>` : ""}
      <div class="tool-contract-badges">${badges.join("")}</div>
      <span class="tool-contract-meta">${escapeHtml(
        `${t("toolSettings.scopeLabel", {}, "Scopes")}: ${scopeText} · ${t("toolSettings.channelLabel", {}, "Channels")}: ${channelText} · ${concurrencyText}`,
      )}</span>
    `;
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

    const agentId = typeof getSelectedAgentId === "function" ? String(getSelectedAgentId() || "").trim() : "";
    const conversationId = typeof getActiveConversationId === "function" ? String(getActiveConversationId() || "").trim() : "";
    const taskId = typeof getSelectedSubtaskId === "function" && isSubtasksViewActive?.()
      ? String(getSelectedSubtaskId() || "").trim()
      : "";
    const params = {};
    if (taskId) {
      params.taskId = taskId;
    } else {
      if (agentId) params.agentId = agentId;
      if (conversationId) params.conversationId = conversationId;
    }

    const res = await sendReq({ type: "req", id: makeId(), method: "tools.list", params });
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
    const {
      builtin,
      mcp,
      plugins,
      skills,
      disabled,
      contracts,
      visibility,
      mcpVisibility,
      pluginVisibility,
      skillVisibility,
      visibilityContext,
      toolControl,
    } = toolSettingsData;

    if (toolSettingsActiveTab === "builtin") {
      renderBuiltinTab(
        builtin,
        disabled.builtin || [],
        contracts || {},
        visibility || {},
        visibilityContext || {},
        normalizeToolControlState(toolControl),
      );
    } else if (toolSettingsActiveTab === "mcp") {
      renderMCPTab(mcp, disabled.mcp_servers || [], mcpVisibility || {}, visibilityContext || {}, normalizeToolControlState(toolControl));
    } else if (toolSettingsActiveTab === "skills") {
      renderSkillsTab(skills || [], disabled.skills || [], skillVisibility || {}, visibilityContext || {}, normalizeToolControlState(toolControl));
    } else {
      renderPluginsTab(plugins, disabled.plugins || [], pluginVisibility || {}, visibilityContext || {}, normalizeToolControlState(toolControl));
    }
  }

  function renderBuiltinTab(tools, disabledList, contractsByName, visibilityByName, visibilityContext, toolControl) {
    if (!tools || tools.length === 0) {
      renderEmpty("toolSettings.emptyUnavailable", "Tool system is disabled (BELLDANDY_TOOLS_ENABLED=false)");
      return;
    }
    const disabledSet = new Set(disabledList);
    const enabledCount = tools.length - disabledSet.size;
    let html = `<div class="tool-section-header"><span>${escapeHtml(t("toolSettings.sectionBuiltin", {}, "Built-in Tools"))}</span><span class="tool-section-count">${escapeHtml(t("toolSettings.enabledCount", { enabled: enabledCount, total: tools.length }, `${enabledCount}/${tools.length} enabled`))}</span></div>`;
    html += renderToolControlState(toolControl, visibilityContext);
    for (const name of [...tools].sort((a, b) => String(a).localeCompare(String(b)))) {
      const checked = !disabledSet.has(name);
      const contract = normalizeBuiltinContract(contractsByName ? contractsByName[name] : null);
      const visibility = normalizeVisibility(visibilityByName ? visibilityByName[name] : null);
      html += `<div class="tool-item${checked ? "" : " disabled"}${visibility && !visibility.available ? " unavailable" : ""}">
      <div class="tool-item-info">
        <span class="tool-item-name">${escapeHtml(name)}</span>
        ${renderBuiltinContractDetails(contract)}
        ${renderVisibilitySummary(visibility)}
      </div>
      <label class="toggle-switch">
        <input type="checkbox" data-category="builtin" data-name="${escapeHtml(name)}" ${checked ? "checked" : ""}>
        <span class="toggle-slider"></span>
      </label>
    </div>`;
    }
    toolSettingsBody.innerHTML = html;
    bindToggleEvents();
  }

  function renderMCPTab(mcpServers, disabledList, visibilityByServer, visibilityContext, toolControl) {
    const serverIds = Object.keys(mcpServers || {});
    if (serverIds.length === 0) {
      renderEmpty("toolSettings.emptyNoMcp", "No MCP servers configured");
      return;
    }
    const disabledSet = new Set(disabledList);
    const enabledCount = serverIds.length - disabledSet.size;
    let html = `<div class="tool-section-header"><span>${escapeHtml(t("toolSettings.sectionMcp", {}, "MCP Servers"))}</span><span class="tool-section-count">${escapeHtml(t("toolSettings.enabledCount", { enabled: enabledCount, total: serverIds.length }, `${enabledCount}/${serverIds.length} enabled`))}</span></div>`;
    html += renderToolControlState(toolControl, visibilityContext);
    for (const serverId of serverIds.sort()) {
      const server = mcpServers[serverId];
      const checked = !disabledSet.has(serverId);
      const visibility = normalizeVisibility(visibilityByServer ? visibilityByServer[serverId] : null);
      const toolList = (server.tools || []).map((toolName) => {
        const short = toolName.replace(`mcp_${serverId}_`, "");
        return escapeHtml(short);
      }).join(", ");

      html += `<div class="mcp-group${visibility && !visibility.available ? " unavailable" : ""}">
      <div class="mcp-group-header">
        <span class="mcp-group-name">${escapeHtml(serverId)}</span>
        <label class="toggle-switch">
          <input type="checkbox" data-category="mcp_servers" data-name="${escapeHtml(serverId)}" ${checked ? "checked" : ""}>
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="mcp-group-tools">${toolList || escapeHtml(t("toolSettings.emptyNoTools", {}, "No tools"))}</div>
      ${renderVisibilitySummary(visibility)}
    </div>`;
    }
    toolSettingsBody.innerHTML = html;
    bindToggleEvents();
  }

  function renderPluginsTab(pluginList, disabledList, visibilityByPlugin, visibilityContext, toolControl) {
    if (!pluginList || pluginList.length === 0) {
      renderEmpty("toolSettings.emptyNoPlugins", "No plugins loaded (put .js/.mjs files into ~/.star_sanctuary/plugins/)");
      return;
    }
    const disabledSet = new Set(disabledList);
    const enabledCount = pluginList.length - disabledSet.size;
    let html = `<div class="tool-section-header"><span>${escapeHtml(t("toolSettings.sectionPlugins", {}, "Plugins"))}</span><span class="tool-section-count">${escapeHtml(t("toolSettings.enabledCount", { enabled: enabledCount, total: pluginList.length }, `${enabledCount}/${pluginList.length} enabled`))}</span></div>`;
    html += renderToolControlState(toolControl, visibilityContext);
    for (const name of pluginList.sort()) {
      const checked = !disabledSet.has(name);
      const visibility = normalizeVisibility(visibilityByPlugin ? visibilityByPlugin[name] : null);
      html += `<div class="tool-item${checked ? "" : " disabled"}${visibility && !visibility.available ? " unavailable" : ""}">
      <div class="tool-item-info">
        <span class="tool-item-name">${escapeHtml(name)}</span>
        ${renderVisibilitySummary(visibility)}
      </div>
      <label class="toggle-switch">
        <input type="checkbox" data-category="plugins" data-name="${escapeHtml(name)}" ${checked ? "checked" : ""}>
        <span class="toggle-slider"></span>
      </label>
    </div>`;
    }
    toolSettingsBody.innerHTML = html;
    bindToggleEvents();
  }

  function renderSkillsTab(skillList, disabledList, visibilityBySkill, visibilityContext, toolControl) {
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
    html += renderToolControlState(toolControl, visibilityContext);
    for (const skill of skillList.sort((a, b) => a.name.localeCompare(b.name))) {
      const checked = !disabledSet.has(skill.name);
      const visibility = normalizeVisibility(visibilityBySkill ? visibilityBySkill[skill.name] : null);
      const src = sourceLabel[skill.source] || skill.source;
      const pri = priorityLabel[skill.priority] || skill.priority;
      const tags = (skill.tags || []).map((tag) => `<span class="skill-tag">${escapeHtml(tag)}</span>`).join("");
      html += `<div class="tool-item${checked ? "" : " disabled"}${visibility && !visibility.available ? " unavailable" : ""}">
      <div class="skill-item-info">
        <span class="tool-item-name">${escapeHtml(skill.name)}</span>
        <span class="skill-meta">${src} · ${pri}</span>
        ${skill.description ? `<span class="skill-desc">${escapeHtml(skill.description)}</span>` : ""}
        ${tags ? `<div class="skill-tags">${tags}</div>` : ""}
        ${renderVisibilitySummary(visibility)}
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
