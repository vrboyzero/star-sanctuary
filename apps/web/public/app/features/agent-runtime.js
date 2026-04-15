import { buildResidentPanelSummary } from "./resident-observability-summary.js";
import { buildAgentWorkSummary } from "./agent-work-summary.js";

function getElementsByDataValue(root, attribute, expectedValue) {
  if (!root || !attribute || !expectedValue) return [];
  return [...root.querySelectorAll(`[${attribute}]`)]
    .filter((node) => node.getAttribute(attribute) === expectedValue);
}

export function createAgentRuntimeFeature({
  refs,
  agentCatalog,
  residentAgentRosterEnabled,
  storageKey = "selected-agent-id",
  initialIdentity = {},
  agentSessionCacheFeature,
  sendReq,
  makeId,
  getHttpAuthHeaders,
  getActiveConversationId,
  setActiveConversationId,
  renderCanvasGoalContext,
  switchMode,
  getChatEventsFeature,
  getSessionDigestFeature,
  renderConversationMessages,
  loadConversationMeta,
  refreshMemoryViewerForAgentSwitch,
  getSubtasksState,
  openSubtaskBySession,
  openSubtaskById,
  loadSubtasks,
  getGoalsState,
  loadGoals,
  resumeGoal,
  getMemoryViewerState,
  switchMemoryViewerTab,
  loadMemoryViewer,
  openTaskFromAudit,
  openConversationSession,
  appendMessage,
  getChatUiFeature,
  onAgentIdentityChanged,
  onAgentCatalogChanged,
  showNotice,
  localeController,
  t = (_key, _params, fallback) => fallback ?? "",
}) {
  const {
    agentSelectEl,
    agentRightPanelEl,
    goalsDetailEl,
    messagesEl,
  } = refs;

  let residentAgentActivationSeq = 0;
  let agentPanelUploadInput = null;
  let agentPanelUploadTargetAgentId = "";
  let agentPanelUploadBusyAgentId = "";
  let currentAgentName = initialIdentity.agentName || "Agent";
  let currentAgentAvatar = initialIdentity.agentAvatar || "🤖";
  let defaultAgentName = initialIdentity.defaultAgentName || currentAgentName;
  let defaultAgentAvatar = initialIdentity.defaultAgentAvatar || currentAgentAvatar;

  function syncAgentIdentityUi() {
    getChatUiFeature?.()?.refreshAvatar("bot", currentAgentAvatar);
    onAgentIdentityChanged?.({
      agentName: currentAgentName,
      agentAvatar: currentAgentAvatar,
      defaultAgentName,
      defaultAgentAvatar,
    });
  }

  function getAgentProfile() {
    return {
      name: currentAgentName,
      avatar: currentAgentAvatar,
    };
  }

  function applyHelloIdentity(frame = {}) {
    if (frame.agentName) {
      currentAgentName = frame.agentName;
      defaultAgentName = frame.agentName;
    }
    if (frame.agentAvatar) {
      currentAgentAvatar = frame.agentAvatar;
      defaultAgentAvatar = frame.agentAvatar;
    }
    syncAgentIdentityUi();
  }

  function getCurrentAgentSelection() {
    const selected = agentSelectEl?.value?.trim();
    return selected || "default";
  }

  function getCurrentAgentLabel() {
    const selectedAgentId = getCurrentAgentSelection();
    const selectedAgent = agentCatalog.get(selectedAgentId);
    if (selectedAgent?.displayName || selectedAgent?.name) {
      return selectedAgent.displayName || selectedAgent.name;
    }
    const selectedIndex = typeof agentSelectEl?.selectedIndex === "number" ? agentSelectEl.selectedIndex : -1;
    if (selectedIndex >= 0) {
      const optionLabel = agentSelectEl?.options?.[selectedIndex]?.text;
      if (typeof optionLabel === "string" && optionLabel.trim()) {
        return optionLabel.trim();
      }
    }
    return "";
  }

  function syncAgentRuntimeEntry(agentId, patch = {}) {
    if (!agentId) return null;
    const existing = agentCatalog.get(agentId);
    if (!existing) return null;
    const next = {
      ...existing,
      ...patch,
    };
    agentCatalog.set(agentId, next);
    return next;
  }

  async function ensureResidentAgentSession(agentId) {
    if (!residentAgentRosterEnabled || !agentId) return null;
    const res = await sendReq({
      type: "req",
      id: makeId(),
      method: "agent.session.ensure",
      params: { agentId },
    });
    if (!res || !res.ok || !res.payload?.conversationId) {
      return null;
    }

    const mainConversationId = typeof res.payload.mainConversationId === "string" && res.payload.mainConversationId.trim()
      ? res.payload.mainConversationId.trim()
      : String(res.payload.conversationId);
    const lastConversationId = typeof res.payload.lastConversationId === "string" && res.payload.lastConversationId.trim()
      ? res.payload.lastConversationId.trim()
      : String(res.payload.conversationId);
    agentSessionCacheFeature.bindAgentConversation(agentId, mainConversationId, { main: true });
    agentSessionCacheFeature.bindAgentConversation(agentId, lastConversationId);
    syncAgentRuntimeEntry(agentId, {
      status: typeof res.payload.status === "string" ? res.payload.status : "idle",
      mainConversationId,
      lastConversationId,
      lastActiveAt: typeof res.payload.lastActiveAt === "number" ? res.payload.lastActiveAt : undefined,
    });
    return res.payload;
  }

  async function activateResidentAgentConversation(agentId, options = {}) {
    if (!agentId) return;
    const activationSeq = ++residentAgentActivationSeq;
    const forceEnsure = options.forceEnsure === true;
    const switchToChat = options.switchToChat !== false;
    let conversationId = agentSessionCacheFeature.getAgentConversation(agentId)
      || agentCatalog.get(agentId)?.lastConversationId
      || agentCatalog.get(agentId)?.mainConversationId
      || "";

    if (!conversationId || forceEnsure) {
      const ensured = await ensureResidentAgentSession(agentId);
      if (activationSeq !== residentAgentActivationSeq) return;
      conversationId = typeof ensured?.conversationId === "string" ? ensured.conversationId : conversationId;
    }

    if (!conversationId) {
      setActiveConversationId(null);
      renderCanvasGoalContext?.();
      getChatEventsFeature?.()?.resetStreamingState();
      getSessionDigestFeature?.()?.clear?.();
      renderConversationMessages([]);
      return;
    }

    agentSessionCacheFeature.bindAgentConversation(agentId, conversationId, {
      main: conversationId === agentCatalog.get(agentId)?.mainConversationId,
    });
    setActiveConversationId(conversationId);
    renderCanvasGoalContext?.();
    if (switchToChat) {
      switchMode("chat");
    }
    getChatEventsFeature?.()?.resetStreamingState();

    const cachedMessages = agentSessionCacheFeature.getConversationMessages(conversationId);
    if (cachedMessages.length > 0) {
      renderConversationMessages(cachedMessages);
    } else {
      renderConversationMessages([]);
    }

    void loadConversationMeta(conversationId, { showGoalEntryBanner: true });
    void getSessionDigestFeature?.()?.loadSessionDigest(conversationId);
  }

  function syncSelectedAgentIdentity() {
    const selectedAgent = agentCatalog.get(getCurrentAgentSelection());
    if (!selectedAgent) return null;
    const fallbackAgent = agentCatalog.get("default");
    const identity = {
      selectedAgent,
      agentName: selectedAgent.name || selectedAgent.displayName || defaultAgentName || "Agent",
      agentAvatar: selectedAgent.avatar || fallbackAgent?.avatar || defaultAgentAvatar || "🤖",
    };
    currentAgentName = identity.agentName;
    currentAgentAvatar = identity.agentAvatar;
    syncAgentIdentityUi();
    return identity;
  }

  function updateAgentCatalogAvatar(agentId, avatarPath) {
    const targetAgentId = agentId && agentId !== "default" ? agentId : "default";
    const existing = agentCatalog.get(targetAgentId);
    if (existing) {
      existing.avatar = avatarPath;
      agentCatalog.set(targetAgentId, existing);
      return targetAgentId;
    }

    agentCatalog.set(targetAgentId, {
      id: targetAgentId,
      displayName: targetAgentId,
      name: targetAgentId,
      avatar: avatarPath,
      model: "",
    });
    return targetAgentId;
  }

  function applyUploadedAgentAvatarChange({ agentId, avatarPath }) {
    const bustedPath = `${avatarPath}${avatarPath.includes("?") ? "&" : "?"}v=${Date.now()}`;
    const targetAgentId = agentId && typeof agentId === "string" ? agentId : getCurrentAgentSelection();
    const updatedAgentId = updateAgentCatalogAvatar(targetAgentId, bustedPath);
    if (updatedAgentId === "default") {
      defaultAgentAvatar = bustedPath;
    }
    syncSelectedAgentIdentity();
    renderAgentRightPanel();
  }

  function ensureAgentPanelAvatarUploadInput() {
    if (agentPanelUploadInput) return agentPanelUploadInput;

    agentPanelUploadInput = document.createElement("input");
    agentPanelUploadInput.type = "file";
    agentPanelUploadInput.accept = "image/png,image/jpeg,image/gif,image/webp";
    agentPanelUploadInput.className = "hidden";
    agentPanelUploadInput.addEventListener("change", () => {
      const selectedFile = agentPanelUploadInput?.files?.[0];
      const targetAgentId = agentPanelUploadTargetAgentId;
      agentPanelUploadTargetAgentId = "";
      if (agentPanelUploadInput) {
        agentPanelUploadInput.value = "";
      }
      if (!selectedFile || !targetAgentId) return;
      void uploadAgentPanelAvatar(targetAgentId, selectedFile);
    });
    document.body.appendChild(agentPanelUploadInput);
    return agentPanelUploadInput;
  }

  function openAgentPanelAvatarPicker(agentId) {
    if (!agentId || agentPanelUploadBusyAgentId) return;
    agentPanelUploadTargetAgentId = agentId;
    ensureAgentPanelAvatarUploadInput().click();
  }

  async function uploadAgentPanelAvatar(agentId, file) {
    if (!agentId || !file || agentPanelUploadBusyAgentId) return;

    agentPanelUploadBusyAgentId = agentId;
    renderAgentRightPanel();

    try {
      const formData = new FormData();
      formData.append("role", "agent");
      if (agentId !== "default") {
        formData.append("agentId", agentId);
      }
      formData.append("file", file, file.name || "avatar.png");

      const res = await fetch("/api/avatar/upload", {
        method: "POST",
        body: formData,
        headers: getHttpAuthHeaders(),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.ok) {
        const message = payload?.error?.message || t("agentPanel.avatarUploadFailedMessage", {}, "头像上传失败。");
        showNotice(
          t("agentPanel.avatarUploadFailedTitle", {}, "头像上传失败"),
          message,
          "error",
          3800,
        );
        return;
      }

      const avatarPath = typeof payload.avatarPath === "string" ? payload.avatarPath : "";
      if (!avatarPath) {
        showNotice(
          t("agentPanel.avatarUploadFailedTitle", {}, "头像上传失败"),
          t("agentPanel.avatarMissingPathMessage", {}, "服务端未返回头像路径。"),
          "error",
          3800,
        );
        return;
      }

      applyUploadedAgentAvatarChange({ agentId, avatarPath });
      const agentLabel = agentCatalog.get(agentId)?.displayName || agentCatalog.get(agentId)?.name || agentId;
      showNotice(
        t("agentPanel.avatarUpdatedTitle", {}, "头像已更新"),
        t(
          "agentPanel.avatarUpdatedMessage",
          { agentName: agentLabel },
          `${agentLabel} 的头像已写入对应的 IDENTITY.md。`,
        ),
        "success",
        2200,
      );
    } catch (error) {
      showNotice(
        t("agentPanel.avatarUploadFailedTitle", {}, "头像上传失败"),
        error instanceof Error ? error.message : String(error),
        "error",
        3800,
      );
    } finally {
      agentPanelUploadBusyAgentId = "";
      renderAgentRightPanel();
    }
  }

  function syncAgentCatalog(agents = [], selectedAgentId = "") {
    agentCatalog.clear();
    for (const agent of Array.isArray(agents) ? agents : []) {
      if (!agent || typeof agent !== "object" || !agent.id) continue;
      const mainConversationId = typeof agent.mainConversationId === "string" ? agent.mainConversationId : "";
      const lastConversationId = typeof agent.lastConversationId === "string" ? agent.lastConversationId : "";
      if (mainConversationId) {
        agentSessionCacheFeature.bindAgentConversation(agent.id, mainConversationId, { main: true });
      }
      if (lastConversationId) {
        agentSessionCacheFeature.bindAgentConversation(agent.id, lastConversationId);
      }
      agentCatalog.set(agent.id, {
        id: agent.id,
        displayName: agent.displayName || agent.id,
        name: agent.name || agent.displayName || agent.id,
        avatar: agent.avatar || "",
        model: agent.model || "",
        status: typeof agent.status === "string" ? agent.status : "idle",
        mainConversationId,
        lastConversationId,
        lastActiveAt: typeof agent.lastActiveAt === "number" ? agent.lastActiveAt : undefined,
        memoryMode: typeof agent.memoryMode === "string" ? agent.memoryMode : "",
        workspaceBinding: typeof agent.workspaceBinding === "string" ? agent.workspaceBinding : "",
        sessionNamespace: typeof agent.sessionNamespace === "string" ? agent.sessionNamespace : "",
        conversationDigest: agent.conversationDigest && typeof agent.conversationDigest === "object"
          ? {
            status: typeof agent.conversationDigest.status === "string" ? agent.conversationDigest.status : "",
            pendingMessageCount: Number(agent.conversationDigest.pendingMessageCount) || 0,
          }
          : null,
        recentTaskDigest: agent.recentTaskDigest && typeof agent.recentTaskDigest === "object"
          ? {
            recentCount: Number(agent.recentTaskDigest.recentCount) || 0,
            latestTaskId: typeof agent.recentTaskDigest.latestTaskId === "string" ? agent.recentTaskDigest.latestTaskId : "",
            latestTitle: typeof agent.recentTaskDigest.latestTitle === "string" ? agent.recentTaskDigest.latestTitle : "",
            latestStatus: typeof agent.recentTaskDigest.latestStatus === "string" ? agent.recentTaskDigest.latestStatus : "",
            latestFinishedAt: typeof agent.recentTaskDigest.latestFinishedAt === "string" ? agent.recentTaskDigest.latestFinishedAt : "",
          }
          : null,
        recentSubtaskDigest: agent.recentSubtaskDigest && typeof agent.recentSubtaskDigest === "object"
          ? {
            recentCount: Number(agent.recentSubtaskDigest.recentCount) || 0,
            latestTaskId: typeof agent.recentSubtaskDigest.latestTaskId === "string" ? agent.recentSubtaskDigest.latestTaskId : "",
            latestSummary: typeof agent.recentSubtaskDigest.latestSummary === "string" ? agent.recentSubtaskDigest.latestSummary : "",
            latestStatus: typeof agent.recentSubtaskDigest.latestStatus === "string" ? agent.recentSubtaskDigest.latestStatus : "",
            latestUpdatedAt: Number(agent.recentSubtaskDigest.latestUpdatedAt) || 0,
            latestAgentId: typeof agent.recentSubtaskDigest.latestAgentId === "string" ? agent.recentSubtaskDigest.latestAgentId : "",
            latestParentTaskId: typeof agent.recentSubtaskDigest.latestParentTaskId === "string" ? agent.recentSubtaskDigest.latestParentTaskId : "",
          }
          : null,
        experienceUsageDigest: agent.experienceUsageDigest && typeof agent.experienceUsageDigest === "object"
          ? {
            usageCount: Number(agent.experienceUsageDigest.usageCount) || 0,
            methodCount: Number(agent.experienceUsageDigest.methodCount) || 0,
            skillCount: Number(agent.experienceUsageDigest.skillCount) || 0,
            latestAssetType: typeof agent.experienceUsageDigest.latestAssetType === "string" ? agent.experienceUsageDigest.latestAssetType : "",
            latestAssetKey: typeof agent.experienceUsageDigest.latestAssetKey === "string" ? agent.experienceUsageDigest.latestAssetKey : "",
            latestTaskId: typeof agent.experienceUsageDigest.latestTaskId === "string" ? agent.experienceUsageDigest.latestTaskId : "",
            latestUsedAt: typeof agent.experienceUsageDigest.latestUsedAt === "string" ? agent.experienceUsageDigest.latestUsedAt : "",
          }
          : null,
        sharedGovernance: agent.sharedGovernance && typeof agent.sharedGovernance === "object"
          ? {
            pendingCount: Number(agent.sharedGovernance.pendingCount) || 0,
            claimedCount: Number(agent.sharedGovernance.claimedCount) || 0,
          }
          : null,
        continuationState: agent.continuationState && typeof agent.continuationState === "object"
          ? {
            scope: typeof agent.continuationState.scope === "string" ? agent.continuationState.scope : "",
            targetId: typeof agent.continuationState.targetId === "string" ? agent.continuationState.targetId : "",
            recommendedTargetId: typeof agent.continuationState.recommendedTargetId === "string" ? agent.continuationState.recommendedTargetId : "",
            targetType: typeof agent.continuationState.targetType === "string" ? agent.continuationState.targetType : "",
            resumeMode: typeof agent.continuationState.resumeMode === "string" ? agent.continuationState.resumeMode : "",
            summary: typeof agent.continuationState.summary === "string" ? agent.continuationState.summary : "",
            nextAction: typeof agent.continuationState.nextAction === "string" ? agent.continuationState.nextAction : "",
          }
          : null,
        observabilityHeadline: typeof agent.observabilityHeadline === "string" ? agent.observabilityHeadline : "",
      });
    }

    if (agentSelectEl && selectedAgentId && agentSelectEl.value !== selectedAgentId) {
      agentSelectEl.value = selectedAgentId;
    }

    syncSelectedAgentIdentity();
    renderAgentRightPanel();
    onAgentCatalogChanged?.();
  }

  async function focusAgentObservabilityTarget(agentId) {
    const targetAgentId = typeof agentId === "string" && agentId.trim() ? agentId.trim() : "default";
    if (agentSelectEl && agentSelectEl.value !== targetAgentId) {
      agentSelectEl.value = targetAgentId;
      localStorage.setItem(storageKey, targetAgentId);
    }
    syncSelectedAgentIdentity();
    renderAgentRightPanel();
    await refreshMemoryViewerForAgentSwitch(targetAgentId);
    if (residentAgentRosterEnabled) {
      await activateResidentAgentConversation(targetAgentId, {
        forceEnsure: true,
        switchToChat: false,
      });
    }
  }

  function clearGoalContinuationFocus() {
    goalsDetailEl?.querySelectorAll(".is-continuation-focus").forEach((node) => {
      node.classList.remove("is-continuation-focus");
    });
  }

  function applyGoalContinuationFocus(goalId = getGoalsState()?.selectedId) {
    clearGoalContinuationFocus();
    const goalsState = getGoalsState?.();
    const focus = goalsState?.continuationFocusNode;
    if (!goalsDetailEl || !focus || !focus.nodeId || !goalId || focus.goalId !== goalId) {
      return false;
    }
    const matched = getElementsByDataValue(goalsDetailEl, "data-goal-node-id", focus.nodeId)
      .map((node) => node.closest("[data-goal-continuation-focus]") || node);
    if (!matched.length) return false;
    matched.forEach((node) => node.classList.add("is-continuation-focus"));
    matched
      .map((node) => node.closest(".goal-tracking-card, .goal-capability-card"))
      .filter(Boolean)
      .forEach((node) => node.classList.add("is-continuation-focus"));
    if (!focus.scrolled) {
      matched[0].scrollIntoView({ block: "center", behavior: "smooth" });
      focus.scrolled = true;
    }
    return true;
  }

  async function openContinuationAction(action = {}) {
    const kind = typeof action?.kind === "string" ? action.kind : "";
    if (!kind) return;

    const goalsState = getGoalsState?.();
    const subtasksState = getSubtasksState?.();

    switch (kind) {
      case "goalReplay":
        if (action.goalId && action.nodeId && goalsState) {
          goalsState.continuationFocusNode = {
            goalId: action.goalId,
            nodeId: action.nodeId,
            scrolled: false,
          };
        } else if (goalsState) {
          goalsState.continuationFocusNode = null;
        }
        if (subtasksState) {
          subtasksState.linkedSessionContext = null;
          subtasksState.continuationFocusSessionId = null;
        }
        if (!action.goalId) return;
        await resumeGoal(action.goalId, {
          nodeId: typeof action.nodeId === "string" ? action.nodeId : undefined,
          checkpointId: typeof action.checkpointId === "string" ? action.checkpointId : undefined,
          silent: true,
        });
        await loadGoals(true, action.goalId);
        return;
      case "goal":
        if (goalsState) {
          goalsState.continuationFocusNode = null;
        }
        if (subtasksState) {
          subtasksState.linkedSessionContext = null;
          subtasksState.continuationFocusSessionId = null;
        }
        if (!action.goalId) return;
        switchMode("goals");
        await loadGoals(true, action.goalId);
        return;
      case "node":
        if (action.goalId && action.nodeId && goalsState) {
          goalsState.continuationFocusNode = {
            goalId: action.goalId,
            nodeId: action.nodeId,
            scrolled: false,
          };
        }
        if (!action.goalId) return;
        switchMode("goals");
        await loadGoals(true, action.goalId);
        return;
      case "session":
        if (goalsState) {
          goalsState.continuationFocusNode = null;
        }
        if (action.sessionId) {
          await openSubtaskBySession(action.sessionId, { taskId: action.taskId });
          return;
        }
        if (action.taskId && subtasksState) {
          subtasksState.linkedSessionContext = null;
          await openSubtaskById(action.taskId);
        }
        return;
      case "conversation":
        if (goalsState) {
          goalsState.continuationFocusNode = null;
        }
        if (subtasksState) {
          subtasksState.continuationFocusSessionId = null;
        }
        if (action.conversationId) {
          openConversationSession(
            action.conversationId,
            t(
              "agentPanel.openContinuationConversationHint",
              { conversationId: action.conversationId },
              `Switched to continuation conversation: ${action.conversationId}`,
            ),
          );
          return;
        }
        switchMode("chat");
        return;
      default:
        return;
    }
  }

  async function openAgentObservabilityAction(agentId, action = {}) {
    const kind = typeof action?.kind === "string" ? action.kind : "";
    if (!kind) return;

    await focusAgentObservabilityTarget(agentId);

    switch (kind) {
      case "task":
        if (!action.taskId) return;
        switchMode("memory");
        await openTaskFromAudit(action.taskId);
        return;
      case "tasks":
        switchMode("memory");
        if (getMemoryViewerState?.()?.tab !== "tasks") {
          switchMemoryViewerTab("tasks");
        } else {
          await loadMemoryViewer(true);
        }
        return;
      case "subtask":
        if (!action.taskId) return;
        await openSubtaskById(action.taskId);
        return;
      case "subtasks":
        switchMode("subtasks");
        await loadSubtasks(true);
        return;
      case "sharedReview":
        switchMode("memory");
        if (getMemoryViewerState?.()?.tab !== "sharedReview") {
          switchMemoryViewerTab("sharedReview");
        } else {
          await loadMemoryViewer(true);
        }
        return;
      case "goal":
      case "node":
      case "session":
      case "conversation":
        await openContinuationAction(action);
        return;
      default:
        return;
    }
  }

  function openAgentObservabilityModal(agent, observability) {
    const modalOverlay = document.getElementById("agentObservabilityModal");
    const modalTitle = document.getElementById("agentObservabilityModalTitle");
    const modalBody = document.getElementById("agentObservabilityModalBody");
    const modalClose = document.getElementById("agentObservabilityModalClose");
    if (!modalOverlay || !modalBody) return;

    if (modalTitle) {
      modalTitle.textContent = agent.displayName || agent.id || "Agent";
    }

    modalBody.textContent = "";

    if (Array.isArray(observability.badges) && observability.badges.length > 0) {
      const badgesEl = document.createElement("div");
      badgesEl.className = "agent-observability-modal-badges";
      for (const text of observability.badges) {
        if (!text) continue;
        const badge = document.createElement("span");
        badge.className = "agent-observability-modal-badge";
        badge.textContent = text;
        badgesEl.appendChild(badge);
      }
      modalBody.appendChild(badgesEl);
    }

    if (Array.isArray(observability.rows) && observability.rows.length > 0) {
      const rowsEl = document.createElement("div");
      rowsEl.className = "agent-observability-modal-rows";
      for (const row of observability.rows) {
        const rowBtn = document.createElement("button");
        rowBtn.type = "button";
        rowBtn.className = "agent-observability-modal-row";
        rowBtn.title = row.value || row.label || "";
        rowBtn.addEventListener("click", () => {
          modalOverlay.classList.add("hidden");
          void openAgentObservabilityAction(agent.id, row.action);
        });

        const labelEl = document.createElement("span");
        labelEl.className = "agent-observability-modal-label";
        labelEl.textContent = row.label || "";
        rowBtn.appendChild(labelEl);

        const valueEl = document.createElement("span");
        valueEl.className = "agent-observability-modal-value";
        valueEl.textContent = row.value || "";
        rowBtn.appendChild(valueEl);

        rowsEl.appendChild(rowBtn);
      }
      modalBody.appendChild(rowsEl);
    }

    modalOverlay.classList.remove("hidden");

    const closeHandler = () => {
      modalOverlay.classList.add("hidden");
    };
    if (modalClose) {
      modalClose.onclick = closeHandler;
    }
    modalOverlay.addEventListener("click", (event) => {
      if (event.target === modalOverlay) closeHandler();
    }, { once: true });
  }

  function renderAgentRightPanel() {
    if (!agentRightPanelEl) return;

    const agents = [...agentCatalog.values()];
    agentRightPanelEl.textContent = "";
    agentRightPanelEl.classList.toggle("hidden", agents.length === 0);
    if (agents.length === 0) return;

    const fragment = document.createDocumentFragment();
    const activeAgentId = getCurrentAgentSelection();
    const uploadBusy = Boolean(agentPanelUploadBusyAgentId);
    for (const agent of agents) {
      const card = document.createElement("div");
      card.className = "agent-card";
      if (agent.id === activeAgentId) {
        card.classList.add("active");
      }
      card.setAttribute("data-agent-id", agent.id);

      const main = document.createElement("button");
      main.type = "button";
      main.className = "agent-card-main";
      main.title = agent.observabilityHeadline || agent.displayName || agent.id;

      const avatar = document.createElement("div");
      avatar.className = "agent-card-avatar avatar-clickable";
      avatar.title = t(
        "agentPanel.changeAvatarTitle",
        { agentName: agent.displayName || agent.id },
        `为 ${agent.displayName || agent.id} 更换头像`,
      );
      if (uploadBusy && agentPanelUploadBusyAgentId === agent.id) {
        avatar.style.opacity = "0.5";
        avatar.title = t("agentPanel.uploadingAvatar", {}, "上传中...");
      }
      avatar.addEventListener("click", (event) => {
        event.stopPropagation();
        openAgentPanelAvatarPicker(agent.id);
      });

      if (typeof agent.avatar === "string" && agent.avatar.trim()) {
        avatar.style.backgroundImage = `url(${agent.avatar})`;
        avatar.classList.add("agent-card-avatar-image");
      } else {
        const fallbackSeed = (agent.displayName || agent.name || agent.id || "?").trim();
        avatar.textContent = fallbackSeed.slice(0, 1).toUpperCase();
      }

      const content = document.createElement("div");
      content.className = "agent-card-content";

      const name = document.createElement("div");
      name.className = "agent-card-name";
      name.textContent = agent.displayName || agent.id;

      const meta = document.createElement("div");
      meta.className = "agent-card-meta";
      const statusText = typeof agent.status === "string" && agent.status && agent.status !== "idle"
        ? ` · ${agent.status}`
        : "";
      meta.textContent = `${agent.model || agent.id}${statusText}`;

      content.appendChild(name);
      content.appendChild(meta);
      main.appendChild(avatar);
      main.appendChild(content);
      main.addEventListener("click", () => {
        if (!agentSelectEl) return;
        agentSelectEl.value = agent.id;
        agentSelectEl.dispatchEvent(new Event("change"));
      });

      card.appendChild(main);
      const observability = buildResidentPanelSummary(agent, t);
      if (
        Array.isArray(observability?.badges) && observability.badges.length > 0
        || Array.isArray(observability?.rows) && observability.rows.length > 0
      ) {
        const summaryWrap = document.createElement("div");
        summaryWrap.className = "agent-card-observability";

        const workSummary = buildAgentWorkSummary(agent, t);
        const workSummaryBtn = document.createElement("button");
        workSummaryBtn.type = "button";
        workSummaryBtn.className = "agent-card-work-summary";
        if (!workSummary.actionable) {
          workSummaryBtn.disabled = true;
        }
        workSummaryBtn.title = workSummary.tooltip || workSummary.title;
        workSummaryBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          if (!workSummary.action) return;
          void openAgentObservabilityAction(agent.id, workSummary.action);
        });

        const workSummaryLines = document.createElement("div");
        workSummaryLines.className = "agent-card-work-summary-lines";
        for (const line of workSummary.lines) {
          const lineEl = document.createElement("div");
          lineEl.className = "agent-card-work-summary-line";

          const labelEl = document.createElement("span");
          labelEl.className = "agent-card-work-summary-label";
          labelEl.textContent = line.label;
          lineEl.appendChild(labelEl);

          const valueEl = document.createElement("span");
          valueEl.className = "agent-card-work-summary-value";
          valueEl.textContent = line.value;
          valueEl.title = line.value;
          lineEl.appendChild(valueEl);

          workSummaryLines.appendChild(lineEl);
        }
        workSummaryBtn.appendChild(workSummaryLines);
        summaryWrap.appendChild(workSummaryBtn);

        const detailBtn = document.createElement("button");
        detailBtn.type = "button";
        detailBtn.className = "agent-card-detail-btn";
        detailBtn.textContent = t("agentPanel.showDetail", {}, "详情 ▸");
        detailBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          openAgentObservabilityModal(agent, observability);
        });
        summaryWrap.appendChild(detailBtn);
        card.appendChild(summaryWrap);
      }
      fragment.appendChild(card);
    }

    agentRightPanelEl.appendChild(fragment);
  }

  async function handleAgentSelectionChange() {
    const selectedAgentId = agentSelectEl?.value || "default";
    localStorage.setItem(storageKey, selectedAgentId);
    syncSelectedAgentIdentity();
    renderAgentRightPanel();
    void refreshMemoryViewerForAgentSwitch(selectedAgentId);

    if (residentAgentRosterEnabled) {
      await activateResidentAgentConversation(selectedAgentId, { forceEnsure: true });
      return;
    }

    setActiveConversationId(null);
    renderCanvasGoalContext?.();
    getChatEventsFeature?.()?.resetStreamingState();
    getSessionDigestFeature?.()?.clear?.();
    if (messagesEl) {
      messagesEl.innerHTML = "";
    }
    const displayName = agentSelectEl?.options?.[agentSelectEl.selectedIndex]?.text || agentSelectEl?.value || selectedAgentId;
    appendMessage?.("system", `已切换到 ${displayName}`);
  }

  function findAgentIdByConversation(conversationId) {
    const normalizedConversationId = typeof conversationId === "string" ? conversationId.trim() : "";
    if (!normalizedConversationId) return "";
    return [...agentCatalog.values()].find(
      (agent) => agentSessionCacheFeature.getAgentConversation(agent.id) === normalizedConversationId,
    )?.id || "";
  }

  async function activatePreferredResidentAgent(agents = []) {
    if (!residentAgentRosterEnabled) return;
    const selectedAgentId = agentSelectEl?.value || agents?.[0]?.id || "default";
    if (!selectedAgentId) return;
    await activateResidentAgentConversation(selectedAgentId, { forceEnsure: true, switchToChat: false });
  }

  function cacheOutgoingUserMessage({ conversationId, displayText, timestampMs, agentId }) {
    if (!residentAgentRosterEnabled || !conversationId) return;
    const targetAgentId = typeof agentId === "string" && agentId.trim() ? agentId.trim() : getCurrentAgentSelection();
    agentSessionCacheFeature.bindAgentConversation(targetAgentId, conversationId, {
      main: conversationId === agentCatalog.get(targetAgentId)?.mainConversationId,
    });
    agentSessionCacheFeature.appendUserMessage(conversationId, displayText, {
      timestampMs,
      agentId: targetAgentId,
    });
  }

  function handleMessageSendConversationBound({ conversationId, agentId }) {
    const normalizedConversationId = typeof conversationId === "string" ? conversationId.trim() : "";
    if (!residentAgentRosterEnabled || !normalizedConversationId) return;
    const targetAgentId = typeof agentId === "string" && agentId.trim() ? agentId.trim() : getCurrentAgentSelection();
    agentSessionCacheFeature.bindAgentConversation(targetAgentId, normalizedConversationId, {
      main: normalizedConversationId === agentCatalog.get(targetAgentId)?.mainConversationId,
    });
    syncAgentRuntimeEntry(targetAgentId, {
      lastConversationId: normalizedConversationId,
    });
    renderAgentRightPanel();
  }

  function handleAgentStatusPayload(payload) {
    const conversationId = typeof payload?.conversationId === "string" ? payload.conversationId : "";
    const agentId = typeof payload?.agentId === "string"
      ? payload.agentId
      : findAgentIdByConversation(conversationId);
    if (!agentId) return;
    const nextStatus = payload?.status === "running"
      ? "running"
      : payload?.status === "error"
        ? "error"
        : "idle";
    syncAgentRuntimeEntry(agentId, { status: nextStatus });
    renderAgentRightPanel();
  }

  function handleConversationDeltaPayload(payload) {
    const conversationId = typeof payload?.conversationId === "string" ? payload.conversationId : "";
    const delta = typeof payload?.delta === "string" ? payload.delta : "";
    if (!conversationId || !delta) return;
    agentSessionCacheFeature.appendAssistantDelta(conversationId, delta, {
      timestampMs: Date.now(),
    });
  }

  function handleConversationFinalPayload(payload) {
    const conversationId = typeof payload?.conversationId === "string" ? payload.conversationId : "";
    if (!conversationId) return;
    agentSessionCacheFeature.finalizeAssistantMessage(conversationId, payload?.text || "", {
      timestampMs: typeof payload?.messageMeta?.timestampMs === "number" ? payload.messageMeta.timestampMs : Date.now(),
      displayTimeText: typeof payload?.messageMeta?.displayTimeText === "string" ? payload.messageMeta.displayTimeText : "",
      agentId: typeof payload?.agentId === "string" ? payload.agentId : undefined,
    });
  }

  function setConversationMessages(conversationId, messages) {
    if (!conversationId || !Array.isArray(messages)) return;
    agentSessionCacheFeature.setConversationMessages(conversationId, messages);
  }

  if (agentSelectEl) {
    agentSelectEl.addEventListener("change", () => {
      void handleAgentSelectionChange();
    });
  }

  return {
    getAgentProfile,
    applyHelloIdentity,
    getCurrentAgentSelection,
    getCurrentAgentLabel,
    syncAgentRuntimeEntry,
    ensureResidentAgentSession,
    activateResidentAgentConversation,
    applyUploadedAgentAvatarChange,
    syncAgentCatalog,
    syncSelectedAgentIdentity,
    updateAgentCatalogAvatar,
    focusAgentObservabilityTarget,
    clearGoalContinuationFocus,
    applyGoalContinuationFocus,
    openContinuationAction,
    openAgentObservabilityAction,
    renderAgentRightPanel,
    findAgentIdByConversation,
    activatePreferredResidentAgent,
    cacheOutgoingUserMessage,
    handleMessageSendConversationBound,
    handleAgentStatusPayload,
    handleConversationDeltaPayload,
    handleConversationFinalPayload,
    setConversationMessages,
    refreshLocale() {
      renderAgentRightPanel();
    },
  };
}
