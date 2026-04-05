import {
  formatResidentSourceAuditSummary,
  formatResidentSourceConflictSummary,
  formatResidentSourceExplainability,
  formatResidentSourceScopeLabel,
  formatResidentSourceSummary,
  getResidentSourceBadgeClass,
} from "./memory-source-view.js";

export function createMemoryViewerFeature({
  refs,
  isConnected,
  sendReq,
  makeId,
  getMemoryViewerState,
  getSelectedAgentId,
  getSelectedAgentLabel,
  syncMemoryTaskGoalFilterUi,
  renderMemoryViewerListEmpty,
  renderMemoryViewerDetailEmpty,
  loadTaskDetail,
  loadMemoryDetail,
  escapeHtml,
  formatCount,
  formatDateTime,
  formatDuration,
  formatLineRange,
  formatScore,
  formatMemoryCategory,
  normalizeMemoryVisibility,
  getVisibilityBadgeClass,
  summarizeSourcePath,
  getTaskGoalId,
  getGoalDisplayName,
  getLatestExperienceUsageTimestamp,
  getActiveMemoryCategoryLabel,
  renderMemoryCategoryDistribution,
  renderTaskUsageOverviewCard,
  bindStatsAuditJumpLinks,
  bindMemoryPathLinks,
  bindTaskAuditJumpLinks,
  showNotice,
  t = (_key, _params, fallback) => fallback ?? "",
}) {
  const {
    memoryViewerSection,
    memoryViewerTitleEl,
    memoryViewerStatsEl,
    memoryViewerListEl,
    memoryViewerDetailEl,
    memoryTabTasksBtn,
    memoryTabMemoriesBtn,
    memoryTaskFiltersEl,
    memoryChunkFiltersEl,
    memorySearchInputEl,
    memoryTaskStatusFilterEl,
    memoryTaskSourceFilterEl,
    memoryChunkTypeFilterEl,
    memoryChunkVisibilityFilterEl,
    memoryChunkGovernanceFilterEl,
    memoryChunkCategoryFilterEl,
  } = refs;

  function getActiveAgentId() {
    const agentId = typeof getSelectedAgentId === "function" ? String(getSelectedAgentId() || "").trim() : "";
    return agentId || "default";
  }

  function buildScopedParams(params = {}, agentId = getActiveAgentId()) {
    return {
      ...params,
      agentId,
    };
  }

  function createMemoryViewerRequestContext(existingContext = null) {
    if (
      existingContext
      && Number.isFinite(Number(existingContext.requestToken))
      && typeof existingContext.agentId === "string"
      && existingContext.agentId.trim()
    ) {
      return {
        requestToken: Number(existingContext.requestToken),
        agentId: existingContext.agentId.trim(),
      };
    }

    const memoryViewerState = getMemoryViewerState();
    const requestToken = Number(memoryViewerState.requestToken || 0) + 1;
    const agentId = getActiveAgentId();
    memoryViewerState.requestToken = requestToken;
    memoryViewerState.activeAgentId = agentId;
    return { requestToken, agentId };
  }

  function isMemoryViewerRequestCurrent(requestContext) {
    if (!requestContext) return false;
    const memoryViewerState = getMemoryViewerState();
    const activeAgentId = String(memoryViewerState.activeAgentId || getActiveAgentId()).trim() || "default";
    return Number(memoryViewerState.requestToken || 0) === Number(requestContext.requestToken)
      && activeAgentId === requestContext.agentId;
  }

  function renderSourceViewBadge(sourceView) {
    const label = formatResidentSourceScopeLabel(sourceView);
    return `<span class="memory-badge ${getResidentSourceBadgeClass(sourceView)}">${escapeHtml(label)}</span>`;
  }

  function getMemorySharePromotionMetadata(item) {
    const metadata = item?.metadata;
    if (!metadata || typeof metadata !== "object") return null;
    const promotion = metadata.sharedPromotion;
    return promotion && typeof promotion === "object" ? promotion : null;
  }

  function normalizeMemorySharePromotionStatus(item) {
    const promotion = getMemorySharePromotionMetadata(item);
    const status = typeof promotion?.status === "string" ? promotion.status.trim().toLowerCase() : "";
    if (status === "pending" || status === "approved" || status === "rejected" || status === "revoked" || status === "active") {
      return status;
    }
    return "";
  }

  function formatMemorySharePromotionStatusLabel(status) {
    if (status === "pending") return t("memory.shareStatusPending", {}, "pending");
    if (status === "approved" || status === "active") return t("memory.shareStatusApproved", {}, "approved");
    if (status === "rejected") return t("memory.shareStatusRejected", {}, "rejected");
    if (status === "revoked") return t("memory.shareStatusRevoked", {}, "revoked");
    return "-";
  }

  function getMemoryShareActionMode(item) {
    const status = normalizeMemorySharePromotionStatus(item);
    if (!status || status === "rejected" || status === "revoked") return "request";
    if (status === "pending") return "pending";
    if (status === "approved" || status === "active") return "approved";
    return "request";
  }

  function formatSharedGovernanceSummary(item) {
    const promotion = getMemorySharePromotionMetadata(item);
    if (!promotion) {
      return t("memory.detailSharedGovernanceNone", {}, "This memory has not entered the shared review flow yet.");
    }
    const parts = [];
    const status = formatMemorySharePromotionStatusLabel(normalizeMemorySharePromotionStatus(item));
    if (status && status !== "-") {
      parts.push(`status=${status}`);
    }
    if (typeof promotion.sourceAgentId === "string" && promotion.sourceAgentId.trim()) {
      parts.push(`sourceAgent=${promotion.sourceAgentId.trim()}`);
    }
    const requestedAt = typeof promotion.requestedAt === "string" && promotion.requestedAt.trim()
      ? promotion.requestedAt.trim()
      : typeof promotion.promotedAt === "string" && promotion.promotedAt.trim()
        ? promotion.promotedAt.trim()
        : "";
    if (requestedAt) {
      parts.push(`requestedAt=${requestedAt}`);
    }
    if (typeof promotion.reason === "string" && promotion.reason.trim()) {
      parts.push(`reason=${promotion.reason.trim()}`);
    }
    if (typeof promotion.reviewerAgentId === "string" && promotion.reviewerAgentId.trim()) {
      parts.push(`reviewer=${promotion.reviewerAgentId.trim()}`);
    }
    if (typeof promotion.reviewedAt === "string" && promotion.reviewedAt.trim()) {
      parts.push(`reviewedAt=${promotion.reviewedAt.trim()}`);
    }
    if (typeof promotion.claimedByAgentId === "string" && promotion.claimedByAgentId.trim()) {
      parts.push(`claimedBy=${promotion.claimedByAgentId.trim()}`);
    }
    if (typeof promotion.claimedAt === "string" && promotion.claimedAt.trim()) {
      parts.push(`claimedAt=${promotion.claimedAt.trim()}`);
    }
    if (typeof promotion.decisionNote === "string" && promotion.decisionNote.trim()) {
      parts.push(`note=${promotion.decisionNote.trim()}`);
    }
    return parts.join(" | ");
  }

  function getMemoryShareScopeSourcePath(item) {
    const promotion = getMemorySharePromotionMetadata(item);
    if (typeof promotion?.sourcePath === "string" && promotion.sourcePath.trim()) {
      return promotion.sourcePath.trim();
    }
    return typeof item?.sourcePath === "string" ? item.sourcePath.trim() : "";
  }

  function getMemoryShareClaimOwner(item) {
    const promotion = getMemorySharePromotionMetadata(item);
    return typeof promotion?.claimedByAgentId === "string" ? promotion.claimedByAgentId.trim() : "";
  }

  function normalizeResidentQueryMode(queryView) {
    const mode = typeof queryView?.mode === "string" ? queryView.mode.trim().toLowerCase() : "";
    if (mode === "isolated" || mode === "shared" || mode === "hybrid") {
      return mode;
    }
    const scope = typeof queryView?.scope === "string" ? queryView.scope.trim().toLowerCase() : "";
    if (scope === "shared" || scope === "hybrid") {
      return scope;
    }
    return "isolated";
  }

  function formatResidentQueryModeLabel(queryView) {
    return normalizeResidentQueryMode(queryView);
  }

  function formatGovernanceFilterLabel(value) {
    switch (String(value || "").trim()) {
      case "pending":
        return t("memory.filters.governancePending", {}, "Pending");
      case "approved":
        return t("memory.filters.governanceApproved", {}, "Approved");
      case "rejected":
        return t("memory.filters.governanceRejected", {}, "Rejected");
      case "revoked":
        return t("memory.filters.governanceRevoked", {}, "Revoked");
      case "none":
        return t("memory.filters.governanceNone", {}, "No Review");
      default:
        return t("memory.filters.governanceAll", {}, "All Governance States");
    }
  }

  function formatResidentQueryModeSummary(queryView) {
    const mode = normalizeResidentQueryMode(queryView);
    if (mode === "shared") {
      return t(
        "memory.queryModeSummaryShared",
        {},
        "Read from and write to the shared team memory layer.",
      );
    }
    if (mode === "hybrid") {
      return t(
        "memory.queryModeSummaryHybrid",
        {},
        "Write to private memory, then read from both private and shared layers.",
      );
    }
    return t(
      "memory.queryModeSummaryIsolated",
      {},
      "Read from and write to the active agent's private memory only.",
    );
  }

  function syncMemoryViewerHeaderTitle() {
    if (!memoryViewerTitleEl) return;
    const agentName = typeof getSelectedAgentLabel === "function"
      ? String(getSelectedAgentLabel() || "").trim()
      : "";
    memoryViewerTitleEl.textContent = agentName
      ? t("memory.titleWithAgent", { agentName }, `${agentName} Memory Viewer`)
      : t("memory.title", {}, "Memory Viewer");
  }

  function formatTaskStatusLabel(status) {
    const normalized = typeof status === "string" ? status.trim().toLowerCase() : "";
    if (!normalized) return "未知";
    if (normalized === "running" || normalized === "executing" || normalized === "in_progress") return "运行中";
    if (normalized === "success" || normalized === "completed" || normalized === "done") return "成功";
    if (normalized === "failed" || normalized === "error") return "失败";
    if (normalized === "partial") return "部分完成";
    if (normalized === "pending") return "待处理";
    return status;
  }

  function formatTaskSourceLabel(source) {
    const normalized = typeof source === "string" ? source.trim().toLowerCase() : "";
    if (!normalized) return "未知来源";
    if (normalized === "chat") return "聊天";
    if (normalized === "sub_agent") return "子 Agent";
    if (normalized === "cron") return "定时任务";
    if (normalized === "heartbeat") return "心跳";
    if (normalized === "manual") return "手动";
    return source;
  }

  function formatMemoryTypeLabel(memoryType) {
    const normalized = typeof memoryType === "string" ? memoryType.trim().toLowerCase() : "";
    if (!normalized) return "其他";
    if (normalized === "core") return "核心";
    if (normalized === "daily") return "每日";
    if (normalized === "session") return "会话";
    if (normalized === "other") return "其他";
    return memoryType;
  }

  function formatMemorySourceTypeLabel(sourceType) {
    const normalized = typeof sourceType === "string" ? sourceType.trim().toLowerCase() : "";
    if (!normalized) return "未知来源";
    if (normalized === "task") return "任务";
    if (normalized === "conversation") return "会话";
    if (normalized === "file") return "文件";
    if (normalized === "experience") return "经验";
    if (normalized === "manual") return "手动";
    return sourceType;
  }

  function syncMemoryViewerUi() {
    syncMemoryViewerHeaderTitle();
    const memoryViewerState = getMemoryViewerState();
    const isTasks = memoryViewerState.tab === "tasks";
    if (memoryViewerSection) memoryViewerSection.classList.toggle("tasks-mode", isTasks);
    if (memoryTabTasksBtn) memoryTabTasksBtn.classList.toggle("active", isTasks);
    if (memoryTabMemoriesBtn) memoryTabMemoriesBtn.classList.toggle("active", !isTasks);
    if (memoryTaskFiltersEl) memoryTaskFiltersEl.classList.toggle("hidden", !isTasks);
    if (memoryChunkFiltersEl) memoryChunkFiltersEl.classList.toggle("hidden", isTasks);
    syncMemoryTaskGoalFilterUi();
  }

  function switchMemoryViewerTab(tab) {
    const memoryViewerState = getMemoryViewerState();
    if (memoryViewerState.tab === tab) return;
    memoryViewerState.tab = tab;
    memoryViewerState.items = [];
    memoryViewerState.selectedId = null;
    memoryViewerState.selectedTask = null;
    memoryViewerState.selectedCandidate = null;
    if (tab !== "tasks") {
      memoryViewerState.goalIdFilter = null;
    }
    syncMemoryViewerUi();
    void loadMemoryViewer(true);
  }

  async function loadMemoryViewer(forceSelectFirst = false) {
    if (!memoryViewerSection) return;
    syncMemoryViewerUi();
    const requestContext = createMemoryViewerRequestContext();

    if (!isConnected()) {
      renderMemoryViewerStats(null);
      renderMemoryViewerListEmpty(t("memory.disconnectedList", {}, "Not connected to the server."));
      renderMemoryViewerDetailEmpty(t("memory.disconnectedDetail", {}, "Tasks and memories will be available after connection is ready."));
      return;
    }

    const memoryViewerState = getMemoryViewerState();
    if (memoryViewerState.tab === "tasks") {
      await Promise.all([
        loadMemoryViewerStats(requestContext),
        loadTaskUsageOverview(requestContext),
      ]);
      if (!isMemoryViewerRequestCurrent(requestContext)) return;
      await loadTaskViewer(forceSelectFirst, requestContext);
    } else {
      memoryViewerState.selectedTask = null;
      memoryViewerState.selectedCandidate = null;
      await loadMemoryViewerStats(requestContext);
      if (!isMemoryViewerRequestCurrent(requestContext)) return;
      await loadMemoryChunkViewer(forceSelectFirst, requestContext);
    }
  }

  async function loadMemoryViewerStats(existingContext = null) {
    const requestContext = createMemoryViewerRequestContext(existingContext);
    const res = await sendReq({
      type: "req",
      id: makeId(),
      method: "memory.stats",
      params: buildScopedParams({}, requestContext.agentId),
    });
    const memoryViewerState = getMemoryViewerState();
    if (!isMemoryViewerRequestCurrent(requestContext)) return;
    if (!res || !res.ok) {
      memoryViewerState.sharedGovernance = null;
      renderMemoryViewerStats(null);
      return;
    }
    memoryViewerState.stats = res.payload?.status ?? null;
    memoryViewerState.memoryQueryView = res.payload?.queryView ?? null;
    memoryViewerState.sharedGovernance = res.payload?.sharedGovernance ?? null;
    renderMemoryViewerStats(memoryViewerState.stats);
  }

  async function promoteSelectedMemoryToShared(item) {
    if (!item?.id) return;
    const reason = window.prompt(
      t("memory.sharePromotePrompt", {}, "Enter the reason for promoting this memory to the shared layer."),
      t("memory.sharePromotePromptDefault", {}, "Manual promotion from memory viewer"),
    );
    if (reason === null) return;

    const trimmedReason = String(reason || "").trim();
    if (!trimmedReason) {
      showNotice?.(
        t("memory.sharePromoteFailedTitle", {}, "Shared Promotion Failed"),
        t("memory.sharePromotePrompt", {}, "Enter the reason for promoting this memory to the shared layer."),
        "error",
      );
      return;
    }

    const res = await sendReq({
      type: "req",
      id: makeId(),
      method: "memory.share.promote",
      params: buildScopedParams({
        chunkId: item.id,
        reason: trimmedReason,
      }),
    });
    if (!res || !res.ok) {
      showNotice?.(
        t("memory.sharePromoteFailedTitle", {}, "Shared Promotion Failed"),
        res?.error?.message || t("memory.memoryReadFailed", {}, "Failed to read memory data."),
        "error",
        4200,
      );
      return;
    }

    showNotice?.(
      t("memory.sharePromoteSuccessTitle", {}, "Shared Promotion Complete"),
      t("memory.sharePromoteSuccessMessage", { count: Number(res.payload?.promotedCount) || 0 }, "The shared copy has been written and the private copy is kept."),
      "success",
      2600,
    );

    await loadMemoryViewer(false);
    if (getMemoryViewerState().selectedId) {
      await loadMemoryDetail(getMemoryViewerState().selectedId);
    }
  }

  async function reviewSelectedMemoryShare(item, decision, scope = "chunk") {
    if (!item?.id) return;
    const promptKey = decision === "approved"
      ? "memory.shareReviewPromptApprove"
      : decision === "rejected"
        ? "memory.shareReviewPromptReject"
        : "memory.shareReviewPromptRevoke";
    const note = window.prompt(
      t(promptKey, {}, "Optional note"),
      "",
    );
    if (note === null) return;

    const res = await sendReq({
      type: "req",
      id: makeId(),
      method: "memory.share.review",
      params: buildScopedParams({
        ...(scope === "source"
          ? { sourcePath: getMemoryShareScopeSourcePath(item) }
          : { chunkId: item.id }),
        decision,
        note: String(note || "").trim(),
      }),
    });
    if (!res || !res.ok) {
      showNotice?.(
        t("memory.shareReviewFailedTitle", {}, "Failed to Update Shared Review"),
        res?.error?.message || t("memory.memoryReadFailed", {}, "Failed to read memory data."),
        "error",
        4200,
      );
      return;
    }

    showNotice?.(
      t("memory.shareReviewSuccessTitle", {}, "Shared Review Updated"),
      t(
        "memory.shareReviewSuccessMessage",
        {
          decision,
          count: Number(res.payload?.reviewedCount) || 0,
          scope: res.payload?.mode || scope,
        },
        "Shared status has been updated.",
      ),
      "success",
      2600,
    );

    await loadMemoryViewer(false);
    if (getMemoryViewerState().selectedId) {
      await loadMemoryDetail(getMemoryViewerState().selectedId);
    }
  }

  async function claimSelectedMemoryShare(item, action, scope = "chunk") {
    if (!item?.id) return;
    const res = await sendReq({
      type: "req",
      id: makeId(),
      method: "memory.share.claim",
      params: buildScopedParams({
        action,
        ...(scope === "source"
          ? { sourcePath: getMemoryShareScopeSourcePath(item) }
          : { chunkId: item.id }),
      }),
    });
    if (!res || !res.ok) {
      showNotice?.(
        t("memory.shareClaimFailedTitle", {}, "Failed to Update Shared Claim"),
        res?.error?.message || t("memory.memoryReadFailed", {}, "Failed to read memory data."),
        "error",
        4200,
      );
      return;
    }

    showNotice?.(
      t("memory.shareClaimSuccessTitle", {}, "Shared Claim Updated"),
      t(
        "memory.shareClaimSuccessMessage",
        {
          action,
          count: Number(res.payload?.claimedCount) || 0,
          scope: res.payload?.mode || scope,
        },
        "Shared review claim has been updated.",
      ),
      "success",
      2600,
    );

    await loadMemoryViewer(false);
    if (getMemoryViewerState().selectedId) {
      await loadMemoryDetail(getMemoryViewerState().selectedId);
    }
  }

  function bindMemoryDetailActions(item) {
    if (!memoryViewerDetailEl || !item?.id) return;
    memoryViewerDetailEl.querySelectorAll("[data-memory-share-promote]").forEach((node) => {
      node.addEventListener("click", () => {
        void promoteSelectedMemoryToShared(item);
      });
    });
    memoryViewerDetailEl.querySelectorAll("[data-memory-share-decision]").forEach((node) => {
      node.addEventListener("click", () => {
        const decision = node.getAttribute("data-memory-share-decision") || "";
        if (!decision) return;
        const scope = node.getAttribute("data-memory-share-decision-scope") || "chunk";
        void reviewSelectedMemoryShare(item, decision, scope);
      });
    });
    memoryViewerDetailEl.querySelectorAll("[data-memory-share-claim]").forEach((node) => {
      node.addEventListener("click", () => {
        const action = node.getAttribute("data-memory-share-claim") || "";
        if (!action) return;
        const scope = node.getAttribute("data-memory-share-claim-scope") || "chunk";
        void claimSelectedMemoryShare(item, action, scope);
      });
    });
  }

  async function loadTaskUsageOverview(existingContext = null) {
    const requestContext = createMemoryViewerRequestContext(existingContext);
    const memoryViewerState = getMemoryViewerState();
    const seq = memoryViewerState.usageOverviewSeq + 1;
    memoryViewerState.usageOverviewSeq = seq;
    memoryViewerState.usageOverview = {
      ...memoryViewerState.usageOverview,
      loading: true,
    };
    renderMemoryViewerStats(memoryViewerState.stats);

    const [methodsRes, skillsRes] = await Promise.all([
      sendReq({
        type: "req",
        id: makeId(),
        method: "experience.usage.stats",
        params: buildScopedParams({ limit: 6, filter: { assetType: "method" } }, requestContext.agentId),
      }),
      sendReq({
        type: "req",
        id: makeId(),
        method: "experience.usage.stats",
        params: buildScopedParams({ limit: 6, filter: { assetType: "skill" } }, requestContext.agentId),
      }),
    ]);

    if (
      memoryViewerState.tab !== "tasks"
      || memoryViewerState.usageOverviewSeq !== seq
      || !isMemoryViewerRequestCurrent(requestContext)
    ) {
      return;
    }

    memoryViewerState.usageOverview = {
      loading: false,
      methods: methodsRes?.ok && Array.isArray(methodsRes.payload?.items) ? methodsRes.payload.items : [],
      skills: skillsRes?.ok && Array.isArray(skillsRes.payload?.items) ? skillsRes.payload.items : [],
    };
    memoryViewerState.experienceQueryView = methodsRes?.payload?.queryView ?? skillsRes?.payload?.queryView ?? null;
    renderMemoryViewerStats(memoryViewerState.stats);
  }

  async function loadTaskViewer(forceSelectFirst = false, existingContext = null) {
    const requestContext = createMemoryViewerRequestContext(existingContext);
    renderMemoryViewerListEmpty(t("memory.tasksLoading", {}, "Loading tasks..."));
    renderMemoryViewerDetailEmpty(t("memory.taskDetailLoading", {}, "Loading task details..."));

    const memoryViewerState = getMemoryViewerState();
    memoryViewerState.selectedTask = null;
    renderMemoryViewerStats(memoryViewerState.stats);

    const params = { limit: 20, summaryOnly: true };
    const query = memorySearchInputEl ? memorySearchInputEl.value.trim() : "";
    if (query) params.query = query;

    const filter = {};
    if (memoryTaskStatusFilterEl?.value) filter.status = memoryTaskStatusFilterEl.value;
    if (memoryTaskSourceFilterEl?.value) filter.source = memoryTaskSourceFilterEl.value;
    if (memoryViewerState.goalIdFilter) filter.goalId = memoryViewerState.goalIdFilter;
    if (Object.keys(filter).length > 0) params.filter = filter;

    const res = await sendReq({
      type: "req",
      id: makeId(),
      method: "memory.task.list",
      params: buildScopedParams(params, requestContext.agentId),
    });
    if (!isMemoryViewerRequestCurrent(requestContext)) return;
    if (!res || !res.ok) {
      memoryViewerState.selectedTask = null;
      renderMemoryViewerListEmpty(t("memory.taskListLoadFailed", {}, "Failed to load task list."));
      renderMemoryViewerDetailEmpty(res?.error?.message || t("memory.taskReadFailed", {}, "Failed to read task data."));
      renderMemoryViewerStats(memoryViewerState.stats);
      return;
    }

    const items = Array.isArray(res.payload?.items) ? res.payload.items : [];
    memoryViewerState.items = items;
    renderMemoryViewerStats(memoryViewerState.stats);

    if (!items.length) {
      memoryViewerState.selectedId = null;
      memoryViewerState.selectedTask = null;
      renderTaskList(items);
      renderMemoryViewerDetailEmpty(t("memory.noMatchingTasks", {}, "No matching tasks."));
      renderMemoryViewerStats(memoryViewerState.stats);
      return;
    }

    const selectedExists = items.some((item) => item.id === memoryViewerState.selectedId);
    if (forceSelectFirst || !selectedExists) {
      memoryViewerState.selectedId = items[0].id;
    }

    renderTaskList(items);
    await loadTaskDetail(memoryViewerState.selectedId, requestContext);
  }

  async function loadMemoryChunkViewer(forceSelectFirst = false, existingContext = null) {
    const requestContext = createMemoryViewerRequestContext(existingContext);
    renderMemoryViewerListEmpty(t("memory.memoriesLoading", {}, "Loading memories..."));
    renderMemoryViewerDetailEmpty(t("memory.memoryDetailLoading", {}, "Loading memory details..."));

    const query = memorySearchInputEl ? memorySearchInputEl.value.trim() : "";
    const filter = {};
    if (memoryChunkTypeFilterEl?.value) filter.memoryType = memoryChunkTypeFilterEl.value;
    if (memoryChunkVisibilityFilterEl?.value) filter.scope = memoryChunkVisibilityFilterEl.value;
    if (memoryChunkGovernanceFilterEl?.value) filter.sharedPromotionStatus = memoryChunkGovernanceFilterEl.value;
    if (memoryChunkCategoryFilterEl?.value) {
      if (memoryChunkCategoryFilterEl.value === "uncategorized") {
        filter.uncategorized = true;
      } else {
        filter.category = memoryChunkCategoryFilterEl.value;
      }
    }

    const params = { limit: 20, includeContent: false };
    if (Object.keys(filter).length > 0) params.filter = filter;
    if (query) params.query = query;

    const method = query ? "memory.search" : "memory.recent";
    const res = await sendReq({
      type: "req",
      id: makeId(),
      method,
      params: buildScopedParams(params, requestContext.agentId),
    });
    const memoryViewerState = getMemoryViewerState();
    if (!isMemoryViewerRequestCurrent(requestContext)) return;
    if (!res || !res.ok) {
      renderMemoryViewerListEmpty(t("memory.memoryListLoadFailed", {}, "Failed to load memory list."));
      renderMemoryViewerDetailEmpty(res?.error?.message || t("memory.memoryReadFailed", {}, "Failed to read memory data."));
      return;
    }

    const items = Array.isArray(res.payload?.items) ? res.payload.items : [];
    memoryViewerState.items = items;
    memoryViewerState.memoryQueryView = res.payload?.queryView ?? memoryViewerState.memoryQueryView ?? null;
    renderMemoryViewerStats(memoryViewerState.stats);

    if (!items.length) {
      memoryViewerState.selectedId = null;
      renderMemoryList(items);
      renderMemoryViewerDetailEmpty(t("memory.noMatchingMemories", {}, "No matching memories."));
      return;
    }

    const selectedExists = items.some((item) => item.id === memoryViewerState.selectedId);
    if (forceSelectFirst || !selectedExists) {
      memoryViewerState.selectedId = items[0].id;
    }

    renderMemoryList(items);
    await loadMemoryDetail(memoryViewerState.selectedId, requestContext);
  }

  function renderMemoryViewerStats(stats) {
    if (!memoryViewerStatsEl) return;
    if (!stats) {
      memoryViewerStatsEl.innerHTML = `
        <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.statFiles", {}, "Memory Files"))}</span><strong class="memory-stat-value">--</strong></div>
        <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.statChunks", {}, "Memory Chunks"))}</span><strong class="memory-stat-value">--</strong></div>
        <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.statVectors", {}, "Vector Index"))}</span><strong class="memory-stat-value">--</strong></div>
        <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.statSummaries", {}, "Summaries Ready"))}</span><strong class="memory-stat-value">--</strong></div>
      `;
      return;
    }

    const memoryViewerState = getMemoryViewerState();
    if (memoryViewerState.tab === "memories") {
      const items = Array.isArray(memoryViewerState.items) ? memoryViewerState.items : [];
      const currentCategorized = items.filter((item) => Boolean(item?.category)).length;
      const currentUncategorized = items.length - currentCategorized;
      const activeCategoryLabel = getActiveMemoryCategoryLabel();
      const distributionCard = renderMemoryCategoryDistribution(stats);
      const queryView = memoryViewerState.memoryQueryView;
      const sharedGovernance = memoryViewerState.sharedGovernance;
      const governanceFilterLabel = formatGovernanceFilterLabel(memoryChunkGovernanceFilterEl?.value);

      memoryViewerStatsEl.innerHTML = `
        <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.statCurrentResults", {}, "Current Results"))}</span><strong class="memory-stat-value">${formatCount(items.length)}</strong></div>
        <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.statQueryStrategy", {}, "Current Query Strategy"))}</span><strong class="memory-stat-value memory-stat-value-compact">${escapeHtml(formatResidentQueryModeLabel(queryView))}</strong><div class="memory-stat-caption">${escapeHtml(formatResidentQueryModeSummary(queryView))}</div></div>
        <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.statGovernanceFilter", {}, "Current Governance Filter"))}</span><strong class="memory-stat-value memory-stat-value-compact">${escapeHtml(governanceFilterLabel)}</strong></div>
        <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.statSharedPendingQueue", {}, "Pending Shared Queue"))}</span><strong class="memory-stat-value">${formatCount(sharedGovernance?.pendingCount)}</strong></div>
        <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.statSharedClaimed", {}, "Claimed Pending"))}</span><strong class="memory-stat-value">${formatCount(sharedGovernance?.claimedCount)}</strong></div>
        <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.statSharedApproved", {}, "Approved Shared"))}</span><strong class="memory-stat-value">${formatCount(sharedGovernance?.approvedCount)}</strong></div>
        <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.statSharedRejected", {}, "Rejected Shared"))}</span><strong class="memory-stat-value">${formatCount(sharedGovernance?.rejectedCount)}</strong></div>
        <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.statSharedRevoked", {}, "Revoked Shared"))}</span><strong class="memory-stat-value">${formatCount(sharedGovernance?.revokedCount)}</strong></div>
        <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.statFilteredCategory", {}, "Filtered Category"))}</span><strong class="memory-stat-value">${escapeHtml(activeCategoryLabel)}</strong></div>
        <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.statCurrentCategorized", {}, "Currently Categorized"))}</span><strong class="memory-stat-value">${formatCount(currentCategorized)}</strong></div>
        <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.statCurrentUncategorized", {}, "Currently Uncategorized"))}</span><strong class="memory-stat-value">${formatCount(currentUncategorized)}</strong></div>
        <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.statLibraryCategorized", {}, "Library Categorized"))}</span><strong class="memory-stat-value">${formatCount(stats.categorized)}</strong></div>
        <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.statLibraryUncategorized", {}, "Library Uncategorized"))}</span><strong class="memory-stat-value">${formatCount(stats.uncategorized)}</strong></div>
        ${distributionCard}
      `;
      return;
    }

    const selectedTask = memoryViewerState.selectedTask;
    const usedMethods = Array.isArray(selectedTask?.usedMethods) ? selectedTask.usedMethods : [];
    const usedSkills = Array.isArray(selectedTask?.usedSkills) ? selectedTask.usedSkills : [];
    const lastUsedAt = getLatestExperienceUsageTimestamp(usedMethods, usedSkills);
    const activeGoalId = memoryViewerState.goalIdFilter;
    const activeGoalLabel = activeGoalId ? getGoalDisplayName(activeGoalId) : "-";
    const queryView = memoryViewerState.experienceQueryView || memoryViewerState.memoryQueryView;

    memoryViewerStatsEl.innerHTML = `
      <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.statCurrentTaskResults", {}, "Current Task Results"))}</span><strong class="memory-stat-value">${formatCount(Array.isArray(memoryViewerState.items) ? memoryViewerState.items.length : 0)}</strong></div>
      <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.statExperienceQueryStrategy", {}, "Current Experience Query Strategy"))}</span><strong class="memory-stat-value memory-stat-value-compact">${escapeHtml(formatResidentQueryModeLabel(queryView))}</strong><div class="memory-stat-caption">${escapeHtml(formatResidentQueryModeSummary(queryView))}</div></div>
      <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.statUsedMethods", {}, "Methods Used"))}</span><strong class="memory-stat-value">${formatCount(usedMethods.length)}</strong></div>
      <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.statUsedSkills", {}, "Skills Used"))}</span><strong class="memory-stat-value">${formatCount(usedSkills.length)}</strong></div>
      <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.statLastUsedAt", {}, "Last Used At"))}</span><strong class="memory-stat-value memory-stat-value-compact">${escapeHtml(formatDateTime(lastUsedAt))}</strong></div>
      ${activeGoalId ? `<div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.statGoalFilter", {}, "Goal Filter"))}</span><strong class="memory-stat-value memory-stat-value-compact">${escapeHtml(activeGoalLabel)}</strong><div class="memory-stat-caption">${escapeHtml(activeGoalId)}</div></div>` : ""}
      ${renderTaskUsageOverviewCard()}
    `;
    bindStatsAuditJumpLinks();
  }

  function renderTaskList(items) {
    if (!memoryViewerListEl) return;
    if (!items.length) {
      renderMemoryViewerListEmpty(t("memory.emptyNoTasks", {}, "No tasks to display."));
      return;
    }

    const memoryViewerState = getMemoryViewerState();
    memoryViewerListEl.innerHTML = items.map((item) => {
      const title = item.title || item.objective || item.summary || item.conversationId || item.id;
      const snippet = item.summary || item.outcome || item.objective || t("memory.emptyNoSummary", {}, "No summary");
      const isActive = item.id === memoryViewerState.selectedId;
      const goalId = getTaskGoalId(item);
      return `
        <div class="memory-list-item ${isActive ? "active" : ""}" data-task-id="${escapeHtml(item.id)}">
          <div class="memory-list-item-title">${escapeHtml(title)}</div>
          <div class="memory-list-item-meta">
            <span>${escapeHtml(formatTaskStatusLabel(item.status))}</span>
            <span>${escapeHtml(formatTaskSourceLabel(item.source))}</span>
            ${goalId ? `<span class="memory-badge memory-badge-shared">${escapeHtml(getGoalDisplayName(goalId))}</span>` : ""}
            <span>${escapeHtml(formatDateTime(item.finishedAt || item.startedAt || item.createdAt))}</span>
          </div>
          <div class="memory-list-item-snippet">${escapeHtml(snippet)}</div>
        </div>
      `;
    }).join("");

    memoryViewerListEl.querySelectorAll("[data-task-id]").forEach((node) => {
      node.addEventListener("click", async () => {
        const taskId = node.getAttribute("data-task-id");
        if (!taskId) return;
        memoryViewerState.selectedId = taskId;
        renderTaskList(memoryViewerState.items);
        await loadTaskDetail(taskId);
      });
    });
  }

  function renderMemoryList(items) {
    if (!memoryViewerListEl) return;
    if (!items.length) {
      renderMemoryViewerListEmpty(t("memory.emptyNoMemories", {}, "No memories to display."));
      return;
    }

    const memoryViewerState = getMemoryViewerState();
    memoryViewerListEl.innerHTML = items.map((item) => {
      const title = summarizeSourcePath(item.sourcePath);
      const summary = item.summary || item.snippet || t("memory.emptyNoSummary", {}, "No summary");
      const isActive = item.id === memoryViewerState.selectedId;
      const visibility = normalizeMemoryVisibility(item.visibility);
      const category = formatMemoryCategory(item.category);
      const sourceView = item.sourceView || { scope: visibility };
      return `
        <div class="memory-list-item ${isActive ? "active" : ""}" data-memory-id="${escapeHtml(item.id)}">
          <div class="memory-list-item-title">${escapeHtml(title)}</div>
          <div class="memory-list-item-meta">
            <span>${escapeHtml(formatMemoryTypeLabel(item.memoryType))}</span>
            <span>${escapeHtml(formatMemorySourceTypeLabel(item.sourceType))}</span>
            <span class="memory-badge ${getVisibilityBadgeClass(visibility)}">${escapeHtml(visibility)}</span>
            ${renderSourceViewBadge(sourceView)}
            <span class="memory-badge">${escapeHtml(category)}</span>
            <span>score ${formatScore(item.score)}</span>
          </div>
          <div class="memory-list-item-snippet">${escapeHtml(summary)}</div>
        </div>
      `;
    }).join("");

    memoryViewerListEl.querySelectorAll("[data-memory-id]").forEach((node) => {
      node.addEventListener("click", async () => {
        const chunkId = node.getAttribute("data-memory-id");
        if (!chunkId) return;
        memoryViewerState.selectedId = chunkId;
        renderMemoryList(memoryViewerState.items);
        await loadMemoryDetail(chunkId);
      });
    });
  }

  function renderCandidateDetailPanel(candidate) {
    if (!candidate) return "";
    const snapshot = candidate.sourceTaskSnapshot || {};
    const memoryLinks = Array.isArray(snapshot.memoryLinks) ? snapshot.memoryLinks : [];
    const artifactPaths = Array.isArray(snapshot.artifactPaths) ? snapshot.artifactPaths : [];
    const toolCalls = Array.isArray(snapshot.toolCalls) ? snapshot.toolCalls : [];
    const candidateSourceView = candidate.sourceView || null;
    const candidateSourceExplanation = candidateSourceView ? formatResidentSourceExplainability(candidateSourceView) : "-";
    const candidateSourceConflict = candidateSourceView ? formatResidentSourceConflictSummary(candidateSourceView) : "-";

    return `
      <div class="memory-detail-card">
        <div class="memory-inline-item-head">
          <span class="memory-detail-label">${escapeHtml(t("memory.candidatePanelTitle", {}, "Candidate Detail Panel"))}</span>
          <div class="memory-detail-badges">
            <span class="memory-badge">${escapeHtml(candidate.type || "未知类型")}</span>
            <span class="memory-badge">${escapeHtml(formatTaskStatusLabel(candidate.status))}</span>
            ${candidateSourceView ? renderSourceViewBadge(candidateSourceView) : ""}
            <button class="memory-usage-action-btn" data-close-candidate-panel="1">${escapeHtml(t("memory.close", {}, "Close"))}</button>
          </div>
        </div>
        <div class="memory-detail-text"><strong>${escapeHtml(candidate.title || candidate.id || t("memory.candidateUntitled", {}, "Untitled Candidate"))}</strong></div>
        <div class="memory-detail-grid">
          <div class="memory-detail-card"><span class="memory-detail-label">候选 ID</span><div class="memory-detail-text">${escapeHtml(candidate.id || "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">来源任务</span><div class="memory-detail-text">${candidate.taskId ? `<button class="memory-path-link" data-open-task-id="${escapeHtml(candidate.taskId)}">${escapeHtml(candidate.taskId)}</button>` : "-"}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">标识</span><div class="memory-detail-text">${escapeHtml(candidate.slug || "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">发布路径</span><div class="memory-detail-text">${candidate.publishedPath ? `<button class="memory-path-link" data-open-source="${escapeHtml(candidate.publishedPath)}">${escapeHtml(candidate.publishedPath)}</button>` : "-"}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">来源视角</span><div class="memory-detail-text">${escapeHtml(formatResidentSourceSummary(candidateSourceView))}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">来源解释</span><div class="memory-detail-text">${escapeHtml(candidateSourceExplanation)}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">冲突说明</span><div class="memory-detail-text">${escapeHtml(candidateSourceConflict)}</div></div>
        </div>
        ${candidate.summary ? `<div class="memory-detail-text">${escapeHtml(candidate.summary)}</div>` : ""}
        <div class="memory-detail-card">
          <span class="memory-detail-label">${escapeHtml(t("memory.snapshotTitle", {}, "Source Snapshot"))}</span>
          <div class="memory-detail-grid">
            <div class="memory-detail-card"><span class="memory-detail-label">会话</span><div class="memory-detail-text">${escapeHtml(snapshot.conversationId || "-")}</div></div>
            <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.snapshotStatus", {}, "Status"))}</span><div class="memory-detail-text">${escapeHtml(formatTaskStatusLabel(snapshot.status) || "-")}</div></div>
            <div class="memory-detail-card"><span class="memory-detail-label">来源</span><div class="memory-detail-text">${escapeHtml(formatTaskSourceLabel(snapshot.source) || "-")}</div></div>
            <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.snapshotStartedAt", {}, "Started At"))}</span><div class="memory-detail-text">${escapeHtml(formatDateTime(snapshot.startedAt))}</div></div>
          </div>
          ${snapshot.objective ? `<div class="memory-detail-text"><strong>目标说明：</strong>${escapeHtml(snapshot.objective)}</div>` : ""}
          ${snapshot.summary ? `<div class="memory-detail-text"><strong>摘要：</strong>${escapeHtml(snapshot.summary)}</div>` : ""}
        </div>
        <div class="memory-detail-card">
          <span class="memory-detail-label">${escapeHtml(t("memory.linkedSourceMemories", {}, "Source Memories"))} (${memoryLinks.length})</span>
          ${memoryLinks.length ? `
            <div class="memory-inline-list">
              ${memoryLinks.map((link) => `
                <div class="memory-inline-item">
                  <div class="memory-inline-item-head">
                    <span class="memory-badge">${escapeHtml(link.relation || "已使用")}</span>
                    ${link.memoryType ? `<span class="memory-badge">${escapeHtml(formatMemoryTypeLabel(link.memoryType))}</span>` : ""}
                    ${link.sourceView ? renderSourceViewBadge(link.sourceView) : ""}
                    <button class="memory-path-link" data-open-memory-id="${escapeHtml(link.chunkId || "")}">${escapeHtml(link.chunkId || "打开记忆")}</button>
                  </div>
                  ${link.sourcePath ? `<button class="memory-path-link" data-open-source="${escapeHtml(link.sourcePath)}">${escapeHtml(link.sourcePath)}</button>` : ""}
                  ${link.snippet ? `<div class="memory-detail-text">${escapeHtml(link.snippet)}</div>` : ""}
                  ${link.sourceView ? `<div class="memory-detail-text">${escapeHtml(formatResidentSourceExplainability(link.sourceView))}</div>` : ""}
                  ${link.sourceView ? `<div class="memory-detail-text">${escapeHtml(formatResidentSourceConflictSummary(link.sourceView))}</div>` : ""}
                </div>
              `).join("")}
            </div>
          ` : `<div class="memory-detail-text">${escapeHtml(t("memory.noSourceMemoryLinks", {}, "No source memory links."))}</div>`}
        </div>
        <div class="memory-detail-card">
          <span class="memory-detail-label">${escapeHtml(t("memory.sourceArtifacts", {}, "Source Artifacts"))} (${artifactPaths.length})</span>
          ${artifactPaths.length ? `
            <div class="memory-inline-list">
              ${artifactPaths.map((artifactPath) => `
                <div class="memory-inline-item">
                  <button class="memory-path-link" data-open-source="${escapeHtml(artifactPath)}">${escapeHtml(artifactPath)}</button>
                </div>
              `).join("")}
            </div>
          ` : `<div class="memory-detail-text">${escapeHtml(t("memory.noSourceArtifacts", {}, "No source artifacts."))}</div>`}
        </div>
        <div class="memory-detail-card">
          <span class="memory-detail-label">工具调用（${toolCalls.length}）</span>
          ${toolCalls.length ? `
            <div class="memory-inline-list">
              ${toolCalls.map((call) => `
                <div class="memory-inline-item">
                  <div class="memory-inline-item-head">
                    <span class="memory-badge">${escapeHtml(call.toolName || "未知工具")}</span>
                    <span class="memory-badge">${call.success ? "成功" : "失败"}</span>
                    <span class="memory-badge">${escapeHtml(formatDuration(call.durationMs))}</span>
                  </div>
                  ${call.note ? `<div class="memory-detail-text">${escapeHtml(call.note)}</div>` : ""}
                </div>
              `).join("")}
            </div>
          ` : `<div class="memory-detail-text">${escapeHtml(t("memory.noToolCalls", {}, "No tool call records."))}</div>`}
        </div>
        <div class="memory-detail-card">
          <span class="memory-detail-label">候选内容</span>
          <pre class="memory-detail-pre">${escapeHtml(candidate.content || t("memory.noContent", {}, "No content"))}</pre>
        </div>
      </div>
    `;
  }

  function renderCandidateOnlyDetail(candidate) {
    if (!memoryViewerDetailEl) return;
    if (!candidate) {
      renderMemoryViewerDetailEmpty(t("memory.candidateMissing", {}, "Candidate not found."));
      return;
    }
    memoryViewerDetailEl.innerHTML = `
      <div class="memory-detail-shell">
        ${renderCandidateDetailPanel(candidate)}
      </div>
    `;
    bindMemoryPathLinks();
    bindTaskAuditJumpLinks();
  }

  function renderMemoryDetail(item) {
    if (!memoryViewerDetailEl) return;
    if (!item) {
      renderMemoryViewerDetailEmpty(t("memory.memoryMissing", {}, "Memory not found."));
      return;
    }

    const visibility = normalizeMemoryVisibility(item.visibility);
    const category = formatMemoryCategory(item.category);
    const sourceView = item.sourceView || { scope: visibility };
    const promotion = getMemorySharePromotionMetadata(item);
    const shareStatus = formatMemorySharePromotionStatusLabel(normalizeMemorySharePromotionStatus(item));
    const shareActionMode = getMemoryShareActionMode(item);
    const governanceSummary = formatSharedGovernanceSummary(item);
    const sourceExplanation = formatResidentSourceExplainability(sourceView);
    const sourceConflictSummary = formatResidentSourceConflictSummary(sourceView);
    const sourceAuditSummary = formatResidentSourceAuditSummary(sourceView);
    const shareScopeSourcePath = getMemoryShareScopeSourcePath(item);
    const shareActionScope = shareScopeSourcePath ? "source" : "chunk";
    const claimOwner = getMemoryShareClaimOwner(item);
    const shareActionButtons = [];
    if (shareActionMode === "request" && sourceView.scope !== "shared") {
      shareActionButtons.push(
        `<button class="memory-usage-action-btn" data-memory-share-promote="${escapeHtml(item.id)}">${escapeHtml(t("memory.sharePromoteAction", {}, "Submit Shared Review"))}</button>`,
      );
    }
    if (shareActionMode === "pending") {
      if (claimOwner === getActiveAgentId()) {
        shareActionButtons.push(
          `<button class="memory-usage-action-btn" data-memory-share-claim="release" data-memory-share-claim-scope="${escapeHtml(shareActionScope)}">${escapeHtml(t("memory.shareReleaseAction", {}, "Release"))}</button>`,
        );
        shareActionButtons.push(
          `<button class="memory-usage-action-btn" data-memory-share-decision="approved">${escapeHtml(t("memory.shareReviewApproveAction", {}, "Approve"))}</button>`,
        );
        shareActionButtons.push(
          `<button class="memory-usage-action-btn" data-memory-share-decision="rejected">${escapeHtml(t("memory.shareReviewRejectAction", {}, "Reject"))}</button>`,
        );
        if (shareActionScope === "source") {
          shareActionButtons.push(
            `<button class="memory-usage-action-btn" data-memory-share-decision="approved" data-memory-share-decision-scope="source">${escapeHtml(t("memory.shareReviewApproveBatchAction", {}, "Approve Source Group"))}</button>`,
          );
          shareActionButtons.push(
            `<button class="memory-usage-action-btn" data-memory-share-decision="rejected" data-memory-share-decision-scope="source">${escapeHtml(t("memory.shareReviewRejectBatchAction", {}, "Reject Source Group"))}</button>`,
          );
        }
      } else if (!claimOwner) {
        shareActionButtons.push(
          `<button class="memory-usage-action-btn" data-memory-share-claim="claim" data-memory-share-claim-scope="${escapeHtml(shareActionScope)}">${escapeHtml(t("memory.shareClaimAction", {}, "Claim"))}</button>`,
        );
      }
    }
    if (shareActionMode === "approved") {
      shareActionButtons.push(
        `<button class="memory-usage-action-btn" data-memory-share-decision="revoked">${escapeHtml(t("memory.shareReviewRevokeAction", {}, "Revoke Shared"))}</button>`,
      );
    }
    memoryViewerDetailEl.innerHTML = `
      <div class="memory-detail-shell">
        <div class="memory-detail-header">
          <div>
            <div class="memory-detail-title">${escapeHtml(summarizeSourcePath(item.sourcePath))}</div>
            <div class="memory-list-item-meta">
              <span>${escapeHtml(item.id)}</span>
            </div>
          </div>
          <div class="memory-detail-badges">
            <span class="memory-badge">${escapeHtml(formatMemoryTypeLabel(item.memoryType))}</span>
            <span class="memory-badge">${escapeHtml(formatMemorySourceTypeLabel(item.sourceType))}</span>
            <span class="memory-badge ${getVisibilityBadgeClass(visibility)}">${escapeHtml(visibility)}</span>
            ${renderSourceViewBadge(sourceView)}
            <span class="memory-badge">${escapeHtml(category)}</span>
            <span class="memory-badge">分数 ${formatScore(item.score)}</span>
            ${shareActionButtons.join("")}
          </div>
        </div>

        <div class="memory-detail-grid">
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.detailSourcePath", {}, "Source Path"))}</span><div class="memory-detail-text">${item.sourcePath ? `<button class="memory-path-link" data-open-source="${escapeHtml(item.sourcePath)}" data-open-line="${typeof item.startLine === "number" ? item.startLine : ""}">${escapeHtml(item.sourcePath)}</button>` : "-"}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.detailLines", {}, "Lines"))}</span><div class="memory-detail-text">${escapeHtml(formatLineRange(item.startLine, item.endLine))}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.detailVisibility", {}, "Visibility"))}</span><div class="memory-detail-text">${escapeHtml(visibility)}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">来源视角</span><div class="memory-detail-text">${escapeHtml(formatResidentSourceSummary(sourceView))}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">来源解释</span><div class="memory-detail-text">${escapeHtml(sourceExplanation)}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">冲突说明</span><div class="memory-detail-text">${escapeHtml(sourceConflictSummary)}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">来源审计</span><div class="memory-detail-text">${escapeHtml(sourceAuditSummary)}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.detailSharedStatus", {}, "Shared Status"))}</span><div class="memory-detail-text">${escapeHtml(shareStatus)}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.detailSharedGovernance", {}, "Shared Governance"))}</span><div class="memory-detail-text">${escapeHtml(governanceSummary)}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.detailSharedClaim", {}, "Shared Claim"))}</span><div class="memory-detail-text">${escapeHtml(claimOwner || t("memory.detailSharedClaimNone", {}, "Unclaimed"))}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.detailCategory", {}, "Category"))}</span><div class="memory-detail-text">${escapeHtml(category)}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.detailSummary", {}, "Summary"))}</span><div class="memory-detail-text">${escapeHtml(item.summary || t("memory.emptyNoSummary", {}, "No summary"))}</div></div>
        </div>

        <div class="memory-detail-card">
          <span class="memory-detail-label">${escapeHtml(t("memory.detailSnippet", {}, "Snippet"))}</span>
          <div class="memory-detail-text">${escapeHtml(item.snippet || t("memory.noContent", {}, "No content"))}</div>
        </div>

        <div class="memory-detail-card">
          <span class="memory-detail-label">${escapeHtml(t("memory.detailContent", {}, "Content"))}</span>
          <pre class="memory-detail-pre">${escapeHtml(item.content || item.snippet || t("memory.noContent", {}, "No content"))}</pre>
        </div>

        ${item.metadata ? `
          <div class="memory-detail-card">
            <span class="memory-detail-label">元数据</span>
            <pre class="memory-detail-pre">${escapeHtml(JSON.stringify(item.metadata, null, 2))}</pre>
          </div>
        ` : ""}
      </div>
    `;
    bindMemoryPathLinks();
    bindMemoryDetailActions(item);
  }

  return {
    loadMemoryChunkViewer,
    loadMemoryViewer,
    loadMemoryViewerStats,
    loadTaskUsageOverview,
    loadTaskViewer,
    renderCandidateDetailPanel,
    renderCandidateOnlyDetail,
    renderMemoryList,
    renderMemoryDetail,
    renderMemoryViewerStats,
    renderTaskList,
    syncMemoryViewerHeaderTitle,
    switchMemoryViewerTab,
    syncMemoryViewerUi,
  };
}
