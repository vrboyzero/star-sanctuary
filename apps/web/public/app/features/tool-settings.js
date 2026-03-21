export function createToolSettingsController({
  refs,
  isConnected,
  sendReq,
  makeId,
  clientId,
  escapeHtml,
  showNotice,
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
        : "这是全局工具设置变更，会影响当前 Gateway 的其他会话。",
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
    if (remainingMs <= 0) return "该确认请求已过期，请重新发起工具开关变更。";
    const remainingSec = Math.ceil(remainingMs / 1000);
    if (remainingSec < 60) return `请在 ${remainingSec} 秒内完成确认。`;
    const minutes = Math.floor(remainingSec / 60);
    const seconds = remainingSec % 60;
    return `请在 ${minutes} 分 ${seconds.toString().padStart(2, "0")} 秒内完成确认。`;
  }

  function renderToolSettingsConfirmModal() {
    if (!pendingToolSettingsConfirm || !toolSettingsConfirmModal) return;
    if (toolSettingsConfirmImpactEl) {
      toolSettingsConfirmImpactEl.textContent = pendingToolSettingsConfirm.impact;
    }
    if (toolSettingsConfirmSummaryEl) {
      const lines = pendingToolSettingsConfirm.summary.length > 0
        ? pendingToolSettingsConfirm.summary
        : ["本次请求未提供可展示的变更摘要。"];
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
      approved ? "工具设置已确认" : "工具设置已拒绝",
      approved ? "全局工具开关变更已应用。" : "本次工具开关变更已拒绝。",
      approved ? "success" : "info",
      2600,
    );
  }

  async function submitToolSettingsConfirm(decision) {
    if (!pendingToolSettingsConfirm) return;
    if (!isConnected()) {
      showNotice("无法处理确认", "当前未连接到服务器。", "error");
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
      showNotice(decision === "approve" ? "确认失败" : "拒绝失败", res?.error?.message || "请求未完成。", "error");
      if (res?.error?.code === "not_found") {
        clearToolSettingsConfirmModal();
      }
      return;
    }
    clearToolSettingsConfirmModal();
    showNotice(
      decision === "approve" ? "工具设置已确认" : "工具设置已拒绝",
      decision === "approve" ? "全局工具开关变更已应用。" : "本次工具开关变更已拒绝。",
      decision === "approve" ? "success" : "info",
      2600,
    );
  }

  async function loadToolSettings() {
    const seq = ++toolSettingsLoadSeq;
    if (!isConnected()) {
      toolSettingsBody.innerHTML = '<div class="tool-settings-empty">未连接</div>';
      return;
    }
    toolSettingsBody.innerHTML = '<div class="tool-settings-empty">加载中...</div>';

    const res = await sendReq({ type: "req", id: makeId(), method: "tools.list" });
    if (seq !== toolSettingsLoadSeq) return;
    if (res && res.ok && res.payload) {
      toolSettingsData = res.payload;
      renderToolSettingsTab();
      return;
    }
    toolSettingsBody.innerHTML = '<div class="tool-settings-empty">加载失败</div>';
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
      toolSettingsBody.innerHTML = '<div class="tool-settings-empty">未启用工具系统 (BELLDANDY_TOOLS_ENABLED=false)</div>';
      return;
    }
    const disabledSet = new Set(disabledList);
    const enabledCount = tools.length - disabledSet.size;
    let html = `<div class="tool-section-header"><span>内置工具</span><span class="tool-section-count">${enabledCount}/${tools.length} 已启用</span></div>`;
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
      toolSettingsBody.innerHTML = '<div class="tool-settings-empty">未配置 MCP 服务器</div>';
      return;
    }
    const disabledSet = new Set(disabledList);
    const enabledCount = serverIds.length - disabledSet.size;
    let html = `<div class="tool-section-header"><span>MCP 服务器</span><span class="tool-section-count">${enabledCount}/${serverIds.length} 已启用</span></div>`;
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
      <div class="mcp-group-tools">${toolList || "无工具"}</div>
    </div>`;
    }
    toolSettingsBody.innerHTML = html;
    bindToggleEvents();
  }

  function renderPluginsTab(pluginList, disabledList) {
    if (!pluginList || pluginList.length === 0) {
      toolSettingsBody.innerHTML = '<div class="tool-settings-empty">未加载插件（将 .js/.mjs 文件放入 ~/.star_sanctuary/plugins/ 目录）</div>';
      return;
    }
    const disabledSet = new Set(disabledList);
    const enabledCount = pluginList.length - disabledSet.size;
    let html = `<div class="tool-section-header"><span>插件</span><span class="tool-section-count">${enabledCount}/${pluginList.length} 已启用</span></div>`;
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
      toolSettingsBody.innerHTML = '<div class="tool-settings-empty">未加载技能（将 SKILL.md 放入 ~/.star_sanctuary/skills/ 目录）</div>';
      return;
    }
    const disabledSet = new Set(disabledList);
    const enabledCount = skillList.length - disabledSet.size;
    const sourceLabel = { bundled: "内置", user: "用户", plugin: "插件" };
    const priorityLabel = { always: "始终注入", high: "高优先", normal: "普通", low: "低优先" };

    let html = `<div class="tool-section-header"><span>技能</span><span class="tool-section-count">${enabledCount}/${skillList.length} 已启用</span></div>`;
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
      saveToolSettingsBtn.textContent = "保存中...";
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
        saveToolSettingsBtn.textContent = "已保存";
      }
      setTimeout(() => {
        if (saveToolSettingsBtn) {
          saveToolSettingsBtn.textContent = "保存";
          saveToolSettingsBtn.disabled = false;
        }
      }, 1500);
      return;
    }

    if (saveToolSettingsBtn) {
      saveToolSettingsBtn.textContent = "失败";
      saveToolSettingsBtn.disabled = false;
    }
    alert(`保存失败: ${res?.error?.message || "未知错误"}`);
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
    toggle,
    handleConfirmRequired,
    handleConfirmResolved,
    handleToolsConfigUpdated,
  };
}
