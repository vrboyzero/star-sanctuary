import { extractCandidateContextTargets } from "./memory-viewer.js";

function normalizeCandidateType(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  return normalized === "skill" ? "skill" : "method";
}

function normalizeCandidateStatus(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "accepted" || normalized === "rejected" || normalized === "draft") {
    return normalized;
  }
  return "";
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function hasOwn(source, key) {
  return Boolean(source) && Object.prototype.hasOwnProperty.call(source, key);
}

function countExperienceStats(items) {
  const stats = {
    total: 0,
    methods: 0,
    skills: 0,
    draft: 0,
    accepted: 0,
    rejected: 0,
  };
  for (const item of Array.isArray(items) ? items : []) {
    stats.total += 1;
    const type = normalizeCandidateType(item?.type);
    if (type === "skill") {
      stats.skills += 1;
    } else {
      stats.methods += 1;
    }
    const status = normalizeCandidateStatus(item?.status);
    if (status === "draft") stats.draft += 1;
    if (status === "accepted") stats.accepted += 1;
    if (status === "rejected") stats.rejected += 1;
  }
  return stats;
}

export function createExperienceWorkbenchFeature({
  refs,
  isConnected,
  sendReq,
  makeId,
  getExperienceWorkbenchState,
  getMemoryViewerState,
  getSelectedAgentId,
  getSelectedAgentLabel,
  renderCandidateDetailPanel,
  renderTaskUsageOverviewCard,
  loadTaskUsageOverview,
  generateExperienceCandidate,
  openToolSettingsTab,
  escapeHtml,
  formatDateTime,
  openTaskFromWorkbench,
  openMemoryFromWorkbench,
  openSourcePath,
  showNotice,
  t = (_key, _params, fallback) => fallback ?? "",
}) {
  const {
    experienceWorkbenchSection,
    experienceWorkbenchTitleEl,
    experienceWorkbenchStatsEl,
    experienceWorkbenchTabCandidatesBtn,
    experienceWorkbenchTabUsageOverviewBtn,
    experienceWorkbenchCandidatesPaneEl,
    experienceWorkbenchUsagePaneEl,
    experienceWorkbenchUsageOverviewEl,
    experienceWorkbenchQueryEl,
    experienceWorkbenchTypeFilterEl,
    experienceWorkbenchStatusFilterEl,
    experienceWorkbenchResetFiltersBtn,
    experienceGenerateTaskIdEl,
    experienceGenerateMethodBtn,
    experienceGenerateSkillBtn,
    experienceWorkbenchListEl,
    experienceWorkbenchDetailEl,
  } = refs;

  let uiBound = false;
  let pendingGenerateActionKey = "";

  function getActiveAgentId() {
    const state = getExperienceWorkbenchState();
    const selectedAgentId = typeof getSelectedAgentId === "function"
      ? String(getSelectedAgentId() || "").trim()
      : "";
    return selectedAgentId || String(state.activeAgentId || "default").trim() || "default";
  }

  function createRequestContext() {
    const state = getExperienceWorkbenchState();
    state.requestToken = Number(state.requestToken || 0) + 1;
    state.activeAgentId = getActiveAgentId();
    return {
      requestToken: state.requestToken,
      agentId: state.activeAgentId,
    };
  }

  function isRequestCurrent(requestContext) {
    const state = getExperienceWorkbenchState();
    return Number(state.requestToken || 0) === Number(requestContext?.requestToken || 0)
      && String(state.activeAgentId || "default").trim() === String(requestContext?.agentId || "default").trim();
  }

  function getPendingActionKey() {
    const memoryViewerState = typeof getMemoryViewerState === "function" ? getMemoryViewerState() : null;
    return typeof memoryViewerState?.pendingExperienceActionKey === "string"
      ? memoryViewerState.pendingExperienceActionKey
      : "";
  }

  function getActiveTab() {
    const state = getExperienceWorkbenchState();
    return state.activeTab === "usage-overview" ? "usage-overview" : "candidates";
  }

  function setActiveTab(nextTab) {
    const state = getExperienceWorkbenchState();
    state.activeTab = nextTab === "usage-overview" ? "usage-overview" : "candidates";
  }

  function getFilters() {
    const state = getExperienceWorkbenchState();
    const filters = state.filters && typeof state.filters === "object" ? state.filters : {};
    return {
      query: normalizeText(filters.query),
      type: normalizeCandidateType(filters.type || "") === "skill"
        ? "skill"
        : normalizeText(filters.type) === "method"
          ? "method"
          : "",
      status: normalizeCandidateStatus(filters.status),
    };
  }

  function hasActiveFilters() {
    const filters = getFilters();
    return Boolean(filters.query || filters.type || filters.status);
  }

  function setFilters(nextFilters = {}) {
    const state = getExperienceWorkbenchState();
    state.filters = {
      ...getFilters(),
      query: normalizeText(nextFilters.query ?? getFilters().query),
      type: normalizeText(nextFilters.type ?? getFilters().type),
      status: normalizeText(nextFilters.status ?? getFilters().status),
    };
  }

  function syncFilterUi() {
    const filters = getFilters();
    if (experienceWorkbenchQueryEl) experienceWorkbenchQueryEl.value = filters.query;
    if (experienceWorkbenchTypeFilterEl) experienceWorkbenchTypeFilterEl.value = filters.type;
    if (experienceWorkbenchStatusFilterEl) experienceWorkbenchStatusFilterEl.value = filters.status;
    if (experienceGenerateTaskIdEl) {
      experienceGenerateTaskIdEl.value = normalizeText(getExperienceWorkbenchState().generateTaskId);
    }
    syncGenerateControls();
  }

  function applyExperienceWorkbenchContext(options = {}) {
    const state = getExperienceWorkbenchState();
    const filters = options?.filters && typeof options.filters === "object" ? options.filters : null;
    if (filters) {
      setFilters({
        ...(hasOwn(filters, "query") ? { query: filters.query } : {}),
        ...(hasOwn(filters, "type") ? { type: filters.type } : {}),
        ...(hasOwn(filters, "status") ? { status: filters.status } : {}),
      });
    }
    if (hasOwn(options, "generateTaskId")) {
      state.generateTaskId = normalizeText(options.generateTaskId);
    }
    if (hasOwn(options, "candidateId")) {
      const candidateId = normalizeText(options.candidateId);
      state.selectedId = candidateId || null;
      if (!candidateId || String(state.selectedCandidate?.id || "") !== candidateId) {
        state.selectedCandidate = null;
      }
      if (candidateId && !hasOwn(options, "tab")) {
        setActiveTab("candidates");
      }
    }
    if (hasOwn(options, "tab")) {
      setActiveTab(options.tab);
    }
    syncFilterUi();
  }

  function syncGenerateControls() {
    const state = getExperienceWorkbenchState();
    const taskId = normalizeText(state.generateTaskId);
    const pendingActionKey = pendingGenerateActionKey || getPendingActionKey();
    const methodBusy = taskId ? pendingActionKey === `generate:method:${taskId}` : false;
    const skillBusy = taskId ? pendingActionKey === `generate:skill:${taskId}` : false;
    const hasPendingAction = Boolean(pendingActionKey);
    if (experienceGenerateMethodBtn) {
      experienceGenerateMethodBtn.disabled = !taskId || hasPendingAction;
      experienceGenerateMethodBtn.textContent = methodBusy
        ? t("memory.generateMethodCandidateBusy", {}, "生成 method 中…")
        : t("experience.generateMethod", {}, "Generate method");
    }
    if (experienceGenerateSkillBtn) {
      experienceGenerateSkillBtn.disabled = !taskId || hasPendingAction;
      experienceGenerateSkillBtn.textContent = skillBusy
        ? t("memory.generateSkillCandidateBusy", {}, "生成 skill 中…")
        : t("experience.generateSkill", {}, "Generate skill");
    }
  }

  function syncExperienceWorkbenchTabUi() {
    const activeTab = getActiveTab();
    if (experienceWorkbenchTabCandidatesBtn) {
      experienceWorkbenchTabCandidatesBtn.classList.toggle("active", activeTab === "candidates");
    }
    if (experienceWorkbenchTabUsageOverviewBtn) {
      experienceWorkbenchTabUsageOverviewBtn.classList.toggle("active", activeTab === "usage-overview");
    }
    if (experienceWorkbenchCandidatesPaneEl) {
      experienceWorkbenchCandidatesPaneEl.classList.toggle("hidden", activeTab !== "candidates");
    }
    if (experienceWorkbenchUsagePaneEl) {
      experienceWorkbenchUsagePaneEl.classList.toggle("hidden", activeTab !== "usage-overview");
    }
  }

  function getEmptyExperienceMessage() {
    return hasActiveFilters()
      ? t("experience.emptyFiltered", {}, "No experience candidates match the current filters.")
      : t("experience.empty", {}, "No experience candidates yet.");
  }

  function getFilteredExperienceItems() {
    const state = getExperienceWorkbenchState();
    const filters = getFilters();
    const query = filters.query.toLowerCase();
    return (Array.isArray(state.items) ? state.items : []).filter((item) => {
      if (filters.type && normalizeCandidateType(item?.type) !== filters.type) {
        return false;
      }
      if (filters.status && normalizeCandidateStatus(item?.status) !== filters.status) {
        return false;
      }
      if (!query) return true;
      const haystack = [
        item?.id,
        item?.title,
        item?.slug,
        item?.summary,
        item?.taskId,
        item?.publishedPath,
      ]
        .map((value) => normalizeText(value).toLowerCase())
        .filter(Boolean)
        .join("\n");
      return haystack.includes(query);
    });
  }

  function syncExperienceWorkbenchHeaderTitle() {
    if (!experienceWorkbenchTitleEl) return;
    const agentName = typeof getSelectedAgentLabel === "function"
      ? String(getSelectedAgentLabel() || "").trim()
      : "";
    experienceWorkbenchTitleEl.textContent = agentName
      ? t("experience.titleWithAgent", { agentName }, `${agentName} Experience Workbench`)
      : t("experience.title", {}, "Experience Workbench");
  }

  function renderExperienceWorkbenchListEmpty(message) {
    if (!experienceWorkbenchListEl) return;
    experienceWorkbenchListEl.innerHTML = `<div class="memory-viewer-empty">${escapeHtml(message)}</div>`;
  }

  function renderExperienceWorkbenchDetailEmpty(message) {
    if (!experienceWorkbenchDetailEl) return;
    experienceWorkbenchDetailEl.innerHTML = `<div class="memory-viewer-empty">${escapeHtml(message)}</div>`;
  }

  function renderExperienceWorkbenchUsageOverviewEmpty(message) {
    if (!experienceWorkbenchUsageOverviewEl) return;
    experienceWorkbenchUsageOverviewEl.innerHTML = `<div class="memory-viewer-empty">${escapeHtml(message)}</div>`;
  }

  function summarizePathLabel(value) {
    const normalized = normalizeText(value).replace(/\\/g, "/");
    if (!normalized) return "-";
    const segments = normalized.split("/").filter(Boolean);
    if (segments.length <= 3) return normalized;
    return segments.slice(-3).join("/");
  }

  function formatCandidateTypeLabel(value) {
    return normalizeCandidateType(value) === "skill"
      ? t("experience.listTypeSkill", {}, "Skill")
      : t("experience.listTypeMethod", {}, "Method");
  }

  function formatCandidateStatusLabel(value) {
    const normalized = normalizeCandidateStatus(value);
    if (normalized === "draft") return t("experience.listStatusDraft", {}, "Draft");
    if (normalized === "accepted") return t("experience.listStatusAccepted", {}, "Accepted");
    if (normalized === "rejected") return t("experience.listStatusRejected", {}, "Rejected");
    return t("experience.listStatusUnknown", {}, "Unknown");
  }

  function renderExperienceWorkbenchStats(stats = null) {
    if (!experienceWorkbenchStatsEl) return;
    const safeStats = stats && typeof stats === "object"
      ? stats
      : {
        total: "--",
        methods: "--",
        skills: "--",
        draft: "--",
        accepted: "--",
        rejected: "--",
      };
    experienceWorkbenchStatsEl.innerHTML = `
      <div class="memory-stat-card">
        <span class="memory-stat-label">${escapeHtml(t("experience.statTotal", {}, "Candidates"))}</span>
        <strong class="memory-stat-value">${escapeHtml(String(safeStats.total))}</strong>
      </div>
      <div class="memory-stat-card">
        <span class="memory-stat-label">${escapeHtml(t("experience.statMethods", {}, "Methods"))}</span>
        <strong class="memory-stat-value">${escapeHtml(String(safeStats.methods))}</strong>
      </div>
      <div class="memory-stat-card">
        <span class="memory-stat-label">${escapeHtml(t("experience.statSkills", {}, "Skills"))}</span>
        <strong class="memory-stat-value">${escapeHtml(String(safeStats.skills))}</strong>
      </div>
      <div class="memory-stat-card">
        <span class="memory-stat-label">${escapeHtml(t("experience.statDraft", {}, "Draft"))}</span>
        <strong class="memory-stat-value">${escapeHtml(String(safeStats.draft))}</strong>
      </div>
      <div class="memory-stat-card">
        <span class="memory-stat-label">${escapeHtml(t("experience.statAccepted", {}, "Accepted"))}</span>
        <strong class="memory-stat-value">${escapeHtml(String(safeStats.accepted))}</strong>
      </div>
      <div class="memory-stat-card">
        <span class="memory-stat-label">${escapeHtml(t("experience.statRejected", {}, "Rejected"))}</span>
        <strong class="memory-stat-value">${escapeHtml(String(safeStats.rejected))}</strong>
      </div>
    `;
  }

  function bindExperienceWorkbenchListActions() {
    if (!experienceWorkbenchListEl) return;
    experienceWorkbenchListEl.querySelectorAll("[data-experience-candidate-id]").forEach((node) => {
      node.addEventListener("click", async () => {
        const candidateId = node.getAttribute("data-experience-candidate-id");
        await loadExperienceCandidateDetail(candidateId);
      });
    });
  }

  function renderExperienceWorkbenchList(items) {
    if (!experienceWorkbenchListEl) return;
    const state = getExperienceWorkbenchState();
    const safeItems = Array.isArray(items) ? items : [];
    if (!safeItems.length) {
      renderExperienceWorkbenchListEmpty(getEmptyExperienceMessage());
      return;
    }
    experienceWorkbenchListEl.innerHTML = safeItems.map((item) => {
      const title = item?.title || item?.slug || item?.id || t("memory.candidateUntitled", {}, "Untitled Candidate");
      const summary = item?.summary || t("experience.listNoSummary", {}, "No summary yet.");
      const isActive = String(item?.id || "") === String(state.selectedId || "");
      const skillFreshnessStatus = typeof item?.skillFreshness?.status === "string"
        ? item.skillFreshness.status.trim()
        : "";
      return `
        <div class="memory-list-item ${isActive ? "active" : ""}" data-experience-candidate-id="${escapeHtml(String(item?.id || ""))}">
          <div class="memory-list-item-title">${escapeHtml(title)}</div>
          <div class="memory-list-item-meta">
            <span>${escapeHtml(formatCandidateTypeLabel(item?.type))}</span>
            <span>${escapeHtml(formatCandidateStatusLabel(item?.status))}</span>
            ${item?.taskId ? `<span>${escapeHtml(t("experience.listTaskLabel", {}, "Task"))} ${escapeHtml(String(item.taskId))}</span>` : ""}
            ${item?.publishedPath ? `<span class="memory-badge memory-badge-shared">${escapeHtml(t("experience.listPublishedBadge", {}, "Published"))}</span>` : ""}
            ${skillFreshnessStatus ? `<span class="memory-badge">${escapeHtml(skillFreshnessStatus)}</span>` : ""}
            <span>${escapeHtml(formatDateTime(item?.updatedAt || item?.createdAt))}</span>
          </div>
          <div class="memory-list-item-snippet">${escapeHtml(summary)}</div>
        </div>
      `;
    }).join("");
    bindExperienceWorkbenchListActions();
  }

  function bindExperienceWorkbenchDetailActions() {
    if (!experienceWorkbenchDetailEl) return;
    experienceWorkbenchDetailEl.querySelectorAll("[data-open-task-id]").forEach((node) => {
      node.addEventListener("click", async () => {
        const taskId = node.getAttribute("data-open-task-id");
        await openTaskFromWorkbench?.(taskId);
      });
    });
    experienceWorkbenchDetailEl.querySelectorAll("[data-open-memory-id]").forEach((node) => {
      node.addEventListener("click", async () => {
        const chunkId = node.getAttribute("data-open-memory-id");
        await openMemoryFromWorkbench?.(chunkId);
      });
    });
    experienceWorkbenchDetailEl.querySelectorAll("[data-open-source]").forEach((node) => {
      node.addEventListener("click", async () => {
        const sourcePath = node.getAttribute("data-open-source");
        const lineRaw = node.getAttribute("data-open-line");
        const startLine = lineRaw ? Number.parseInt(lineRaw, 10) : undefined;
        await openSourcePath?.(sourcePath, { startLine });
      });
    });
    experienceWorkbenchDetailEl.querySelectorAll("[data-open-candidate-id]").forEach((node) => {
      node.addEventListener("click", async () => {
        const candidateId = node.getAttribute("data-open-candidate-id");
        await loadExperienceCandidateDetail(candidateId);
      });
    });
    experienceWorkbenchDetailEl.querySelectorAll("[data-open-experience-candidate-id]").forEach((node) => {
      node.addEventListener("click", async () => {
        const candidateId = node.getAttribute("data-open-experience-candidate-id");
        await loadExperienceCandidateDetail(candidateId);
      });
    });
    experienceWorkbenchDetailEl.querySelectorAll("[data-open-tool-settings-tab]").forEach((node) => {
      node.addEventListener("click", async () => {
        const tab = node.getAttribute("data-open-tool-settings-tab");
        await openToolSettingsTab?.(tab);
      });
    });
    experienceWorkbenchDetailEl.querySelectorAll("[data-review-candidate-action]").forEach((node) => {
      node.addEventListener("click", async () => {
        const candidateId = node.getAttribute("data-review-candidate-id");
        const action = node.getAttribute("data-review-candidate-action");
        await reviewExperienceCandidate(candidateId, action);
      });
    });
    experienceWorkbenchDetailEl.querySelectorAll("[data-skill-freshness-stale-action]").forEach((node) => {
      node.addEventListener("click", async () => {
        await updateSkillFreshnessStaleMark({
          sourceCandidateId: node.getAttribute("data-skill-freshness-source-candidate-id"),
          skillKey: node.getAttribute("data-skill-freshness-skill-key"),
          taskId: node.getAttribute("data-skill-freshness-task-id"),
          candidateId: node.getAttribute("data-skill-freshness-candidate-id"),
          stale: node.getAttribute("data-skill-freshness-stale-action") !== "clear",
        });
      });
    });
    experienceWorkbenchDetailEl.querySelectorAll("[data-close-candidate-panel]").forEach((node) => {
      node.addEventListener("click", () => {
        const state = getExperienceWorkbenchState();
        state.selectedId = null;
        state.selectedCandidate = null;
        void syncExperienceWorkbenchUi({ preferFirst: true, loadDetailIfNeeded: true });
      });
    });
  }

  function bindExperienceWorkbenchUsageOverviewActions() {
    if (!experienceWorkbenchUsageOverviewEl) return;
    experienceWorkbenchUsageOverviewEl.querySelectorAll("[data-open-task-id]").forEach((node) => {
      node.addEventListener("click", async () => {
        const taskId = node.getAttribute("data-open-task-id");
        await openTaskFromWorkbench?.(taskId);
      });
    });
    experienceWorkbenchUsageOverviewEl.querySelectorAll("[data-open-source]").forEach((node) => {
      node.addEventListener("click", async () => {
        const sourcePath = node.getAttribute("data-open-source");
        await openSourcePath?.(sourcePath);
      });
    });
    experienceWorkbenchUsageOverviewEl.querySelectorAll("[data-open-candidate-id]").forEach((node) => {
      node.addEventListener("click", async () => {
        const candidateId = node.getAttribute("data-open-candidate-id");
        setActiveTab("candidates");
        syncExperienceWorkbenchTabUi();
        await loadExperienceCandidateDetail(candidateId);
      });
    });
  }

  function renderExperienceWorkbenchUsageOverviewPanel() {
    if (!experienceWorkbenchUsageOverviewEl) return;
    const markup = typeof renderTaskUsageOverviewCard === "function"
      ? renderTaskUsageOverviewCard()
      : "";
    if (!markup) {
      renderExperienceWorkbenchUsageOverviewEmpty(t("experience.usageOverviewWaiting", {}, "Waiting for experience usage overview..."));
      return;
    }
    experienceWorkbenchUsageOverviewEl.innerHTML = markup;
    bindExperienceWorkbenchUsageOverviewActions();
  }

  async function loadExperienceWorkbenchUsageOverview() {
    if (!experienceWorkbenchUsageOverviewEl) return;
    if (!isConnected?.()) {
      renderExperienceWorkbenchUsageOverviewEmpty(t("experience.disconnected", {}, "Connect to the server to view experience candidates."));
      return;
    }
    if (typeof loadTaskUsageOverview !== "function" || typeof renderTaskUsageOverviewCard !== "function") {
      renderExperienceWorkbenchUsageOverviewEmpty(t("memory.usageOverviewEmpty", {}, "No usage data yet"));
      return;
    }
    const pending = loadTaskUsageOverview();
    renderExperienceWorkbenchUsageOverviewPanel();
    await pending;
    renderExperienceWorkbenchUsageOverviewPanel();
  }

  function renderExperienceAggregatePanel(candidate) {
    if (!candidate || typeof candidate !== "object") return "";
    const snapshot = candidate.sourceTaskSnapshot && typeof candidate.sourceTaskSnapshot === "object"
      ? candidate.sourceTaskSnapshot
      : {};
    const contextTargets = extractCandidateContextTargets(candidate);
    const memoryLinks = Array.isArray(snapshot.memoryLinks) ? snapshot.memoryLinks : [];
    const artifactPaths = Array.isArray(snapshot.artifactPaths) ? snapshot.artifactPaths : [];
    const toolCalls = Array.isArray(snapshot.toolCalls) ? snapshot.toolCalls : [];
    const learningReviewInput = candidate.learningReviewInput && typeof candidate.learningReviewInput === "object"
      ? candidate.learningReviewInput
      : null;
    const skillFreshness = candidate.skillFreshness && typeof candidate.skillFreshness === "object"
      ? candidate.skillFreshness
      : null;
    const normalizedType = normalizeCandidateType(candidate.type);
    const indexTab = normalizedType === "skill" ? "skills" : "methods";
    const indexLabel = normalizedType === "skill"
      ? t("experience.openSkillsTab", {}, "进入技能列表")
      : t("experience.openMethodsTab", {}, "进入方法列表");
    const publishedLabel = candidate.publishedPath
      ? summarizePathLabel(candidate.publishedPath)
      : t("experience.aggregateNotPublished", {}, "未发布");
    const learningHeadline = learningReviewInput?.summary?.headline
      || learningReviewInput?.summaryLines?.[0]
      || "-";
    const toolCallCount = toolCalls.length;
    return `
      <div class="memory-detail-card">
        <div class="goal-summary-header">
          <div>
            <div class="goal-summary-title">${escapeHtml(t("experience.aggregateTitle", {}, "候选聚合视图"))}</div>
            <div class="goal-summary-text">${escapeHtml(t("experience.aggregateSummary", {}, "把候选状态、来源上下文和已发布资产入口压缩到一处，便于快速决策。"))}</div>
          </div>
          <div class="memory-detail-badges">
            <span class="memory-badge">${escapeHtml(formatCandidateTypeLabel(candidate.type))}</span>
            <span class="memory-badge">${escapeHtml(formatCandidateStatusLabel(candidate.status))}</span>
            ${candidate.publishedPath ? `<span class="memory-badge memory-badge-shared">${escapeHtml(t("experience.listPublishedBadge", {}, "Published"))}</span>` : ""}
            ${skillFreshness?.summary || skillFreshness?.status ? `<span class="memory-badge">${escapeHtml(String(skillFreshness.summary || skillFreshness.status))}</span>` : ""}
          </div>
        </div>
        <div class="memory-detail-grid">
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("experience.aggregateTaskLabel", {}, "来源任务"))}</span><div class="memory-detail-text">${candidate.taskId ? `<button class="memory-path-link" data-open-task-id="${escapeHtml(candidate.taskId)}">${escapeHtml(candidate.taskId)}</button>` : "-"}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("experience.aggregateSlugLabel", {}, "标识"))}</span><div class="memory-detail-text">${escapeHtml(candidate.slug || "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("experience.aggregatePublishedLabel", {}, "发布资产"))}</span><div class="memory-detail-text">${candidate.publishedPath ? `<button class="memory-path-link" data-open-source="${escapeHtml(candidate.publishedPath)}">${escapeHtml(publishedLabel)}</button>` : escapeHtml(publishedLabel)}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("experience.aggregateUpdatedLabel", {}, "最近更新时间"))}</span><div class="memory-detail-text">${escapeHtml(formatDateTime(candidate.updatedAt || candidate.createdAt))}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("experience.aggregateMemoriesLabel", {}, "来源记忆"))}</span><div class="memory-detail-text">${escapeHtml(String(memoryLinks.length || contextTargets.memoryCount || 0))}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("experience.aggregateArtifactsLabel", {}, "来源产物"))}</span><div class="memory-detail-text">${escapeHtml(String(artifactPaths.length || contextTargets.artifactCount || 0))}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("experience.aggregateToolCallsLabel", {}, "工具调用"))}</span><div class="memory-detail-text">${escapeHtml(String(toolCallCount))}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("experience.aggregateLearningLabel", {}, "Learning / Review"))}</span><div class="memory-detail-text">${escapeHtml(learningHeadline)}</div></div>
        </div>
        <div class="goal-detail-actions">
          ${contextTargets.sourceTaskId ? `<button class="button goal-inline-action-secondary" data-open-task-id="${escapeHtml(contextTargets.sourceTaskId)}">${escapeHtml(t("memory.contextOpenSourceTask", {}, "打开来源任务"))}</button>` : ""}
          ${contextTargets.publishedPath ? `<button class="button goal-inline-action-secondary" data-open-source="${escapeHtml(contextTargets.publishedPath)}">${escapeHtml(t("memory.contextOpenPublishedArtifact", {}, "打开发布产物"))}</button>` : ""}
          <button class="button goal-inline-action-secondary" data-open-tool-settings-tab="${escapeHtml(indexTab)}">${escapeHtml(indexLabel)}</button>
        </div>
      </div>
    `;
  }

  function renderSelectedExperienceCandidate() {
    const state = getExperienceWorkbenchState();
    if (!experienceWorkbenchDetailEl) return;
    if (!state.selectedCandidate) {
      renderExperienceWorkbenchDetailEmpty(t("experience.detailSelect", {}, "Select a candidate on the left to view details."));
      return;
    }
    experienceWorkbenchDetailEl.innerHTML = `
      <div class="memory-detail-shell">
        ${renderExperienceAggregatePanel(state.selectedCandidate)}
        ${renderCandidateDetailPanel(state.selectedCandidate)}
      </div>
    `;
    bindExperienceWorkbenchDetailActions();
  }

  async function loadExperienceCandidateDetail(candidateId, requestContext = null) {
    const state = getExperienceWorkbenchState();
    const normalizedCandidateId = typeof candidateId === "string" ? candidateId.trim() : "";
    if (!normalizedCandidateId) {
      state.selectedId = null;
      state.selectedCandidate = null;
      renderExperienceWorkbenchList(getFilteredExperienceItems());
      renderExperienceWorkbenchDetailEmpty(t("experience.detailSelect", {}, "Select a candidate on the left to view details."));
      return;
    }

    state.selectedId = normalizedCandidateId;
    renderExperienceWorkbenchList(getFilteredExperienceItems());
    renderExperienceWorkbenchDetailEmpty(t("experience.detailLoading", {}, "Loading candidate details..."));

    const activeRequest = requestContext ?? {
      requestToken: Number(state.requestToken || 0),
      agentId: String(state.activeAgentId || getActiveAgentId()).trim() || "default",
    };
    const res = await sendReq({
      type: "req",
      id: makeId(),
      method: "experience.candidate.get",
      params: {
        candidateId: normalizedCandidateId,
        agentId: activeRequest.agentId,
      },
    });
    if (!isRequestCurrent(activeRequest)) {
      return;
    }
    if (!res || !res.ok) {
      state.selectedCandidate = null;
      renderExperienceWorkbenchDetailEmpty(res?.error?.message || t("experience.detailLoadFailed", {}, "Failed to load candidate details."));
      return;
    }
    state.selectedCandidate = res.payload?.candidate ?? null;
    renderSelectedExperienceCandidate();
  }

  async function syncExperienceWorkbenchUi(options = {}) {
    const state = getExperienceWorkbenchState();
    const preferFirst = options.preferFirst !== false;
    const loadDetailIfNeeded = options.loadDetailIfNeeded === true;
    const filteredItems = getFilteredExperienceItems();
    state.stats = countExperienceStats(filteredItems);
    renderExperienceWorkbenchStats(state.stats);
    syncExperienceWorkbenchTabUi();

    const selectedVisible = filteredItems.some((item) => String(item?.id || "") === String(state.selectedId || ""));
    if (!selectedVisible) {
      state.selectedId = preferFirst && filteredItems[0]?.id ? String(filteredItems[0].id) : null;
      state.selectedCandidate = null;
    }

    renderExperienceWorkbenchList(filteredItems);
    if (!state.selectedId) {
      renderExperienceWorkbenchDetailEmpty(
        filteredItems.length
          ? t("experience.detailSelect", {}, "Select a candidate on the left to view details.")
          : getEmptyExperienceMessage(),
      );
      return;
    }

    if (state.selectedCandidate && String(state.selectedCandidate.id || "") === String(state.selectedId)) {
      renderSelectedExperienceCandidate();
      return;
    }
    if (loadDetailIfNeeded) {
      await loadExperienceCandidateDetail(state.selectedId);
      return;
    }
    renderExperienceWorkbenchDetailEmpty(t("experience.detailSelect", {}, "Select a candidate on the left to view details."));
  }

  async function loadExperienceWorkbench(forceSelectFirst = false) {
    syncExperienceWorkbenchHeaderTitle();
    syncFilterUi();
    syncExperienceWorkbenchTabUi();
    const state = getExperienceWorkbenchState();
    state.activeAgentId = getActiveAgentId();
    if (!isConnected?.()) {
      state.items = [];
      state.selectedId = null;
      state.selectedCandidate = null;
      renderExperienceWorkbenchStats(null);
      renderExperienceWorkbenchListEmpty(t("experience.disconnected", {}, "Connect to the server to view experience candidates."));
      renderExperienceWorkbenchDetailEmpty(t("experience.disconnected", {}, "Connect to the server to view experience candidates."));
      renderExperienceWorkbenchUsageOverviewEmpty(t("experience.disconnected", {}, "Connect to the server to view experience candidates."));
      return;
    }

    const requestContext = createRequestContext();
    renderExperienceWorkbenchStats(null);
    renderExperienceWorkbenchListEmpty(t("experience.loading", {}, "Loading experience candidates..."));
    renderExperienceWorkbenchDetailEmpty(t("experience.detailLoading", {}, "Loading candidate details..."));
    if (getActiveTab() === "usage-overview") {
      renderExperienceWorkbenchUsageOverviewPanel();
    }

    const res = await sendReq({
      type: "req",
      id: makeId(),
      method: "experience.candidate.list",
      params: {
        limit: 120,
        agentId: requestContext.agentId,
      },
    });
    if (!isRequestCurrent(requestContext)) {
      return;
    }
    if (!res || !res.ok) {
      state.items = [];
      state.selectedId = null;
      state.selectedCandidate = null;
      renderExperienceWorkbenchStats(null);
      renderExperienceWorkbenchListEmpty(res?.error?.message || t("experience.loadFailed", {}, "Failed to load experience candidates."));
      renderExperienceWorkbenchDetailEmpty(res?.error?.message || t("experience.loadFailed", {}, "Failed to load experience candidates."));
      renderExperienceWorkbenchUsageOverviewEmpty(res?.error?.message || t("experience.loadFailed", {}, "Failed to load experience candidates."));
      return;
    }

    state.items = Array.isArray(res.payload?.items) ? res.payload.items : [];
    const filteredItems = getFilteredExperienceItems();
    const hasExistingSelection = state.selectedId && filteredItems.some((item) => String(item?.id || "") === String(state.selectedId));
    if (!hasExistingSelection) {
      state.selectedId = forceSelectFirst !== false && filteredItems[0]?.id
        ? String(filteredItems[0].id)
        : null;
      state.selectedCandidate = null;
    }
    await syncExperienceWorkbenchUi({ preferFirst: forceSelectFirst !== false, loadDetailIfNeeded: true });
    if (getActiveTab() === "usage-overview") {
      await loadExperienceWorkbenchUsageOverview();
    }
  }

  async function openExperienceWorkbench(options = {}) {
    const candidateId = normalizeText(options.candidateId);
    applyExperienceWorkbenchContext(options);
    await loadExperienceWorkbench(candidateId ? false : options.preferFirst !== false);
    if (candidateId) {
      await loadExperienceCandidateDetail(candidateId);
    }
  }

  async function reviewExperienceCandidate(candidateId, decision) {
    const normalizedCandidateId = typeof candidateId === "string" ? candidateId.trim() : "";
    const normalizedDecision = decision === "accept" || decision === "reject" ? decision : "";
    if (!normalizedCandidateId || !normalizedDecision) return null;
    if (!isConnected?.()) {
      showNotice(
        t("experience.reviewFailedTitle", {}, "Candidate action failed"),
        t("experience.disconnected", {}, "Connect to the server to view experience candidates."),
        "error",
      );
      return null;
    }
    if (getPendingActionKey()) return null;

    const memoryViewerState = typeof getMemoryViewerState === "function" ? getMemoryViewerState() : null;
    if (memoryViewerState) {
      memoryViewerState.pendingExperienceActionKey = `candidate:${normalizedCandidateId}:${normalizedDecision}`;
    }
    renderSelectedExperienceCandidate();
    syncGenerateControls();

    try {
      const res = await sendReq({
        type: "req",
        id: makeId(),
        method: normalizedDecision === "accept" ? "experience.candidate.accept" : "experience.candidate.reject",
        params: {
          candidateId: normalizedCandidateId,
          agentId: getActiveAgentId(),
        },
      });
      if (!res || !res.ok) {
        showNotice(
          t("experience.reviewFailedTitle", {}, "Candidate action failed"),
          res?.error?.message || t("experience.reviewFailedTitle", {}, "Candidate action failed"),
          "error",
        );
        return null;
      }
      showNotice(
        normalizedDecision === "accept"
          ? t("experience.reviewAcceptSuccessTitle", {}, "Candidate accepted")
          : t("experience.reviewRejectSuccessTitle", {}, "Candidate rejected"),
        normalizedDecision === "accept"
          ? t("experience.reviewAcceptSuccessMessage", {}, "The experience candidate was accepted and published.")
          : t("experience.reviewRejectSuccessMessage", {}, "The experience candidate was rejected."),
        "success",
        2200,
      );
      return res.payload?.candidate ?? null;
    } finally {
      if (memoryViewerState) {
        memoryViewerState.pendingExperienceActionKey = null;
      }
      syncGenerateControls();
      await loadExperienceWorkbench(false);
    }
  }

  async function updateSkillFreshnessStaleMark(input = {}) {
    const sourceCandidateId = normalizeText(input.sourceCandidateId);
    const skillKey = normalizeText(input.skillKey);
    const candidateId = normalizeText(input.candidateId);
    const stale = input.stale !== false;
    if (!sourceCandidateId && !skillKey) return null;
    if (!isConnected?.()) {
      showNotice(
        t("experience.skillFreshnessUpdateFailedTitle", {}, "Skill freshness update failed"),
        t("experience.disconnected", {}, "Connect to the server to view experience candidates."),
        "error",
      );
      return null;
    }
    if (getPendingActionKey()) return null;

    const memoryViewerState = typeof getMemoryViewerState === "function" ? getMemoryViewerState() : null;
    const pendingKey = `skill-freshness:${sourceCandidateId || skillKey}:${stale ? "stale" : "active"}`;
    if (memoryViewerState) {
      memoryViewerState.pendingExperienceActionKey = pendingKey;
    }
    renderSelectedExperienceCandidate();
    syncGenerateControls();

    try {
      const res = await sendReq({
        type: "req",
        id: makeId(),
        method: "experience.skill.freshness.update",
        params: {
          ...(sourceCandidateId ? { sourceCandidateId } : {}),
          ...(skillKey ? { skillKey } : {}),
          stale,
          agentId: getActiveAgentId(),
        },
      });
      if (!res || !res.ok) {
        showNotice(
          t("experience.skillFreshnessUpdateFailedTitle", {}, "Skill freshness update failed"),
          res?.error?.message || t("experience.skillFreshnessUpdateFailedTitle", {}, "Skill freshness update failed"),
          "error",
        );
        return null;
      }
      showNotice(
        t("experience.skillFreshnessUpdatedTitle", {}, "Skill freshness updated"),
        t("experience.skillFreshnessUpdatedMessage", {}, "The freshness state for this candidate has been refreshed."),
        "success",
        2200,
      );
      return res.payload ?? null;
    } finally {
      if (memoryViewerState) {
        memoryViewerState.pendingExperienceActionKey = null;
      }
      syncGenerateControls();
      if (candidateId) {
        await loadExperienceCandidateDetail(candidateId);
      } else {
        renderSelectedExperienceCandidate();
      }
    }
  }

  async function handleGenerateExperience(candidateType) {
    const state = getExperienceWorkbenchState();
    const taskId = normalizeText(state.generateTaskId);
    if (!taskId) {
      showNotice(
        t("experience.generateTaskRequiredTitle", {}, "Task ID required"),
        t("experience.generateTaskRequiredMessage", {}, "Provide the source taskId before generating a method or skill candidate."),
        "info",
        2400,
      );
      return null;
    }
    if (pendingGenerateActionKey || getPendingActionKey()) {
      return null;
    }
    pendingGenerateActionKey = `generate:${candidateType}:${taskId}`;
    syncGenerateControls();
    try {
      const candidate = await generateExperienceCandidate?.(taskId, candidateType);
      await loadExperienceWorkbench(false);
      if (candidate?.id) {
        const nextState = getExperienceWorkbenchState();
        nextState.selectedId = String(candidate.id);
        nextState.selectedCandidate = candidate;
        await syncExperienceWorkbenchUi({ preferFirst: false, loadDetailIfNeeded: true });
        return candidate;
      }
      await syncExperienceWorkbenchUi({ preferFirst: true, loadDetailIfNeeded: true });
      return null;
    } finally {
      pendingGenerateActionKey = "";
      syncGenerateControls();
    }
  }

  function bindUi() {
    if (uiBound) return;
    uiBound = true;
    if (experienceWorkbenchQueryEl) {
      experienceWorkbenchQueryEl.addEventListener("input", () => {
        setFilters({ query: experienceWorkbenchQueryEl.value });
        void syncExperienceWorkbenchUi({ preferFirst: true, loadDetailIfNeeded: true });
      });
    }
    if (experienceWorkbenchTypeFilterEl) {
      experienceWorkbenchTypeFilterEl.addEventListener("change", () => {
        setFilters({ type: experienceWorkbenchTypeFilterEl.value });
        void syncExperienceWorkbenchUi({ preferFirst: true, loadDetailIfNeeded: true });
      });
    }
    if (experienceWorkbenchStatusFilterEl) {
      experienceWorkbenchStatusFilterEl.addEventListener("change", () => {
        setFilters({ status: experienceWorkbenchStatusFilterEl.value });
        void syncExperienceWorkbenchUi({ preferFirst: true, loadDetailIfNeeded: true });
      });
    }
    if (experienceWorkbenchResetFiltersBtn) {
      experienceWorkbenchResetFiltersBtn.addEventListener("click", () => {
        setFilters({ query: "", type: "", status: "" });
        syncFilterUi();
        void syncExperienceWorkbenchUi({ preferFirst: true, loadDetailIfNeeded: true });
      });
    }
    if (experienceGenerateTaskIdEl) {
      experienceGenerateTaskIdEl.addEventListener("input", () => {
        const state = getExperienceWorkbenchState();
        state.generateTaskId = experienceGenerateTaskIdEl.value;
        syncGenerateControls();
      });
    }
    if (experienceGenerateMethodBtn) {
      experienceGenerateMethodBtn.addEventListener("click", () => {
        void handleGenerateExperience("method");
      });
    }
    if (experienceGenerateSkillBtn) {
      experienceGenerateSkillBtn.addEventListener("click", () => {
        void handleGenerateExperience("skill");
      });
    }
    if (experienceWorkbenchTabCandidatesBtn) {
      experienceWorkbenchTabCandidatesBtn.addEventListener("click", () => {
        setActiveTab("candidates");
        syncExperienceWorkbenchTabUi();
      });
    }
    if (experienceWorkbenchTabUsageOverviewBtn) {
      experienceWorkbenchTabUsageOverviewBtn.addEventListener("click", () => {
        setActiveTab("usage-overview");
        syncExperienceWorkbenchTabUi();
        void loadExperienceWorkbenchUsageOverview();
      });
    }
  }

  function resetExperienceWorkbenchStateForAgent(agentId = getActiveAgentId()) {
    const state = getExperienceWorkbenchState();
    state.requestToken = Number(state.requestToken || 0) + 1;
    state.activeAgentId = String(agentId || "default").trim() || "default";
    state.items = [];
    state.selectedId = null;
    state.selectedCandidate = null;
    state.stats = null;
    state.activeTab = "candidates";
  }

  async function refreshExperienceWorkbenchForAgentSwitch(agentId = getActiveAgentId()) {
    resetExperienceWorkbenchStateForAgent(agentId);
    syncExperienceWorkbenchHeaderTitle();
    syncFilterUi();
    if (!experienceWorkbenchSection || experienceWorkbenchSection.classList.contains("hidden")) {
      return;
    }
    await loadExperienceWorkbench(true);
  }

  return {
    applyExperienceWorkbenchContext,
    bindUi,
    loadExperienceWorkbench,
    loadExperienceCandidateDetail,
    openExperienceWorkbench,
    renderExperienceWorkbenchStats,
    renderExperienceWorkbenchListEmpty,
    renderExperienceWorkbenchDetailEmpty,
    resetExperienceWorkbenchStateForAgent,
    refreshExperienceWorkbenchForAgentSwitch,
    syncExperienceWorkbenchHeaderTitle,
    syncExperienceWorkbenchUi,
  };
}
