import {
  formatResidentSourceAuditSummary,
  formatResidentSourceConflictSummary,
  formatResidentSourceExplainability,
  formatResidentSourceScopeLabel,
  formatResidentSourceSummary,
  getResidentSourceBadgeClass,
} from "./memory-source-view.js";
import { buildExternalOutboundDiagnosis } from "./external-outbound-diagnosis.js";
import {
  buildEmailThreadOrganizerEntries,
  buildEmailThreadOrganizerStats,
  mergeEmailThreadOrganizerReminders,
  matchesEmailThreadOrganizerQuery,
  normalizeOutboundAuditFocus,
} from "./email-thread-organizer-view.js";
import { renderSkillFreshnessDetail } from "./skill-freshness-view.js";

function normalizeSharedReviewFocus(value) {
  const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
  if (normalized === "actionable" || normalized === "mine") {
    return normalized;
  }
  return "";
}

export function buildSharedReviewQueueParams({
  reviewerAgentId,
  limit = 50,
  query = "",
  governanceStatus = "pending",
  sharedReviewFilters = {},
} = {}) {
  const activeReviewerAgentId = typeof reviewerAgentId === "string" && reviewerAgentId.trim()
    ? reviewerAgentId.trim()
    : "default";
  const focus = normalizeSharedReviewFocus(sharedReviewFilters?.focus);
  const targetAgentId = typeof sharedReviewFilters?.targetAgentId === "string"
    ? sharedReviewFilters.targetAgentId.trim()
    : "";
  const claimedByAgentId = typeof sharedReviewFilters?.claimedByAgentId === "string"
    ? sharedReviewFilters.claimedByAgentId.trim()
    : "";
  const normalizedQuery = typeof query === "string" ? query.trim() : "";
  const filter = {};
  filter.sharedPromotionStatus = governanceStatus || "pending";
  if (focus === "actionable") {
    filter.actionableOnly = true;
  } else if (focus === "mine") {
    filter.claimedByAgentId = activeReviewerAgentId;
  } else if (claimedByAgentId) {
    filter.claimedByAgentId = claimedByAgentId;
  }
  if (targetAgentId) {
    filter.targetAgentId = targetAgentId;
  }

  const params = {
    limit,
    reviewerAgentId: activeReviewerAgentId,
  };
  if (Object.keys(filter).length > 0) {
    params.filter = filter;
  }
  if (normalizedQuery) {
    params.query = normalizedQuery;
  }
  return params;
}

function normalizeSharedReviewBatchStatus(item) {
  const reviewStatus = typeof item?.reviewStatus === "string" ? item.reviewStatus.trim().toLowerCase() : "";
  if (reviewStatus === "pending" || reviewStatus === "approved" || reviewStatus === "active" || reviewStatus === "rejected" || reviewStatus === "revoked") {
    return reviewStatus;
  }
  const metadataStatus = typeof item?.metadata?.sharedPromotion?.status === "string"
    ? item.metadata.sharedPromotion.status.trim().toLowerCase()
    : "";
  if (metadataStatus === "pending" || metadataStatus === "approved" || metadataStatus === "active" || metadataStatus === "rejected" || metadataStatus === "revoked") {
    return metadataStatus;
  }
  return "";
}

function getSharedReviewBatchClaimOwner(item) {
  if (typeof item?.claimOwner === "string" && item.claimOwner.trim()) {
    return item.claimOwner.trim();
  }
  const metadataOwner = item?.metadata?.sharedPromotion?.claimedByAgentId;
  return typeof metadataOwner === "string" ? metadataOwner.trim() : "";
}

export function buildSharedReviewBatchActionState(items, selectedIds, activeAgentId) {
  const itemMap = new Map((Array.isArray(items) ? items : []).map((item) => [String(item?.id || "").trim(), item]));
  const selectedItems = [];
  for (const rawId of Array.isArray(selectedIds) ? selectedIds : []) {
    const id = typeof rawId === "string" ? rawId.trim() : "";
    if (!id) continue;
    const item = itemMap.get(id);
    if (item) {
      selectedItems.push(item);
    }
  }

  const actions = {
    claim: [],
    release: [],
    approved: [],
    rejected: [],
    revoked: [],
  };

  for (const item of selectedItems) {
    const status = normalizeSharedReviewBatchStatus(item);
    const claimOwner = getSharedReviewBatchClaimOwner(item);
    const claimTimedOut = item?.claimTimedOut === true;
    const actionableByReviewer = item?.actionableByReviewer === true;
    const canClaimNow = status === "pending" && (!claimOwner || claimTimedOut);
    const canReleaseNow = status === "pending" && claimOwner === activeAgentId && !claimTimedOut;
    const canReviewNow = status === "pending" && (actionableByReviewer || !claimOwner || claimOwner === activeAgentId || claimTimedOut);
    const canRevokeNow = status === "approved" || status === "active";

    if (canClaimNow) actions.claim.push(item);
    if (canReleaseNow) actions.release.push(item);
    if (canReviewNow) {
      actions.approved.push(item);
      actions.rejected.push(item);
    }
    if (canRevokeNow) actions.revoked.push(item);
  }

  return {
    totalVisible: itemMap.size,
    selectedItems,
    selectedCount: selectedItems.length,
    actions,
  };
}

export function collectActionableSharedReviewIds(items, activeAgentId) {
  const normalizedItems = Array.isArray(items) ? items : [];
  const batchState = buildSharedReviewBatchActionState(
    normalizedItems,
    normalizedItems.map((item) => String(item?.id || "").trim()).filter(Boolean),
    activeAgentId,
  );
  const selectedIds = new Set();
  for (const item of [
    ...batchState.actions.claim,
    ...batchState.actions.release,
    ...batchState.actions.approved,
    ...batchState.actions.revoked,
  ]) {
    const id = String(item?.id || "").trim();
    if (id) selectedIds.add(id);
  }
  return [...selectedIds];
}

function collectUniqueNonEmptyStrings(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => typeof value === "string" ? value.trim() : "")
      .filter(Boolean),
  )];
}

function normalizeMemoryViewerTab(value, fallback = "tasks") {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (normalized === "tasks" || normalized === "memories" || normalized === "sharedReview" || normalized === "outboundAudit") {
    return normalized;
  }
  return fallback;
}

function normalizeMemoryViewerTextFilter(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeMemoryViewerGoalId(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

export function createDefaultMemoryViewerAgentViewState(tab = "tasks") {
  return {
    tab: normalizeMemoryViewerTab(tab),
    outboundAuditFocus: "all",
    searchQuery: "",
    taskStatus: "",
    taskSource: "",
    memoryType: "",
    memoryVisibility: "",
    memoryGovernance: "",
    sharedReviewGovernance: "pending",
    memoryCategory: "",
    sharedReviewFilters: {
      focus: "",
      targetAgentId: "",
      claimedByAgentId: "",
    },
    goalIdFilter: null,
  };
}

export function normalizeMemoryViewerAgentViewState(value, fallbackTab = "tasks") {
  const fallback = createDefaultMemoryViewerAgentViewState(fallbackTab);
  if (!value || typeof value !== "object") {
    return fallback;
  }
  const sharedReviewFilters = value.sharedReviewFilters && typeof value.sharedReviewFilters === "object"
    ? value.sharedReviewFilters
    : {};
  return {
    tab: normalizeMemoryViewerTab(value.tab, fallback.tab),
    outboundAuditFocus: normalizeOutboundAuditFocus(value.outboundAuditFocus),
    searchQuery: normalizeMemoryViewerTextFilter(value.searchQuery),
    taskStatus: normalizeMemoryViewerTextFilter(value.taskStatus),
    taskSource: normalizeMemoryViewerTextFilter(value.taskSource),
    memoryType: normalizeMemoryViewerTextFilter(value.memoryType),
    memoryVisibility: normalizeMemoryViewerTextFilter(value.memoryVisibility),
    memoryGovernance: normalizeMemoryViewerTextFilter(value.memoryGovernance),
    sharedReviewGovernance: normalizeMemoryViewerTextFilter(value.sharedReviewGovernance) || fallback.sharedReviewGovernance,
    memoryCategory: normalizeMemoryViewerTextFilter(value.memoryCategory),
    sharedReviewFilters: {
      focus: normalizeSharedReviewFocus(sharedReviewFilters.focus),
      targetAgentId: normalizeMemoryViewerTextFilter(sharedReviewFilters.targetAgentId),
      claimedByAgentId: normalizeMemoryViewerTextFilter(sharedReviewFilters.claimedByAgentId),
    },
    goalIdFilter: normalizeMemoryViewerGoalId(value.goalIdFilter),
  };
}

export function extractTaskContextTargets(task) {
  const memoryIds = collectUniqueNonEmptyStrings(
    (Array.isArray(task?.memoryLinks) ? task.memoryLinks : []).map((item) => item?.chunkId),
  );
  const artifactPaths = collectUniqueNonEmptyStrings(task?.artifactPaths);
  const candidateIds = collectUniqueNonEmptyStrings([
    ...(Array.isArray(task?.usedMethods) ? task.usedMethods : []).map((item) => item?.sourceCandidateId),
    ...(Array.isArray(task?.usedSkills) ? task.usedSkills : []).map((item) => item?.sourceCandidateId),
  ]);
  return {
    firstMemoryId: memoryIds[0] || "",
    memoryCount: memoryIds.length,
    firstArtifactPath: artifactPaths[0] || "",
    artifactCount: artifactPaths.length,
    firstCandidateId: candidateIds[0] || "",
    candidateCount: candidateIds.length,
  };
}

export function extractCandidateContextTargets(candidate) {
  const snapshot = candidate?.sourceTaskSnapshot || {};
  const memoryIds = collectUniqueNonEmptyStrings(
    (Array.isArray(snapshot.memoryLinks) ? snapshot.memoryLinks : []).map((item) => item?.chunkId),
  );
  const artifactPaths = collectUniqueNonEmptyStrings(snapshot.artifactPaths);
  return {
    sourceTaskId: typeof candidate?.taskId === "string" ? candidate.taskId.trim() : "",
    sourceConversationId: typeof snapshot?.conversationId === "string" ? snapshot.conversationId.trim() : "",
    firstMemoryId: memoryIds[0] || "",
    memoryCount: memoryIds.length,
    firstArtifactPath: artifactPaths[0] || "",
    artifactCount: artifactPaths.length,
    publishedPath: typeof candidate?.publishedPath === "string" ? candidate.publishedPath.trim() : "",
  };
}

export function createMemoryViewerFeature({
  refs,
  isConnected,
  sendReq,
  makeId,
  getMemoryViewerState,
  getSelectedAgentId,
  getSelectedAgentLabel,
  getAvailableAgents,
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
  openConversationSession,
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
    memoryTabSharedReviewBtn,
    memoryTabOutboundAuditBtn,
    memoryOutboundAuditFiltersEl,
    memoryOutboundAuditFocusAllBtn,
    memoryOutboundAuditFocusThreadsBtn,
    memorySharedReviewBatchBarEl,
    memoryTaskFiltersEl,
    memoryChunkFiltersEl,
    memorySearchInputEl,
    memoryTaskStatusFilterEl,
    memoryTaskSourceFilterEl,
    memoryChunkTypeFilterEl,
    memoryChunkVisibilityFilterEl,
    memoryChunkGovernanceFilterEl,
    memoryChunkCategoryFilterEl,
    memorySharedReviewFiltersEl,
    memorySharedReviewFocusFilterEl,
    memorySharedReviewTargetFilterEl,
    memorySharedReviewClaimedByFilterEl,
  } = refs;

  function getActiveAgentId() {
    const agentId = typeof getSelectedAgentId === "function" ? String(getSelectedAgentId() || "").trim() : "";
    return agentId || "default";
  }

  function ensureAgentViewStates() {
    const memoryViewerState = getMemoryViewerState();
    if (!memoryViewerState.agentViewStates || typeof memoryViewerState.agentViewStates !== "object") {
      memoryViewerState.agentViewStates = {};
    }
    return memoryViewerState.agentViewStates;
  }

  function captureAgentViewState(agentId = getMemoryViewerState().activeAgentId || getActiveAgentId()) {
    const normalizedAgentId = typeof agentId === "string" && agentId.trim() ? agentId.trim() : "default";
    const memoryViewerState = getMemoryViewerState();
    const existingView = normalizeMemoryViewerAgentViewState(
      ensureAgentViewStates()[normalizedAgentId],
      memoryViewerState.tab,
    );
    const nextView = {
      ...existingView,
      tab: memoryViewerState.tab,
      outboundAuditFocus: normalizeOutboundAuditFocus(memoryViewerState.outboundAuditFocus),
      searchQuery: memorySearchInputEl?.value,
      taskStatus: memoryTaskStatusFilterEl?.value,
      taskSource: memoryTaskSourceFilterEl?.value,
      memoryType: memoryChunkTypeFilterEl?.value,
      memoryVisibility: memoryChunkVisibilityFilterEl?.value,
      memoryCategory: memoryChunkCategoryFilterEl?.value,
      sharedReviewFilters: getSharedReviewFilters(),
      goalIdFilter: memoryViewerState.goalIdFilter,
    };
    if (memoryViewerState.tab === "sharedReview") {
      nextView.sharedReviewGovernance = memoryChunkGovernanceFilterEl?.value;
    } else {
      nextView.memoryGovernance = memoryChunkGovernanceFilterEl?.value;
    }
    ensureAgentViewStates()[normalizedAgentId] = normalizeMemoryViewerAgentViewState(nextView, memoryViewerState.tab);
  }

  function applyAgentViewState(agentId = getActiveAgentId(), fallbackTab = getMemoryViewerState().tab) {
    const normalizedAgentId = typeof agentId === "string" && agentId.trim() ? agentId.trim() : "default";
    const memoryViewerState = getMemoryViewerState();
    const nextView = normalizeMemoryViewerAgentViewState(
      ensureAgentViewStates()[normalizedAgentId],
      fallbackTab,
    );

    memoryViewerState.tab = nextView.tab;
    memoryViewerState.outboundAuditFocus = nextView.outboundAuditFocus;
    memoryViewerState.goalIdFilter = nextView.goalIdFilter;
    memoryViewerState.sharedReviewFilters = { ...nextView.sharedReviewFilters };

    if (memorySearchInputEl) memorySearchInputEl.value = nextView.searchQuery;
    if (memoryTaskStatusFilterEl) memoryTaskStatusFilterEl.value = nextView.taskStatus;
    if (memoryTaskSourceFilterEl) memoryTaskSourceFilterEl.value = nextView.taskSource;
    if (memoryChunkTypeFilterEl) memoryChunkTypeFilterEl.value = nextView.memoryType;
    if (memoryChunkVisibilityFilterEl) memoryChunkVisibilityFilterEl.value = nextView.memoryVisibility;
    if (memoryChunkGovernanceFilterEl) {
      memoryChunkGovernanceFilterEl.value = nextView.tab === "sharedReview"
        ? (nextView.sharedReviewGovernance || "pending")
        : nextView.memoryGovernance;
    }
    if (memoryChunkCategoryFilterEl) memoryChunkCategoryFilterEl.value = nextView.memoryCategory;
    syncSharedReviewFilterUi();
  }

  function getOutboundAuditFocus() {
    return normalizeOutboundAuditFocus(getMemoryViewerState().outboundAuditFocus);
  }

  function buildScopedParams(params = {}, agentId = getActiveAgentId()) {
    return {
      ...params,
      agentId,
    };
  }

  function getSharedReviewFilters() {
    const memoryViewerState = getMemoryViewerState();
    const existing = memoryViewerState.sharedReviewFilters;
    if (existing && typeof existing === "object") {
      return {
        focus: normalizeSharedReviewFocus(existing.focus),
        targetAgentId: typeof existing.targetAgentId === "string" ? existing.targetAgentId.trim() : "",
        claimedByAgentId: typeof existing.claimedByAgentId === "string" ? existing.claimedByAgentId.trim() : "",
      };
    }
    const fallback = { focus: "", targetAgentId: "", claimedByAgentId: "" };
    memoryViewerState.sharedReviewFilters = fallback;
    return fallback;
  }

  function getSharedReviewAgentOptions() {
    const stateFilters = getSharedReviewFilters();
    const map = new Map();
    const availableAgents = typeof getAvailableAgents === "function" ? getAvailableAgents() : [];
    for (const agent of Array.isArray(availableAgents) ? availableAgents : []) {
      if (!agent || typeof agent !== "object") continue;
      const id = typeof agent.id === "string" ? agent.id.trim() : "";
      if (!id) continue;
      const label = typeof agent.displayName === "string" && agent.displayName.trim()
        ? agent.displayName.trim()
        : typeof agent.name === "string" && agent.name.trim()
          ? agent.name.trim()
          : id;
      map.set(id, label);
    }

    for (const id of [getActiveAgentId(), stateFilters.targetAgentId, stateFilters.claimedByAgentId]) {
      if (typeof id === "string" && id.trim() && !map.has(id.trim())) {
        map.set(id.trim(), id.trim());
      }
    }

    return [...map.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "zh-CN"));
  }

  function buildSelectOptionsHtml(options, fallbackLabel) {
    return options.map((option) => {
      const value = typeof option?.value === "string" ? option.value : "";
      const label = typeof option?.label === "string" && option.label.trim() ? option.label.trim() : fallbackLabel;
      return `<option value="${escapeHtml(value)}">${escapeHtml(label)}</option>`;
    }).join("");
  }

  function getSelectedSharedReviewIds() {
    const memoryViewerState = getMemoryViewerState();
    return Array.isArray(memoryViewerState.selectedSharedReviewIds)
      ? memoryViewerState.selectedSharedReviewIds.filter((item) => typeof item === "string" && item.trim())
      : [];
  }

  function setSelectedSharedReviewIds(nextIds) {
    const memoryViewerState = getMemoryViewerState();
    const deduped = [];
    const seen = new Set();
    for (const id of Array.isArray(nextIds) ? nextIds : []) {
      const normalized = typeof id === "string" ? id.trim() : "";
      if (!normalized || seen.has(normalized)) continue;
      seen.add(normalized);
      deduped.push(normalized);
    }
    memoryViewerState.selectedSharedReviewIds = deduped;
  }

  function syncSelectedSharedReviewIds(items = []) {
    const validIds = new Set((Array.isArray(items) ? items : []).map((item) => String(item?.id || "").trim()).filter(Boolean));
    setSelectedSharedReviewIds(getSelectedSharedReviewIds().filter((id) => validIds.has(id)));
  }

  function toggleSharedReviewSelection(chunkId, checked) {
    const targetId = typeof chunkId === "string" ? chunkId.trim() : "";
    if (!targetId) return;
    const selectedIds = new Set(getSelectedSharedReviewIds());
    if (checked) {
      selectedIds.add(targetId);
    } else {
      selectedIds.delete(targetId);
    }
    setSelectedSharedReviewIds([...selectedIds]);
  }

  function selectAllVisibleSharedReviewItems() {
    const memoryViewerState = getMemoryViewerState();
    const itemIds = (Array.isArray(memoryViewerState.items) ? memoryViewerState.items : [])
      .map((item) => String(item?.id || "").trim())
      .filter(Boolean);
    setSelectedSharedReviewIds(itemIds);
  }

  function selectActionableSharedReviewItems() {
    const memoryViewerState = getMemoryViewerState();
    const items = Array.isArray(memoryViewerState.items) ? memoryViewerState.items : [];
    setSelectedSharedReviewIds(collectActionableSharedReviewIds(items, getActiveAgentId()));
  }

  function clearSharedReviewSelection() {
    setSelectedSharedReviewIds([]);
  }

  function syncSharedReviewFilterUi() {
    const stateFilters = getSharedReviewFilters();
    if (memorySharedReviewFocusFilterEl) {
      memorySharedReviewFocusFilterEl.value = stateFilters.focus;
    }

    const agentOptions = getSharedReviewAgentOptions();
    if (memorySharedReviewTargetFilterEl) {
      const options = [
        { value: "", label: t("memory.sharedReviewTargetAll", {}, "All Target Agents") },
        ...agentOptions.map((agent) => ({ value: agent.id, label: agent.label })),
      ];
      memorySharedReviewTargetFilterEl.innerHTML = buildSelectOptionsHtml(options, "-");
      memorySharedReviewTargetFilterEl.value = stateFilters.targetAgentId;
    }
    if (memorySharedReviewClaimedByFilterEl) {
      const options = [
        { value: "", label: t("memory.sharedReviewClaimedByAll", {}, "All Claim Owners") },
        ...agentOptions.map((agent) => ({ value: agent.id, label: agent.label })),
      ];
      memorySharedReviewClaimedByFilterEl.innerHTML = buildSelectOptionsHtml(options, "-");
      memorySharedReviewClaimedByFilterEl.value = stateFilters.claimedByAgentId;
    }
  }

  function renderSharedReviewBatchBar() {
    if (!memorySharedReviewBatchBarEl) return;
    const memoryViewerState = getMemoryViewerState();
    const isSharedReview = memoryViewerState.tab === "sharedReview";
    const items = Array.isArray(memoryViewerState.items) ? memoryViewerState.items : [];
    if (!isSharedReview || !items.length) {
      memorySharedReviewBatchBarEl.classList.add("hidden");
      memorySharedReviewBatchBarEl.innerHTML = "";
      return;
    }

    const batchState = buildSharedReviewBatchActionState(items, getSelectedSharedReviewIds(), getActiveAgentId());
    const busy = memoryViewerState.sharedReviewBatchBusy === true;
    const actionButtons = [
      {
        key: "claim",
        label: t("memory.shareClaimAction", {}, "Claim"),
        count: batchState.actions.claim.length,
      },
      {
        key: "release",
        label: t("memory.shareReleaseAction", {}, "Release"),
        count: batchState.actions.release.length,
      },
      {
        key: "approved",
        label: t("memory.shareReviewApproveAction", {}, "Approve"),
        count: batchState.actions.approved.length,
      },
      {
        key: "rejected",
        label: t("memory.shareReviewRejectAction", {}, "Reject"),
        count: batchState.actions.rejected.length,
      },
      {
        key: "revoked",
        label: t("memory.shareReviewRevokeAction", {}, "Revoke Shared"),
        count: batchState.actions.revoked.length,
      },
    ];

    memorySharedReviewBatchBarEl.classList.remove("hidden");
    memorySharedReviewBatchBarEl.innerHTML = `
      <div class="memory-shared-review-batch-summary">
        ${escapeHtml(t(
          "memory.sharedReviewBatchSummary",
          {
            selected: formatCount(batchState.selectedCount),
            total: formatCount(batchState.totalVisible),
          },
          `Selected ${formatCount(batchState.selectedCount)} / ${formatCount(batchState.totalVisible)}`,
        ))}
      </div>
      <div class="memory-shared-review-batch-actions">
        <button class="memory-usage-action-btn" data-shared-review-batch-select="all" ${busy ? "disabled" : ""}>${escapeHtml(t("memory.sharedReviewSelectAllVisible", {}, "Select Visible"))}</button>
        <button class="memory-usage-action-btn" data-shared-review-batch-select="actionable" ${busy ? "disabled" : ""}>${escapeHtml(t("memory.sharedReviewSelectActionable", {}, "Select Actionable"))}</button>
        <button class="memory-usage-action-btn" data-shared-review-batch-select="clear" ${(busy || batchState.selectedCount <= 0) ? "disabled" : ""}>${escapeHtml(t("memory.sharedReviewClearSelection", {}, "Clear Selection"))}</button>
        ${actionButtons.map((action) => `
          <button
            class="memory-usage-action-btn"
            data-shared-review-batch-action="${escapeHtml(action.key)}"
            ${(busy || action.count <= 0) ? "disabled" : ""}
          >${escapeHtml(`${action.label} (${formatCount(action.count)})`)}</button>
        `).join("")}
      </div>
    `;

    memorySharedReviewBatchBarEl.querySelectorAll("[data-shared-review-batch-select]").forEach((node) => {
      node.addEventListener("click", () => {
        const mode = node.getAttribute("data-shared-review-batch-select");
        if (mode === "all") {
          selectAllVisibleSharedReviewItems();
        } else if (mode === "actionable") {
          selectActionableSharedReviewItems();
        } else {
          clearSharedReviewSelection();
        }
        renderSharedReviewList(items);
        renderSharedReviewBatchBar();
      });
    });

    memorySharedReviewBatchBarEl.querySelectorAll("[data-shared-review-batch-action]").forEach((node) => {
      node.addEventListener("click", () => {
        const action = node.getAttribute("data-shared-review-batch-action") || "";
        if (!action) return;
        void runSharedReviewBatchAction(action);
      });
    });
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

  function formatSharedReviewBatchActionLabel(action) {
    if (action === "claim") return t("memory.shareClaimAction", {}, "Claim");
    if (action === "release") return t("memory.shareReleaseAction", {}, "Release");
    if (action === "approved") return t("memory.shareReviewApproveAction", {}, "Approve");
    if (action === "rejected") return t("memory.shareReviewRejectAction", {}, "Reject");
    if (action === "revoked") return t("memory.shareReviewRevokeAction", {}, "Revoke Shared");
    return action || "-";
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
    const claimState = getMemoryShareClaimState(item);
    if (claimState.claimTimedOut) {
      parts.push("claim=timed_out");
    }
    if (claimState.claimExpiresAt) {
      parts.push(`claimExpiresAt=${claimState.claimExpiresAt}`);
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
    if (typeof item?.claimOwner === "string" && item.claimOwner.trim()) {
      return item.claimOwner.trim();
    }
    const promotion = getMemorySharePromotionMetadata(item);
    return typeof promotion?.claimedByAgentId === "string" ? promotion.claimedByAgentId.trim() : "";
  }

  function getMemoryShareClaimState(item) {
    const promotion = getMemorySharePromotionMetadata(item);
    return {
      claimOwner: getMemoryShareClaimOwner(item),
      claimedAt: typeof promotion?.claimedAt === "string" && promotion.claimedAt.trim()
        ? promotion.claimedAt.trim()
        : "",
      claimAgeMs: Number.isFinite(Number(item?.claimAgeMs)) ? Number(item.claimAgeMs) : null,
      claimExpiresAt: typeof item?.claimExpiresAt === "string" && item.claimExpiresAt.trim()
        ? item.claimExpiresAt.trim()
        : "",
      claimTimedOut: item?.claimTimedOut === true,
      actionableByReviewer: item?.actionableByReviewer === true,
      blockedByOtherReviewer: item?.blockedByOtherReviewer === true,
    };
  }

  function getMemoryShareTargetAgentId(item) {
    const promotion = getMemorySharePromotionMetadata(item);
    if (typeof item?.targetAgentId === "string" && item.targetAgentId.trim()) {
      return item.targetAgentId.trim();
    }
    if (typeof promotion?.sourceAgentId === "string" && promotion.sourceAgentId.trim()) {
      return promotion.sourceAgentId.trim();
    }
    return getActiveAgentId();
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
    const memoryViewerState = getMemoryViewerState();
    if (memoryViewerState.tab === "outboundAudit") {
      memoryViewerTitleEl.textContent = getOutboundAuditFocus() === "threads"
        ? t("memory.emailThreadOrganizerTitle", {}, "邮件线程整理")
        : t("memory.outboundAuditTitle", {}, "消息审计");
      return;
    }
    if (memoryViewerState.tab === "sharedReview") {
      memoryViewerTitleEl.textContent = agentName
        ? t("memory.sharedReviewTitleWithAgent", { agentName }, `${agentName} Shared Review Inbox`)
        : t("memory.sharedReviewTitle", {}, "Shared Review Inbox");
      return;
    }
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
    const isMemories = memoryViewerState.tab === "memories";
    const isSharedReview = memoryViewerState.tab === "sharedReview";
    const isOutboundAudit = memoryViewerState.tab === "outboundAudit";
    const isOutboundAuditThreads = isOutboundAudit && getOutboundAuditFocus() === "threads";
    if (memoryViewerSection) memoryViewerSection.classList.toggle("tasks-mode", isTasks);
    if (memoryTabTasksBtn) memoryTabTasksBtn.classList.toggle("active", isTasks);
    if (memoryTabMemoriesBtn) memoryTabMemoriesBtn.classList.toggle("active", isMemories);
    if (memoryTabSharedReviewBtn) memoryTabSharedReviewBtn.classList.toggle("active", isSharedReview);
    if (memoryTabOutboundAuditBtn) memoryTabOutboundAuditBtn.classList.toggle("active", isOutboundAudit);
    if (memoryTaskFiltersEl) memoryTaskFiltersEl.classList.toggle("hidden", !isTasks);
    if (memoryChunkFiltersEl) memoryChunkFiltersEl.classList.toggle("hidden", isTasks || isOutboundAudit);
    if (memoryChunkTypeFilterEl) memoryChunkTypeFilterEl.classList.toggle("hidden", !isMemories);
    if (memoryChunkVisibilityFilterEl) memoryChunkVisibilityFilterEl.classList.toggle("hidden", !isMemories);
    if (memoryChunkGovernanceFilterEl) memoryChunkGovernanceFilterEl.classList.toggle("hidden", !(isMemories || isSharedReview));
    if (memoryChunkCategoryFilterEl) memoryChunkCategoryFilterEl.classList.toggle("hidden", !isMemories);
    if (memorySharedReviewFiltersEl) memorySharedReviewFiltersEl.classList.toggle("hidden", !isSharedReview);
    if (memoryOutboundAuditFiltersEl) memoryOutboundAuditFiltersEl.classList.toggle("hidden", !isOutboundAudit);
    if (memoryOutboundAuditFocusAllBtn) memoryOutboundAuditFocusAllBtn.classList.toggle("active", isOutboundAudit && !isOutboundAuditThreads);
    if (memoryOutboundAuditFocusThreadsBtn) memoryOutboundAuditFocusThreadsBtn.classList.toggle("active", isOutboundAuditThreads);
    if (memorySearchInputEl) {
      memorySearchInputEl.placeholder = isOutboundAuditThreads
        ? t("memory.emailThreadOrganizerSearchPlaceholder", {}, "搜索主题、发件人、线程、会话、整理摘要或建议回复")
        : isOutboundAudit
          ? t("memory.outboundAuditSearchPlaceholder", {}, "搜索渠道、requestId、messageId、thread、会话、Agent 或消息预览")
        : t("memory.searchPlaceholder", {}, "搜索任务标题、总结或记忆内容");
    }
    syncSharedReviewFilterUi();
    renderSharedReviewBatchBar();
    syncMemoryTaskGoalFilterUi();
  }

  function switchMemoryViewerTab(tab) {
    const memoryViewerState = getMemoryViewerState();
    if (memoryViewerState.tab === tab) return;
    captureAgentViewState();
    const normalizedAgentId = String(memoryViewerState.activeAgentId || getActiveAgentId()).trim() || "default";
    const nextView = normalizeMemoryViewerAgentViewState(
      ensureAgentViewStates()[normalizedAgentId],
      tab,
    );
    nextView.tab = tab;
    ensureAgentViewStates()[normalizedAgentId] = nextView;
    memoryViewerState.tab = tab;
    memoryViewerState.outboundAuditFocus = nextView.outboundAuditFocus || "all";
    memoryViewerState.items = [];
    memoryViewerState.selectedId = null;
    memoryViewerState.selectedTask = null;
    memoryViewerState.selectedCandidate = null;
    memoryViewerState.sharedReviewSummary = null;
    memoryViewerState.selectedSharedReviewIds = [];
    memoryViewerState.sharedReviewBatchBusy = false;
    if (tab !== "tasks") {
      memoryViewerState.goalIdFilter = null;
    }
    if (memoryChunkGovernanceFilterEl) {
      memoryChunkGovernanceFilterEl.value = tab === "sharedReview"
        ? (nextView.sharedReviewGovernance || "pending")
        : nextView.memoryGovernance;
    }
    syncMemoryViewerUi();
    void loadMemoryViewer(true);
  }

  function switchOutboundAuditFocus(focus) {
    const normalizedFocus = normalizeOutboundAuditFocus(focus);
    const memoryViewerState = getMemoryViewerState();
    if (memoryViewerState.tab !== "outboundAudit" || getOutboundAuditFocus() === normalizedFocus) return;
    captureAgentViewState();
    const normalizedAgentId = String(memoryViewerState.activeAgentId || getActiveAgentId()).trim() || "default";
    const nextView = normalizeMemoryViewerAgentViewState(
      ensureAgentViewStates()[normalizedAgentId],
      memoryViewerState.tab,
    );
    nextView.outboundAuditFocus = normalizedFocus;
    ensureAgentViewStates()[normalizedAgentId] = nextView;
    memoryViewerState.outboundAuditFocus = normalizedFocus;
    memoryViewerState.items = [];
    memoryViewerState.selectedId = null;
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
    } else if (memoryViewerState.tab === "sharedReview") {
      memoryViewerState.selectedTask = null;
      memoryViewerState.selectedCandidate = null;
      await loadSharedReviewQueue(forceSelectFirst, requestContext);
    } else if (memoryViewerState.tab === "outboundAudit") {
      memoryViewerState.selectedTask = null;
      memoryViewerState.selectedCandidate = null;
      await loadExternalOutboundAuditViewer(forceSelectFirst, requestContext);
    } else {
      memoryViewerState.selectedTask = null;
      memoryViewerState.selectedCandidate = null;
      await loadMemoryViewerStats(requestContext);
      if (!isMemoryViewerRequestCurrent(requestContext)) return;
      await loadMemoryChunkViewer(forceSelectFirst, requestContext);
    }
  }

  function getExternalOutboundAuditItemId(item, index = 0) {
    const requestId = typeof item?.requestId === "string" ? item.requestId.trim() : "";
    const auditKind = typeof item?.auditKind === "string" && item.auditKind.trim() ? item.auditKind.trim() : "channel";
    if (auditKind === "email_thread_organizer") {
      const organizerId = typeof item?.id === "string" ? item.id.trim() : "";
      if (organizerId) return `${auditKind}:${organizerId}`;
    }
    if (requestId) return `${auditKind}:${requestId}`;
    const timestamp = Number.isFinite(Number(item?.timestamp)) ? Number(item.timestamp) : 0;
    const channel = typeof item?.targetChannel === "string" ? item.targetChannel.trim() : "unknown";
    const chatId = typeof item?.targetChatId === "string" ? item.targetChatId.trim() : "";
    const preview = typeof item?.contentPreview === "string"
      ? item.contentPreview.trim()
      : typeof item?.bodyPreview === "string"
        ? item.bodyPreview.trim()
        : "";
    return `${auditKind}:${timestamp}:${channel}:${chatId}:${preview}:${index}`;
  }

  function formatExternalOutboundDecisionLabel(value) {
    const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (normalized === "confirmed") return t("memory.outboundAuditDecisionConfirmed", {}, "确认通过");
    if (normalized === "rejected") return t("memory.outboundAuditDecisionRejected", {}, "已拒绝");
    if (normalized === "auto_approved") return t("memory.outboundAuditDecisionAutoApproved", {}, "自动放行");
    return value || "-";
  }

  function formatExternalOutboundDeliveryLabel(value) {
    const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (normalized === "sent") return t("memory.outboundAuditDeliverySent", {}, "已发送");
    if (normalized === "failed") return t("memory.outboundAuditDeliveryFailed", {}, "发送失败");
    if (normalized === "rejected") return t("memory.outboundAuditDeliveryRejected", {}, "未发送");
    return value || "-";
  }

  function formatEmailInboundStatusLabel(value) {
    const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (normalized === "processed") return t("memory.outboundAuditInboundProcessed", {}, "已处理");
    if (normalized === "failed") return t("memory.outboundAuditInboundFailed", {}, "处理失败");
    if (normalized === "invalid_event") return t("memory.outboundAuditInboundInvalid", {}, "事件无效");
    if (normalized === "skipped_duplicate") return t("memory.outboundAuditInboundDuplicate", {}, "重复跳过");
    return value || "-";
  }

  function formatExternalOutboundResolutionLabel(value) {
    const normalized = typeof value === "string" ? value.trim() : "";
    return normalized || "-";
  }

  function formatEmailOutboundDiagnosis(item) {
    if (item?.delivery !== "failed" && !item?.errorCode && !item?.error) {
      return "-";
    }
    const providerId = typeof item?.providerId === "string" && item.providerId.trim() ? item.providerId.trim() : "email";
    const errorCode = typeof item?.errorCode === "string" && item.errorCode.trim() ? item.errorCode.trim() : "";
    const error = typeof item?.error === "string" && item.error.trim() ? item.error.trim() : "";
    const headline = errorCode ? `${providerId} / ${errorCode}` : providerId;
    return error ? `${headline} · ${error}` : headline;
  }

  function formatEmailInboundDiagnosis(item) {
    if (item?.status !== "failed" && item?.status !== "invalid_event" && !item?.errorCode && !item?.error) {
      return "-";
    }
    const providerId = typeof item?.providerId === "string" && item.providerId.trim() ? item.providerId.trim() : "imap";
    const errorCode = typeof item?.errorCode === "string" && item.errorCode.trim() ? item.errorCode.trim() : "";
    const error = typeof item?.error === "string" && item.error.trim() ? item.error.trim() : "";
    const headline = errorCode ? `${providerId} / ${errorCode}` : providerId;
    return error ? `${headline} · ${error}` : headline;
  }

  function formatOutboundAuditChannelLabel(item) {
    if (item?.auditKind === "email") {
      const providerId = typeof item?.providerId === "string" && item.providerId.trim() ? item.providerId.trim() : "email";
      return `email/${providerId}`;
    }
    if (item?.auditKind === "email_inbound") {
      const providerId = typeof item?.providerId === "string" && item.providerId.trim() ? item.providerId.trim() : "email-inbound";
      return `email-inbound/${providerId}`;
    }
    return typeof item?.targetChannel === "string" && item.targetChannel.trim() ? item.targetChannel.trim() : "-";
  }

  function formatOutboundAuditPreview(item) {
    if (item?.auditKind === "email" || item?.auditKind === "email_inbound") {
      const subject = typeof item?.subject === "string" && item.subject.trim() ? item.subject.trim() : "";
      const bodyPreview = typeof item?.bodyPreview === "string" && item.bodyPreview.trim()
        ? item.bodyPreview.trim()
        : t("memory.outboundAuditPreviewEmpty", {}, "(空文本)");
      return subject ? `${subject} · ${bodyPreview}` : bodyPreview;
    }
    return item?.contentPreview || t("memory.outboundAuditPreviewEmpty", {}, "(空文本)");
  }

  function normalizeEmailOutboundAuditItem(item) {
    if (!item || typeof item !== "object") {
      return null;
    }
    return {
      ...item,
      auditKind: "email",
      targetChannel: "email",
      targetAccountId: item.accountId,
      contentPreview: item.bodyPreview,
    };
  }

  function normalizeEmailInboundAuditItem(item) {
    if (!item || typeof item !== "object") {
      return null;
    }
    return {
      ...item,
      auditKind: "email_inbound",
      targetChannel: "email-inbound",
      targetAccountId: item.accountId,
      contentPreview: item.bodyPreview,
    };
  }

  function matchesExternalOutboundAuditQuery(item, query) {
    const normalized = typeof query === "string" ? query.trim().toLowerCase() : "";
    if (!normalized) return true;
    const diagnosis = item?.auditKind === "email"
      ? {
        failureStage: "delivery",
        stageLabel: t("memory.outboundAuditEmailFailureStage", {}, "邮件投递"),
        codeLabel: item?.errorCode || "",
        summary: formatEmailOutboundDiagnosis(item),
      }
      : item?.auditKind === "email_inbound"
        ? {
          failureStage: "ingress",
          stageLabel: t("memory.outboundAuditEmailInboundFailureStage", {}, "邮件收信"),
          codeLabel: item?.errorCode || "",
          summary: formatEmailInboundDiagnosis(item),
        }
      : buildExternalOutboundDiagnosis({
        errorCode: item?.errorCode,
        error: item?.error,
        targetSessionKey: item?.targetSessionKey,
        delivery: item?.delivery,
      }, t);
    const haystack = [
      item?.contentPreview,
      item?.bodyPreview,
      item?.targetChannel,
      item?.providerId,
      item?.accountId,
      item?.subject,
      Array.isArray(item?.to) ? item.to.join(", ") : "",
      Array.isArray(item?.cc) ? item.cc.join(", ") : "",
      Array.isArray(item?.bcc) ? item.bcc.join(", ") : "",
      item?.providerMessageId,
      item?.providerThreadId,
      item?.threadId,
      item?.inReplyToMessageId,
      Array.isArray(item?.references) ? item.references.join(", ") : "",
      item?.replyToMessageId,
      item?.messageId,
      item?.mailbox,
      item?.sessionKey,
      item?.checkpointUid ? String(item.checkpointUid) : "",
      item?.retryAttempt ? String(item.retryAttempt) : "",
      item?.retryScheduled === true ? "retry_scheduled" : "",
      item?.retryExhausted === true ? "retry_exhausted" : "",
      item?.triageCategory,
      item?.triagePriority,
      item?.triageDisposition,
      item?.triageSummary,
      Array.isArray(item?.triageRationale) ? item.triageRationale.join(", ") : "",
      item?.triageNeedsReply === true ? "needs_reply" : "",
      item?.triageNeedsFollowUp === true ? "needs_follow_up" : "",
      item?.triageFollowUpWindowHours ? String(item.triageFollowUpWindowHours) : "",
      item?.suggestedReplyStarter,
      Array.isArray(item?.from) ? item.from.join(", ") : "",
      item?.targetSessionKey,
      item?.requestedSessionKey,
      item?.conversationId,
      item?.sourceConversationId,
      item?.requestId,
      item?.requestedByAgentId,
      item?.requestedAgentId,
      item?.targetChatId,
      item?.targetAccountId,
      item?.resolution,
      item?.decision,
      item?.delivery,
      item?.status,
      item?.errorCode,
      item?.error,
      diagnosis.failureStage,
      diagnosis.stageLabel,
      diagnosis.codeLabel,
      diagnosis.summary,
    ]
      .map((value) => typeof value === "string" ? value.toLowerCase() : "")
      .join("\n");
    return haystack.includes(normalized);
  }

  async function loadExternalOutboundAuditViewer(forceSelectFirst = false, existingContext = null) {
    const requestContext = createMemoryViewerRequestContext(existingContext);
    renderMemoryViewerListEmpty(t("memory.outboundAuditLoading", {}, "消息审计加载中…"));
    renderMemoryViewerDetailEmpty(t("memory.outboundAuditDetailLoading", {}, "正在加载消息审计详情…"));

    const res = await sendReq({
      type: "req",
      id: makeId(),
      method: "external_outbound.audit.list",
      params: { limit: 50 },
    });
    const emailRes = await sendReq({
      type: "req",
      id: makeId(),
      method: "email_outbound.audit.list",
      params: { limit: 50 },
    });
    const inboundRes = await sendReq({
      type: "req",
      id: makeId(),
      method: "email_inbound.audit.list",
      params: { limit: 50 },
    });
    const reminderRes = await sendReq({
      type: "req",
      id: makeId(),
      method: "email_followup.list",
      params: { limit: 50 },
    });
    const memoryViewerState = getMemoryViewerState();
    if (!isMemoryViewerRequestCurrent(requestContext)) return;
    if ((!res || !res.ok) && (!emailRes || !emailRes.ok) && (!inboundRes || !inboundRes.ok)) {
      memoryViewerState.items = [];
      memoryViewerState.selectedId = null;
      renderMemoryViewerStats({});
      renderMemoryViewerListEmpty(t("memory.outboundAuditLoadFailed", {}, "消息审计列表加载失败。"));
      renderMemoryViewerDetailEmpty(
        res?.error?.message || emailRes?.error?.message || inboundRes?.error?.message || t("memory.outboundAuditDetailLoadFailed", {}, "无法读取消息审计数据。"),
      );
      return;
    }

    const query = memorySearchInputEl ? memorySearchInputEl.value.trim() : "";
    const allItems = [
      ...(Array.isArray(res?.payload?.items) ? res.payload.items.map((item) => ({ ...item, auditKind: "channel" })) : []),
      ...(Array.isArray(emailRes?.payload?.items)
        ? emailRes.payload.items.map(normalizeEmailOutboundAuditItem).filter((item) => Boolean(item))
        : []),
      ...(Array.isArray(inboundRes?.payload?.items)
        ? inboundRes.payload.items.map(normalizeEmailInboundAuditItem).filter((item) => Boolean(item))
        : []),
    ].sort((left, right) => (Number(right?.timestamp) || 0) - (Number(left?.timestamp) || 0));
    const items = getOutboundAuditFocus() === "threads"
      ? mergeEmailThreadOrganizerReminders(
        buildEmailThreadOrganizerEntries(allItems),
        Array.isArray(reminderRes?.payload?.items) ? reminderRes.payload.items : [],
      ).filter((item) => matchesEmailThreadOrganizerQuery(item, query))
      : allItems.filter((item) => matchesExternalOutboundAuditQuery(item, query));
    memoryViewerState.items = items;
    renderMemoryViewerStats({});

    if (!items.length) {
      memoryViewerState.selectedId = null;
      renderExternalOutboundAuditList(items);
      renderMemoryViewerDetailEmpty(t("memory.outboundAuditEmpty", {}, "当前还没有匹配的消息审计记录。"));
      return;
    }

    const selectedExists = items.some((item, index) => getExternalOutboundAuditItemId(item, index) === memoryViewerState.selectedId);
    if (forceSelectFirst || !selectedExists) {
      memoryViewerState.selectedId = getExternalOutboundAuditItemId(items[0], 0);
    }

    renderExternalOutboundAuditList(items);
    const selected = items.find((item, index) => getExternalOutboundAuditItemId(item, index) === memoryViewerState.selectedId) || items[0];
    renderExternalOutboundAuditDetail(selected);
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

  async function sendMemoryShareReviewRequest(item, decision, note = "", scope = "chunk") {
    const reviewerAgentId = getActiveAgentId();
    const targetAgentId = getMemoryShareTargetAgentId(item);
    return sendReq({
      type: "req",
      id: makeId(),
      method: "memory.share.review",
      params: {
        ...(scope === "source"
          ? { sourcePath: getMemoryShareScopeSourcePath(item) }
          : { chunkId: item.id }),
        targetAgentId,
        reviewerAgentId,
        decision,
        note: String(note || "").trim(),
      },
    });
  }

  async function sendMemoryShareClaimRequest(item, action, scope = "chunk") {
    const reviewerAgentId = getActiveAgentId();
    const targetAgentId = getMemoryShareTargetAgentId(item);
    return sendReq({
      type: "req",
      id: makeId(),
      method: "memory.share.claim",
      params: {
        action,
        ...(scope === "source"
          ? { sourcePath: getMemoryShareScopeSourcePath(item) }
          : { chunkId: item.id }),
        targetAgentId,
        reviewerAgentId,
      },
    });
  }

  async function runSharedReviewBatchAction(action) {
    const memoryViewerState = getMemoryViewerState();
    if (memoryViewerState.sharedReviewBatchBusy === true) return;
    const batchState = buildSharedReviewBatchActionState(
      memoryViewerState.items,
      getSelectedSharedReviewIds(),
      getActiveAgentId(),
    );
    const eligibleItems = batchState.actions[action] || [];
    if (!eligibleItems.length) return;

    let note = "";
    if (action === "approved" || action === "rejected" || action === "revoked") {
      const promptKey = action === "approved"
        ? "memory.shareReviewPromptApprove"
        : action === "rejected"
          ? "memory.shareReviewPromptReject"
          : "memory.shareReviewPromptRevoke";
      const promptValue = window.prompt(
        t(promptKey, {}, "Optional note"),
        "",
      );
      if (promptValue === null) return;
      note = String(promptValue || "").trim();
    }

    memoryViewerState.sharedReviewBatchBusy = true;
    renderSharedReviewBatchBar();

    let successCount = 0;
    const errors = [];
    for (const item of eligibleItems) {
      let res;
      if (action === "claim" || action === "release") {
        res = await sendMemoryShareClaimRequest(item, action, "chunk");
      } else {
        res = await sendMemoryShareReviewRequest(item, action, note, "chunk");
      }
      if (res?.ok) {
        successCount += 1;
        continue;
      }
      errors.push(res?.error?.message || t("memory.memoryReadFailed", {}, "Failed to read memory data."));
    }

    memoryViewerState.sharedReviewBatchBusy = false;
    if (successCount > 0) {
      const successTitle = action === "claim" || action === "release"
        ? t("memory.shareClaimSuccessTitle", {}, "Shared Claim Updated")
        : t("memory.shareReviewSuccessTitle", {}, "Shared Review Updated");
      showNotice?.(
        successTitle,
        t(
          "memory.sharedReviewBatchSuccessMessage",
          {
            action: formatSharedReviewBatchActionLabel(action),
            count: formatCount(successCount),
            skipped: formatCount(batchState.selectedCount - successCount),
          },
          `${action} applied to ${formatCount(successCount)} selected item(s).`,
        ),
        errors.length ? "info" : "success",
        3200,
      );
    }
    if (!successCount && errors.length) {
      showNotice?.(
        t("memory.sharedReviewBatchFailedTitle", {}, "Batch Shared Review Failed"),
        errors[0],
        "error",
        4200,
      );
    }

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
    const res = await sendMemoryShareReviewRequest(item, decision, note, scope);
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
    const res = await sendMemoryShareClaimRequest(item, action, scope);
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
    memoryViewerDetailEl.querySelectorAll("[data-memory-open-shared-review-context]").forEach((node) => {
      node.addEventListener("click", () => {
        void openSharedReviewContextForItem(item);
      });
    });
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

  async function openSharedReviewContextForItem(item) {
    const targetAgentId = getMemoryShareTargetAgentId(item);
    const queueStatus = normalizeMemorySharePromotionStatus(item);
    const memoryViewerState = getMemoryViewerState();
    const filters = getSharedReviewFilters();
    filters.targetAgentId = targetAgentId || "";
    filters.claimedByAgentId = filters.focus === "mine" ? getActiveAgentId() : filters.claimedByAgentId;
    memoryViewerState.tab = "sharedReview";
    memoryViewerState.items = [];
    memoryViewerState.selectedId = typeof item?.id === "string" ? item.id.trim() : null;
    memoryViewerState.selectedTask = null;
    memoryViewerState.selectedCandidate = null;
    memoryViewerState.sharedReviewSummary = null;
    memoryViewerState.selectedSharedReviewIds = [];
    memoryViewerState.sharedReviewBatchBusy = false;
    if (memoryChunkGovernanceFilterEl && queueStatus && queueStatus !== "none") {
      memoryChunkGovernanceFilterEl.value = queueStatus === "active" ? "approved" : queueStatus;
    } else if (memoryChunkGovernanceFilterEl && !memoryChunkGovernanceFilterEl.value) {
      memoryChunkGovernanceFilterEl.value = "pending";
    }
    captureAgentViewState();
    syncMemoryViewerUi();
    await loadSharedReviewQueue(false);
    if (memoryViewerState.selectedId && Array.isArray(memoryViewerState.items) && memoryViewerState.items.some((entry) => entry?.id === memoryViewerState.selectedId)) {
      await loadMemoryDetail(memoryViewerState.selectedId, null, { targetAgentId });
    }
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

  async function loadSharedReviewQueue(forceSelectFirst = false, existingContext = null) {
    const requestContext = createMemoryViewerRequestContext(existingContext);
    renderMemoryViewerListEmpty(t("memory.sharedReviewLoading", {}, "Loading shared review inbox..."));
    renderMemoryViewerDetailEmpty(t("memory.sharedReviewDetailLoading", {}, "Loading shared review details..."));

    const query = memorySearchInputEl ? memorySearchInputEl.value.trim() : "";
    const params = buildSharedReviewQueueParams({
      reviewerAgentId: requestContext.agentId,
      limit: 50,
      query,
      governanceStatus: memoryChunkGovernanceFilterEl?.value || "pending",
      sharedReviewFilters: getSharedReviewFilters(),
    });

    const res = await sendReq({
      type: "req",
      id: makeId(),
      method: "memory.share.queue",
      params,
    });
    const memoryViewerState = getMemoryViewerState();
    if (!isMemoryViewerRequestCurrent(requestContext)) return;
    if (!res || !res.ok) {
      memoryViewerState.sharedReviewSummary = null;
      memoryViewerState.items = [];
      clearSharedReviewSelection();
      renderMemoryViewerStats(null);
      renderSharedReviewBatchBar();
      renderMemoryViewerListEmpty(t("memory.sharedReviewLoadFailed", {}, "Failed to load shared review inbox."));
      renderMemoryViewerDetailEmpty(res?.error?.message || t("memory.sharedReviewDetailLoadFailed", {}, "Failed to read shared review data."));
      return;
    }

    const items = Array.isArray(res.payload?.items) ? res.payload.items : [];
    memoryViewerState.items = items;
    memoryViewerState.sharedReviewSummary = res.payload?.summary ?? null;
    syncSelectedSharedReviewIds(items);
    renderMemoryViewerStats(memoryViewerState.stats);
    renderSharedReviewBatchBar();

    if (!items.length) {
      memoryViewerState.selectedId = null;
      renderSharedReviewList(items);
      renderMemoryViewerDetailEmpty(t("memory.sharedReviewEmpty", {}, "There are no shared review items right now."));
      return;
    }

    const selectedExists = items.some((item) => item.id === memoryViewerState.selectedId);
    if (forceSelectFirst || !selectedExists) {
      memoryViewerState.selectedId = items[0].id;
    }

    renderSharedReviewList(items);
    const selected = items.find((item) => item.id === memoryViewerState.selectedId);
    await loadMemoryDetail(memoryViewerState.selectedId, requestContext, {
      targetAgentId: selected?.targetAgentId,
    });
  }

  function renderMemoryViewerStats(stats) {
    if (!memoryViewerStatsEl) return;
    const memoryViewerState = getMemoryViewerState();
    if (!stats) {
      if (memoryViewerState.tab === "sharedReview" && memoryViewerState.sharedReviewSummary) {
        stats = {};
      } else if (memoryViewerState.tab === "outboundAudit") {
        stats = {};
      } else {
        memoryViewerStatsEl.innerHTML = `
          <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.statFiles", {}, "Memory Files"))}</span><strong class="memory-stat-value">--</strong></div>
          <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.statChunks", {}, "Memory Chunks"))}</span><strong class="memory-stat-value">--</strong></div>
          <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.statVectors", {}, "Vector Index"))}</span><strong class="memory-stat-value">--</strong></div>
          <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.statSummaries", {}, "Summaries Ready"))}</span><strong class="memory-stat-value">--</strong></div>
        `;
        return;
      }
    }

    if (memoryViewerState.tab === "outboundAudit") {
      const items = Array.isArray(memoryViewerState.items) ? memoryViewerState.items : [];
      if (getOutboundAuditFocus() === "threads") {
        const summary = buildEmailThreadOrganizerStats(items);
        memoryViewerStatsEl.innerHTML = `
          <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.statCurrentResults", {}, "Current Results"))}</span><strong class="memory-stat-value">${formatCount(summary.threadCount)}</strong></div>
          <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.emailThreadOrganizerStatNeedsReply", {}, "待回复线程"))}</span><strong class="memory-stat-value">${formatCount(summary.needsReplyCount)}</strong></div>
          <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.emailThreadOrganizerStatNeedsFollowUp", {}, "待跟进线程"))}</span><strong class="memory-stat-value">${formatCount(summary.needsFollowUpCount)}</strong></div>
          <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.emailThreadOrganizerStatReminderPending", {}, "待提醒线程"))}</span><strong class="memory-stat-value">${formatCount(summary.reminderPendingCount)}</strong></div>
          <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.emailThreadOrganizerStatReminderDelivered", {}, "已提醒线程"))}</span><strong class="memory-stat-value">${formatCount(summary.reminderDeliveredCount)}</strong></div>
          <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.emailThreadOrganizerStatReplyReview", {}, "回复待复核"))}</span><strong class="memory-stat-value">${formatCount(summary.replyReviewRequiredCount)}</strong></div>
          <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.emailThreadOrganizerStatFailed", {}, "有失败记录"))}</span><strong class="memory-stat-value">${formatCount(summary.failedThreadCount)}</strong></div>
          <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.emailThreadOrganizerStatRetry", {}, "待重试线程"))}</span><strong class="memory-stat-value">${formatCount(summary.retryScheduledCount)}</strong></div>
        `;
        return;
      }
      const outboundSentCount = items.filter((item) => item?.auditKind !== "email_inbound" && item?.delivery === "sent").length;
      const outboundFailedCount = items.filter((item) => item?.auditKind !== "email_inbound" && item?.delivery === "failed").length;
      const inboundProcessedCount = items.filter((item) => item?.auditKind === "email_inbound" && item?.status === "processed").length;
      const inboundFailedCount = items.filter((item) => item?.auditKind === "email_inbound" && item?.status === "failed").length;
      const inboundDuplicateCount = items.filter((item) => item?.auditKind === "email_inbound" && item?.status === "skipped_duplicate").length;
      memoryViewerStatsEl.innerHTML = `
        <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.statCurrentResults", {}, "Current Results"))}</span><strong class="memory-stat-value">${formatCount(items.length)}</strong></div>
        <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.outboundAuditStatSent", {}, "外发已发送"))}</span><strong class="memory-stat-value">${formatCount(outboundSentCount)}</strong></div>
        <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.outboundAuditStatFailed", {}, "外发失败"))}</span><strong class="memory-stat-value">${formatCount(outboundFailedCount)}</strong></div>
        <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.outboundAuditStatInboundProcessed", {}, "收信已处理"))}</span><strong class="memory-stat-value">${formatCount(inboundProcessedCount)}</strong></div>
        <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.outboundAuditStatInboundFailed", {}, "收信失败"))}</span><strong class="memory-stat-value">${formatCount(inboundFailedCount)}</strong></div>
        <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.outboundAuditStatInboundDuplicate", {}, "收信重复跳过"))}</span><strong class="memory-stat-value">${formatCount(inboundDuplicateCount)}</strong></div>
      `;
      return;
    }

    if (memoryViewerState.tab === "sharedReview") {
      const summary = memoryViewerState.sharedReviewSummary || {};
      const byAgent = Array.isArray(summary.byAgent) ? summary.byAgent.slice(0, 3) : [];
      const byReviewer = Array.isArray(summary.byReviewer) ? summary.byReviewer.slice(0, 3) : [];
      const agentSummary = byAgent.length
        ? byAgent.map((item) => `${item.displayName || item.agentId} ${formatCount(item.totalCount)}`).join(" · ")
        : t("memory.sharedReviewAgentSummaryEmpty", {}, "No resident backlog.");
      const reviewerSummary = byReviewer.length
        ? byReviewer.map((item) => `${item.agentId} ${formatCount(item.count)}`).join(" · ")
        : t("memory.sharedReviewReviewerSummaryEmpty", {}, "No claimed owner.");
      memoryViewerStatsEl.innerHTML = `
        <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.sharedReviewActingAs", {}, "Acting Reviewer"))}</span><strong class="memory-stat-value memory-stat-value-compact">${escapeHtml(summary.reviewerAgentId || getActiveAgentId())}</strong></div>
        <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.statSharedPendingQueue", {}, "Pending Shared Queue"))}</span><strong class="memory-stat-value">${formatCount(summary.pendingCount)}</strong></div>
        <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.sharedReviewActionableCount", {}, "Actionable Now"))}</span><strong class="memory-stat-value">${formatCount(summary.reviewerActionableCount)}</strong></div>
        <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.sharedReviewMyClaims", {}, "My Claims"))}</span><strong class="memory-stat-value">${formatCount(summary.reviewerClaimedCount)}</strong></div>
        <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.sharedReviewOverdueCount", {}, "Timed-out Claims"))}</span><strong class="memory-stat-value">${formatCount(summary.overdueCount)}</strong><div class="memory-stat-caption">${escapeHtml(t("memory.sharedReviewOverdueHint", { duration: formatDuration(summary.claimTimeoutMs) }, `Timeout after ${formatDuration(summary.claimTimeoutMs)}`))}</div></div>
        <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.sharedReviewBlockedCount", {}, "Blocked by Others"))}</span><strong class="memory-stat-value">${formatCount(summary.blockedCount)}</strong></div>
        <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.sharedReviewAgentBacklog", {}, "Backlog by Agent"))}</span><strong class="memory-stat-value memory-stat-value-compact">${escapeHtml(agentSummary)}</strong></div>
        <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.sharedReviewReviewerBacklog", {}, "Backlog by Reviewer"))}</span><strong class="memory-stat-value memory-stat-value-compact">${escapeHtml(reviewerSummary)}</strong></div>
        <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.sharedReviewCompletedCount", {}, "Reviewed History"))}</span><strong class="memory-stat-value">${formatCount((Number(summary.approvedCount) || 0) + (Number(summary.rejectedCount) || 0) + (Number(summary.revokedCount) || 0))}</strong></div>
      `;
      return;
    }

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

  function renderSharedReviewList(items) {
    if (!memoryViewerListEl) return;
    if (!items.length) {
      renderMemoryViewerListEmpty(t("memory.sharedReviewEmpty", {}, "There are no shared review items right now."));
      renderSharedReviewBatchBar();
      return;
    }

    const memoryViewerState = getMemoryViewerState();
    const selectedIds = new Set(getSelectedSharedReviewIds());
    memoryViewerListEl.innerHTML = items.map((item) => {
      const title = summarizeSourcePath(item.sourcePath);
      const summary = item.summary || item.snippet || t("memory.emptyNoSummary", {}, "No summary");
      const isActive = item.id === memoryViewerState.selectedId;
      const isSelected = selectedIds.has(item.id);
      const visibility = normalizeMemoryVisibility(item.visibility);
      const category = formatMemoryCategory(item.category);
      const sourceView = item.sourceView || { scope: visibility };
      const promotion = getMemorySharePromotionMetadata(item);
      const claimState = getMemoryShareClaimState(item);
      const claimOwner = claimState.claimOwner;
      const targetLabel = item.targetDisplayName || item.targetAgentId || promotion?.sourceAgentId || "-";
      const statusLabel = formatMemorySharePromotionStatusLabel(item.reviewStatus || normalizeMemorySharePromotionStatus(item));
      const requestedAt = promotion?.requestedAt || item.updatedAt || "";
      const currentAgentId = getActiveAgentId();
      const claimBadge = claimState.claimTimedOut
        ? `<span class="memory-badge memory-badge-shared">${escapeHtml(t("memory.sharedReviewOverdueBadge", {}, "Claim Timed Out"))}</span>`
        : claimOwner
          ? `<span class="memory-badge ${claimOwner === currentAgentId ? "memory-badge-shared" : "memory-badge-hybrid"}">${escapeHtml(`${t("memory.detailSharedClaim", {}, "Review Claim")}: ${claimOwner}`)}</span>`
          : "";
      const queueStateBadge = claimState.blockedByOtherReviewer
        ? `<span class="memory-badge memory-badge-hybrid">${escapeHtml(t("memory.sharedReviewBlockedBadge", {}, "Blocked"))}</span>`
        : claimState.actionableByReviewer
          ? `<span class="memory-badge memory-badge-private">${escapeHtml(t("memory.sharedReviewActionableBadge", {}, "Actionable"))}</span>`
          : "";
      const claimDeadline = claimState.claimExpiresAt
        ? `<span>${escapeHtml(
          claimState.claimTimedOut
            ? t("memory.sharedReviewExpiredAt", { time: formatDateTime(claimState.claimExpiresAt) }, `Expired ${formatDateTime(claimState.claimExpiresAt)}`)
            : t("memory.sharedReviewExpiresAt", { time: formatDateTime(claimState.claimExpiresAt) }, `Expires ${formatDateTime(claimState.claimExpiresAt)}`),
        )}</span>`
        : "";
      return `
        <div class="memory-list-item ${isActive ? "active" : ""}" data-shared-review-memory-id="${escapeHtml(item.id)}" data-shared-review-target-agent-id="${escapeHtml(item.targetAgentId || "")}">
          <div class="memory-list-item-head">
            <label class="memory-list-selector">
              <input type="checkbox" data-shared-review-select="${escapeHtml(item.id)}" ${isSelected ? "checked" : ""}>
            </label>
            <div class="memory-list-item-title">${escapeHtml(title)}</div>
          </div>
          <div class="memory-list-item-meta">
            <span class="memory-badge">${escapeHtml(targetLabel)}</span>
            <span class="memory-badge">${escapeHtml(statusLabel)}</span>
            ${claimBadge}
            ${queueStateBadge}
            ${renderSourceViewBadge(sourceView)}
            <span class="memory-badge">${escapeHtml(category)}</span>
            ${claimDeadline}
            <span>${escapeHtml(formatDateTime(requestedAt))}</span>
          </div>
          <div class="memory-list-item-snippet">${escapeHtml(summary)}</div>
        </div>
      `;
    }).join("");

    memoryViewerListEl.querySelectorAll("[data-shared-review-select]").forEach((node) => {
      node.addEventListener("click", (event) => {
        event.stopPropagation();
      });
      node.addEventListener("change", () => {
        const chunkId = node.getAttribute("data-shared-review-select");
        toggleSharedReviewSelection(chunkId, node.checked);
        renderSharedReviewBatchBar();
      });
    });

    memoryViewerListEl.querySelectorAll("[data-shared-review-memory-id]").forEach((node) => {
      node.addEventListener("click", async () => {
        const chunkId = node.getAttribute("data-shared-review-memory-id");
        const targetAgentId = node.getAttribute("data-shared-review-target-agent-id");
        if (!chunkId) return;
        memoryViewerState.selectedId = chunkId;
        renderSharedReviewList(memoryViewerState.items);
        await loadMemoryDetail(chunkId, null, { targetAgentId });
      });
    });
    renderSharedReviewBatchBar();
  }

  function renderExternalOutboundAuditList(items) {
    if (!memoryViewerListEl) return;
    if (!items.length) {
      renderMemoryViewerListEmpty(t("memory.outboundAuditEmpty", {}, "当前还没有匹配的消息审计记录。"));
      return;
    }

    const memoryViewerState = getMemoryViewerState();
    memoryViewerListEl.innerHTML = items.map((item, index) => {
      const itemId = getExternalOutboundAuditItemId(item, index);
      const isActive = itemId === memoryViewerState.selectedId;
      if (item?.auditKind === "email_thread_organizer") {
        const title = item?.latestSubject || item?.threadId || item?.conversationId || t("memory.emailThreadOrganizerUntitled", {}, "未命名邮件线程");
        const stateParts = [
          item?.latestTriageCategory,
          item?.needsReply ? t("memory.emailThreadOrganizerNeedsReplyBadge", {}, "待回复") : "",
          item?.needsFollowUp ? t("memory.emailThreadOrganizerNeedsFollowUpBadge", {}, "待跟进") : "",
          item?.reminderStatus === "pending" ? t("memory.emailThreadOrganizerReminderPendingBadge", {}, "待提醒") : "",
          item?.reminderStatus === "delivered" ? t("memory.emailThreadOrganizerReminderDeliveredBadge", {}, "已提醒") : "",
        ].filter(Boolean);
        const snippet = item?.latestTriageSummary || item?.latestPreview || t("memory.outboundAuditPreviewEmpty", {}, "(空文本)");
        return `
          <div class="memory-list-item ${isActive ? "active" : ""}" data-outbound-audit-id="${escapeHtml(itemId)}">
            <div class="memory-list-item-title">${escapeHtml(title)}</div>
            <div class="memory-list-item-meta">
              <span>${escapeHtml(formatDateTime(item?.latestTimestamp))}</span>
              <span>${escapeHtml(item?.latestSender || item?.targetAccountId || "-")}</span>
              <span>${escapeHtml(stateParts.join(" / ") || t("memory.emailThreadOrganizerStateNeutral", {}, "线程整理"))}</span>
            </div>
            <div class="memory-list-item-snippet">${escapeHtml(snippet)}</div>
          </div>
        `;
      }
      const channel = formatOutboundAuditChannelLabel(item);
      const preview = formatOutboundAuditPreview(item);
      const stateSummary = item?.auditKind === "email_inbound"
        ? formatEmailInboundStatusLabel(item?.status)
        : `${formatExternalOutboundDecisionLabel(item?.decision)} / ${formatExternalOutboundDeliveryLabel(item?.delivery)}`;
      return `
        <div class="memory-list-item ${isActive ? "active" : ""}" data-outbound-audit-id="${escapeHtml(itemId)}">
          <div class="memory-list-item-title">${escapeHtml(`${channel} · ${stateSummary}`)}</div>
          <div class="memory-list-item-meta">
            <span>${escapeHtml(formatDateTime(item?.timestamp))}</span>
            <span>${escapeHtml(item?.requestId || item?.messageId || "-")}</span>
            <span>${escapeHtml(item?.requestedByAgentId || item?.requestedAgentId || "-")}</span>
          </div>
          <div class="memory-list-item-snippet">${escapeHtml(preview)}</div>
        </div>
      `;
    }).join("");

    memoryViewerListEl.querySelectorAll("[data-outbound-audit-id]").forEach((node) => {
      node.addEventListener("click", () => {
        const itemId = node.getAttribute("data-outbound-audit-id");
        if (!itemId) return;
        memoryViewerState.selectedId = itemId;
        renderExternalOutboundAuditList(memoryViewerState.items);
        const selected = (Array.isArray(memoryViewerState.items) ? memoryViewerState.items : [])
          .find((item, index) => getExternalOutboundAuditItemId(item, index) === itemId);
        renderExternalOutboundAuditDetail(selected || null);
      });
    });
  }

  function renderExternalOutboundAuditDetail(item) {
    if (!memoryViewerDetailEl) return;
    if (!item) {
      renderMemoryViewerDetailEmpty(t("memory.outboundAuditNoSelection", {}, "请选择一条消息审计记录。"));
      return;
    }

    if (item?.auditKind === "email_thread_organizer") {
      const badges = [
        item?.providerId ? `<span class="memory-badge">${escapeHtml(`email-inbound/${item.providerId}`)}</span>` : "",
        item?.latestTriageCategory ? `<span class="memory-badge">${escapeHtml(item.latestTriageCategory)}</span>` : "",
        item?.latestTriagePriority ? `<span class="memory-badge">${escapeHtml(item.latestTriagePriority)}</span>` : "",
        item?.needsReply ? `<span class="memory-badge">${escapeHtml(t("memory.emailThreadOrganizerNeedsReplyBadge", {}, "待回复"))}</span>` : "",
        item?.needsFollowUp ? `<span class="memory-badge">${escapeHtml(t("memory.emailThreadOrganizerNeedsFollowUpBadge", {}, "待跟进"))}</span>` : "",
        item?.latestSuggestedReplyQuality === "review_required" ? `<span class="memory-badge">${escapeHtml(t("memory.emailThreadOrganizerReplyReviewBadge", {}, "回复待复核"))}</span>` : "",
        item?.reminderStatus === "pending" ? `<span class="memory-badge">${escapeHtml(t("memory.emailThreadOrganizerReminderPendingBadge", {}, "待提醒"))}</span>` : "",
        item?.reminderStatus === "delivered" ? `<span class="memory-badge">${escapeHtml(t("memory.emailThreadOrganizerReminderDeliveredBadge", {}, "已提醒"))}</span>` : "",
        item?.reminderStatus === "resolved" ? `<span class="memory-badge">${escapeHtml(t("memory.emailThreadOrganizerReminderResolvedBadge", {}, "提醒已解除"))}</span>` : "",
      ].filter(Boolean).join("");
      const retryState = item?.retryExhaustedCount
        ? t("memory.outboundAuditInboundRetryExhausted", { count: item.retryExhaustedCount }, "已耗尽（{count} 次）")
        : item?.retryScheduledCount
          ? t("memory.outboundAuditInboundRetryScheduled", { count: item.retryScheduledCount }, "待重试（第 {count} 次）")
          : "-";
      const preview = item?.latestPreview || t("memory.outboundAuditPreviewEmpty", {}, "(空文本)");
      memoryViewerDetailEl.innerHTML = `
        <div class="memory-detail-shell">
          <div class="memory-detail-card">
            <div class="memory-detail-title">${escapeHtml(t("memory.emailThreadOrganizerTitle", {}, "邮件线程整理"))}</div>
            <div class="memory-detail-badges">${badges}</div>
            <div class="memory-detail-actions">
              <button class="button" data-open-email-thread-conversation="${escapeHtml(item?.conversationId || "")}" ${item?.conversationId ? "" : "disabled"}>${escapeHtml(t("memory.emailThreadOrganizerOpenConversation", {}, "打开线程会话"))}</button>
            </div>
          </div>
          <div class="memory-detail-grid">
            <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundConversation", {}, "会话"))}</span><div class="memory-detail-text">${escapeHtml(item?.conversationId || "-")}</div></div>
            <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditProvider", {}, "Provider"))}</span><div class="memory-detail-text">${escapeHtml(item?.providerId || "-")}</div></div>
            <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditTargetAccountId", {}, "目标 Account ID"))}</span><div class="memory-detail-text">${escapeHtml(item?.targetAccountId || "-")}</div></div>
            <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundAgent", {}, "处理 Agent"))}</span><div class="memory-detail-text">${escapeHtml(item?.requestedAgentId || "-")}</div></div>
            <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditThreadId", {}, "线程 ID"))}</span><div class="memory-detail-text">${escapeHtml(item?.threadId || "-")}</div></div>
            <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundMessageId", {}, "Message ID"))}</span><div class="memory-detail-text">${escapeHtml(item?.latestMessageId || "-")}</div></div>
            <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditSubject", {}, "主题"))}</span><div class="memory-detail-text">${escapeHtml(item?.latestSubject || "-")}</div></div>
            <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundSender", {}, "发件人"))}</span><div class="memory-detail-text">${escapeHtml(item?.latestSender || "-")}</div></div>
            <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.emailThreadOrganizerMessageCount", {}, "线程消息数"))}</span><div class="memory-detail-text">${escapeHtml(String(Number(item?.messageCount) || 0))}</div></div>
            <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundStatus", {}, "处理状态"))}</span><div class="memory-detail-text">${escapeHtml(formatEmailInboundStatusLabel(item?.latestStatus))}</div></div>
            <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundTriageCategory", {}, "整理分类"))}</span><div class="memory-detail-text">${escapeHtml(item?.latestTriageCategory || "-")}</div></div>
            <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundTriagePriority", {}, "整理优先级"))}</span><div class="memory-detail-text">${escapeHtml(item?.latestTriagePriority || "-")}</div></div>
            <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundTriageDisposition", {}, "建议动作"))}</span><div class="memory-detail-text">${escapeHtml(item?.latestTriageDisposition || "-")}</div></div>
            <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundTriageSummary", {}, "整理摘要"))}</span><div class="memory-detail-text">${escapeHtml(item?.latestTriageSummary || "-")}</div></div>
            <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundFollowUpWindow", {}, "建议跟进窗口"))}</span><div class="memory-detail-text">${escapeHtml(item?.latestTriageFollowUpWindowHours ? `${item.latestTriageFollowUpWindowHours}h` : "-")}</div></div>
            <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundSuggestedReplyStarter", {}, "建议回复 starter"))}</span><div class="memory-detail-text">${escapeHtml(item?.latestSuggestedReplyStarter || "-")}</div></div>
            <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundSuggestedReplyQuality", {}, "回复建议质量"))}</span><div class="memory-detail-text">${escapeHtml(item?.latestSuggestedReplyQuality || "-")}</div></div>
            <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundSuggestedReplyConfidence", {}, "回复建议置信度"))}</span><div class="memory-detail-text">${escapeHtml(item?.latestSuggestedReplyConfidence || "-")}</div></div>
            <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundSuggestedReplySubject", {}, "建议回复主题"))}</span><div class="memory-detail-text">${escapeHtml(item?.latestSuggestedReplySubject || "-")}</div></div>
            <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.emailThreadOrganizerProcessedCount", {}, "已处理消息"))}</span><div class="memory-detail-text">${escapeHtml(String(Number(item?.processedCount) || 0))}</div></div>
            <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.emailThreadOrganizerFailedCount", {}, "失败消息"))}</span><div class="memory-detail-text">${escapeHtml(String(Number(item?.failedCount) || 0))}</div></div>
            <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundRetryState", {}, "重试状态"))}</span><div class="memory-detail-text">${escapeHtml(retryState)}</div></div>
            <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.emailThreadOrganizerReminderStatus", {}, "提醒状态"))}</span><div class="memory-detail-text">${escapeHtml(item?.reminderStatus || "-")}</div></div>
            <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.emailThreadOrganizerReminderDueAt", {}, "提醒时间"))}</span><div class="memory-detail-text">${escapeHtml(item?.reminderDueAt ? formatDateTime(item.reminderDueAt) : "-")}</div></div>
            <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.emailThreadOrganizerReminderDeliveredAt", {}, "最近提醒"))}</span><div class="memory-detail-text">${escapeHtml(item?.reminderLastDeliveredAt ? formatDateTime(item.reminderLastDeliveredAt) : "-")}</div></div>
            <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.emailThreadOrganizerReminderResolution", {}, "提醒解除"))}</span><div class="memory-detail-text">${escapeHtml(item?.reminderResolvedAt ? formatDateTime(item.reminderResolvedAt) : (item?.reminderResolutionSource || "-"))}</div></div>
          </div>
          ${Array.isArray(item?.latestSuggestedReplyWarnings) && item.latestSuggestedReplyWarnings.length > 0 ? `
            <div class="memory-detail-card">
              <span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundSuggestedReplyWarnings", {}, "回复建议风险"))}</span>
              <pre class="memory-detail-pre">${escapeHtml(item.latestSuggestedReplyWarnings.join("\n"))}</pre>
            </div>
          ` : ""}
          ${Array.isArray(item?.latestSuggestedReplyChecklist) && item.latestSuggestedReplyChecklist.length > 0 ? `
            <div class="memory-detail-card">
              <span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundSuggestedReplyChecklist", {}, "回复建议检查清单"))}</span>
              <pre class="memory-detail-pre">${escapeHtml(item.latestSuggestedReplyChecklist.join("\n"))}</pre>
            </div>
          ` : ""}
          ${item?.latestSuggestedReplyDraft ? `
            <div class="memory-detail-card">
              <span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundSuggestedReplyDraft", {}, "建议回复草稿"))}</span>
              <pre class="memory-detail-pre">${escapeHtml(item.latestSuggestedReplyDraft)}</pre>
            </div>
          ` : ""}
          <div class="memory-detail-card">
            <span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditContentPreview", {}, "消息预览"))}</span>
            <pre class="memory-detail-pre">${escapeHtml(preview)}</pre>
          </div>
        </div>
      `;
      memoryViewerDetailEl.querySelectorAll("[data-open-email-thread-conversation]").forEach((node) => {
        node.addEventListener("click", () => {
          const conversationId = node.getAttribute("data-open-email-thread-conversation");
          if (!conversationId) return;
          openConversationSession?.(
            conversationId,
            t("memory.emailThreadOrganizerSwitchedConversation", { conversationId }, `Switched to email thread conversation: ${conversationId}`),
          );
        });
      });
      return;
    }

    const preview = formatOutboundAuditPreview(item);
    const isEmailOutboundAudit = item?.auditKind === "email";
    const isEmailInboundAudit = item?.auditKind === "email_inbound";
    const isEmailAudit = isEmailOutboundAudit || isEmailInboundAudit;
    const diagnosis = isEmailOutboundAudit ? {
      stageLabel: t("memory.outboundAuditEmailFailureStage", {}, "邮件投递"),
      summary: formatEmailOutboundDiagnosis(item),
    } : isEmailInboundAudit ? {
      stageLabel: t("memory.outboundAuditEmailInboundFailureStage", {}, "邮件收信"),
      summary: formatEmailInboundDiagnosis(item),
    } : buildExternalOutboundDiagnosis({
      errorCode: item?.errorCode,
      error: item?.error,
      targetSessionKey: item?.targetSessionKey,
      delivery: item?.delivery,
    }, t);
    const senderSummary = Array.isArray(item?.from) ? item.from.join(", ") : "";
    const recipientSummary = [
      ...(Array.isArray(item?.to) ? item.to : []),
      ...(Array.isArray(item?.cc) ? item.cc : []),
      ...(Array.isArray(item?.bcc) ? item.bcc : []),
    ].join(", ");
    const badgeMarkup = isEmailInboundAudit
      ? `
            <span class="memory-badge">${escapeHtml(formatOutboundAuditChannelLabel(item))}</span>
            <span class="memory-badge">${escapeHtml(formatEmailInboundStatusLabel(item?.status))}</span>
            <span class="memory-badge">${escapeHtml(item?.createdBinding ? t("memory.outboundAuditInboundThreadBindingNew", {}, "新建线程会话") : t("memory.outboundAuditInboundThreadBindingExisting", {}, "复用线程会话"))}</span>
            ${item?.triageCategory ? `<span class="memory-badge">${escapeHtml(item.triageCategory)}</span>` : ""}
            ${item?.triagePriority ? `<span class="memory-badge">${escapeHtml(item.triagePriority)}</span>` : ""}
            ${item?.suggestedReplyQuality === "review_required" ? `<span class="memory-badge">${escapeHtml(t("memory.emailThreadOrganizerReplyReviewBadge", {}, "回复待复核"))}</span>` : ""}
      `
      : `
            <span class="memory-badge">${escapeHtml(formatOutboundAuditChannelLabel(item))}</span>
            <span class="memory-badge">${escapeHtml(formatExternalOutboundDecisionLabel(item?.decision))}</span>
            <span class="memory-badge">${escapeHtml(formatExternalOutboundDeliveryLabel(item?.delivery))}</span>
      `;
    const detailGrid = isEmailInboundAudit ? `
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditTime", {}, "时间"))}</span><div class="memory-detail-text">${escapeHtml(formatDateTime(item?.timestamp))}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundMessageId", {}, "Message ID"))}</span><div class="memory-detail-text">${escapeHtml(item?.messageId || "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundConversation", {}, "会话"))}</span><div class="memory-detail-text">${escapeHtml(item?.conversationId || "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundAgent", {}, "处理 Agent"))}</span><div class="memory-detail-text">${escapeHtml(item?.requestedAgentId || "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditProvider", {}, "Provider"))}</span><div class="memory-detail-text">${escapeHtml(item?.providerId || "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditTargetAccountId", {}, "目标 Account ID"))}</span><div class="memory-detail-text">${escapeHtml(item?.targetAccountId || "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundSender", {}, "发件人"))}</span><div class="memory-detail-text">${escapeHtml(senderSummary || "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditSubject", {}, "主题"))}</span><div class="memory-detail-text">${escapeHtml(item?.subject || "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditThreadId", {}, "线程 ID"))}</span><div class="memory-detail-text">${escapeHtml(item?.threadId || "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundReplyMode", {}, "线程语义"))}</span><div class="memory-detail-text">${escapeHtml(item?.inReplyToMessageId || (Array.isArray(item?.references) && item.references.length > 0) ? t("memory.outboundAuditInboundReplyModeReply", {}, "回复既有线程") : t("memory.outboundAuditInboundReplyModeNew", {}, "新线程首封"))}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundThreadBinding", {}, "会话绑定"))}</span><div class="memory-detail-text">${escapeHtml(item?.createdBinding ? t("memory.outboundAuditInboundThreadBindingNew", {}, "新建线程会话") : t("memory.outboundAuditInboundThreadBindingExisting", {}, "复用线程会话"))}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundInReplyTo", {}, "In-Reply-To"))}</span><div class="memory-detail-text">${escapeHtml(item?.inReplyToMessageId || "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundReferences", {}, "References"))}</span><div class="memory-detail-text">${escapeHtml(Array.isArray(item?.references) && item.references.length > 0 ? item.references.join(" | ") : "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundStatus", {}, "处理状态"))}</span><div class="memory-detail-text">${escapeHtml(formatEmailInboundStatusLabel(item?.status))}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundTriageCategory", {}, "整理分类"))}</span><div class="memory-detail-text">${escapeHtml(item?.triageCategory || "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundTriagePriority", {}, "整理优先级"))}</span><div class="memory-detail-text">${escapeHtml(item?.triagePriority || "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundTriageDisposition", {}, "建议动作"))}</span><div class="memory-detail-text">${escapeHtml(item?.triageDisposition || "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundTriageSummary", {}, "整理摘要"))}</span><div class="memory-detail-text">${escapeHtml(item?.triageSummary || "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundFollowUpWindow", {}, "建议跟进窗口"))}</span><div class="memory-detail-text">${escapeHtml(item?.triageFollowUpWindowHours ? `${item.triageFollowUpWindowHours}h` : "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundSuggestedReplyStarter", {}, "建议回复 starter"))}</span><div class="memory-detail-text">${escapeHtml(item?.suggestedReplyStarter || "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundSuggestedReplyQuality", {}, "回复建议质量"))}</span><div class="memory-detail-text">${escapeHtml(item?.suggestedReplyQuality || "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundSuggestedReplyConfidence", {}, "回复建议置信度"))}</span><div class="memory-detail-text">${escapeHtml(item?.suggestedReplyConfidence || "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundSuggestedReplySubject", {}, "建议回复主题"))}</span><div class="memory-detail-text">${escapeHtml(item?.suggestedReplySubject || "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditErrorCode", {}, "错误码"))}</span><div class="memory-detail-text">${escapeHtml(item?.errorCode || "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditDiagnosis", {}, "诊断"))}</span><div class="memory-detail-text">${escapeHtml(item?.status === "failed" || item?.status === "invalid_event" || item?.errorCode || item?.error ? diagnosis.summary : "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditAttachmentCount", {}, "附件数"))}</span><div class="memory-detail-text">${escapeHtml(String(Number(item?.attachmentCount) || 0))}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundInlineAttachmentCount", {}, "内联附件数"))}</span><div class="memory-detail-text">${escapeHtml(String(Number(item?.inlineAttachmentCount) || 0))}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundMailbox", {}, "Mailbox"))}</span><div class="memory-detail-text">${escapeHtml(item?.mailbox || "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundSessionKey", {}, "Session Key"))}</span><div class="memory-detail-text">${escapeHtml(item?.sessionKey || "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundCheckpointUid", {}, "Checkpoint UID"))}</span><div class="memory-detail-text">${escapeHtml(item?.checkpointUid ? String(item.checkpointUid) : "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundRetryState", {}, "重试状态"))}</span><div class="memory-detail-text">${escapeHtml(item?.retryExhausted ? t("memory.outboundAuditInboundRetryExhausted", { count: item?.retryAttempt || 0 }, "已耗尽（{count} 次）") : item?.retryScheduled ? t("memory.outboundAuditInboundRetryScheduled", { count: item?.retryAttempt || 0 }, "待重试（第 {count} 次）") : "-")}</div></div>
    ` : `
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditTime", {}, "时间"))}</span><div class="memory-detail-text">${escapeHtml(formatDateTime(item?.timestamp))}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditRequestId", {}, "Request ID"))}</span><div class="memory-detail-text">${escapeHtml(item?.requestId || "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditSourceConversation", {}, "来源会话"))}</span><div class="memory-detail-text">${escapeHtml(item?.sourceConversationId || "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditRequestedByAgent", {}, "请求 Agent"))}</span><div class="memory-detail-text">${escapeHtml(item?.requestedByAgentId || "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(isEmailOutboundAudit ? t("memory.outboundAuditProvider", {}, "Provider") : t("memory.outboundAuditTargetChatId", {}, "目标 Chat ID"))}</span><div class="memory-detail-text">${escapeHtml(isEmailOutboundAudit ? (item?.providerId || "-") : (item?.targetChatId || "-"))}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditTargetAccountId", {}, "目标 Account ID"))}</span><div class="memory-detail-text">${escapeHtml(item?.targetAccountId || "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(isEmailOutboundAudit ? t("memory.outboundAuditRecipients", {}, "收件人") : t("memory.outboundAuditRequestedSessionKey", {}, "请求 Session Key"))}</span><div class="memory-detail-text">${escapeHtml(isEmailOutboundAudit ? (recipientSummary || "-") : (item?.requestedSessionKey || "-"))}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(isEmailOutboundAudit ? t("memory.outboundAuditSubject", {}, "主题") : t("memory.outboundAuditTargetSessionKey", {}, "目标 Session Key"))}</span><div class="memory-detail-text">${escapeHtml(isEmailOutboundAudit ? (item?.subject || "-") : (item?.targetSessionKey || "-"))}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(isEmailOutboundAudit ? t("memory.outboundAuditThreadId", {}, "线程 ID") : t("memory.outboundAuditResolution", {}, "目标解析"))}</span><div class="memory-detail-text">${escapeHtml(isEmailOutboundAudit ? (item?.threadId || item?.providerThreadId || "-") : formatExternalOutboundResolutionLabel(item?.resolution))}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditFailureStage", {}, "失败阶段"))}</span><div class="memory-detail-text">${escapeHtml(item?.delivery === "failed" ? diagnosis.stageLabel : "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditErrorCode", {}, "错误码"))}</span><div class="memory-detail-text">${escapeHtml(item?.errorCode || "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditDiagnosis", {}, "诊断"))}</span><div class="memory-detail-text">${escapeHtml(item?.delivery === "failed" || item?.errorCode || item?.error ? diagnosis.summary : "-")}</div></div>
          ${isEmailAudit ? `<div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditAttachmentCount", {}, "附件数"))}</span><div class="memory-detail-text">${escapeHtml(String(Number(item?.attachmentCount) || 0))}</div></div>` : ""}
          ${isEmailOutboundAudit ? `<div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditReplyToMessageId", {}, "回复消息 ID"))}</span><div class="memory-detail-text">${escapeHtml(item?.replyToMessageId || "-")}</div></div>` : ""}
          ${isEmailOutboundAudit ? `<div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditProviderMessageId", {}, "Provider Message ID"))}</span><div class="memory-detail-text">${escapeHtml(item?.providerMessageId || "-")}</div></div>` : ""}
    `;
    memoryViewerDetailEl.innerHTML = `
      <div class="memory-detail-shell">
        <div class="memory-detail-card">
          <div class="memory-detail-title">${escapeHtml(t("memory.outboundAuditTitle", {}, "消息审计"))}</div>
          <div class="memory-detail-badges">
            ${badgeMarkup}
          </div>
        </div>
        <div class="memory-detail-grid">
          ${detailGrid}
        </div>
        <div class="memory-detail-card">
          <span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditContentPreview", {}, "消息预览"))}</span>
          <pre class="memory-detail-pre">${escapeHtml(preview)}</pre>
        </div>
        ${isEmailInboundAudit && Array.isArray(item?.suggestedReplyWarnings) && item.suggestedReplyWarnings.length > 0 ? `
          <div class="memory-detail-card">
            <span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundSuggestedReplyWarnings", {}, "回复建议风险"))}</span>
            <pre class="memory-detail-pre">${escapeHtml(item.suggestedReplyWarnings.join("\n"))}</pre>
          </div>
        ` : ""}
        ${isEmailInboundAudit && Array.isArray(item?.suggestedReplyChecklist) && item.suggestedReplyChecklist.length > 0 ? `
          <div class="memory-detail-card">
            <span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundSuggestedReplyChecklist", {}, "回复建议检查清单"))}</span>
            <pre class="memory-detail-pre">${escapeHtml(item.suggestedReplyChecklist.join("\n"))}</pre>
          </div>
        ` : ""}
        ${isEmailInboundAudit && item?.suggestedReplyDraft ? `
          <div class="memory-detail-card">
            <span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditInboundSuggestedReplyDraft", {}, "建议回复草稿"))}</span>
            <pre class="memory-detail-pre">${escapeHtml(item.suggestedReplyDraft)}</pre>
          </div>
        ` : ""}
        ${item?.error ? `
          <div class="memory-detail-card">
            <span class="memory-detail-label">${escapeHtml(t("memory.outboundAuditError", {}, "错误信息"))}</span>
            <pre class="memory-detail-pre">${escapeHtml(item.error)}</pre>
          </div>
        ` : ""}
      </div>
    `;
  }

  function renderCandidateDetailPanel(candidate) {
    if (!candidate) return "";
    const snapshot = candidate.sourceTaskSnapshot || {};
    const memoryLinks = Array.isArray(snapshot.memoryLinks) ? snapshot.memoryLinks : [];
    const artifactPaths = Array.isArray(snapshot.artifactPaths) ? snapshot.artifactPaths : [];
    const toolCalls = Array.isArray(snapshot.toolCalls) ? snapshot.toolCalls : [];
    const learningReviewInput = candidate.learningReviewInput && typeof candidate.learningReviewInput === "object"
      ? candidate.learningReviewInput
      : null;
    const skillFreshness = candidate.skillFreshness && typeof candidate.skillFreshness === "object"
      ? candidate.skillFreshness
      : null;
    const candidateSourceView = candidate.sourceView || null;
    const candidateSourceExplanation = candidateSourceView ? formatResidentSourceExplainability(candidateSourceView) : "-";
    const candidateSourceConflict = candidateSourceView ? formatResidentSourceConflictSummary(candidateSourceView) : "-";
    const contextTargets = extractCandidateContextTargets(candidate);

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
        <div class="memory-detail-card">
          <div class="goal-summary-header">
            <div>
              <div class="goal-summary-title">${escapeHtml(t("memory.contextSummaryTitle", {}, "上下文链"))}</div>
              <div class="goal-summary-text">${escapeHtml(t("memory.contextSummaryCandidateText", {}, "把来源任务、源记忆与产物入口压缩到一处，方便继续追溯。"))}</div>
            </div>
          </div>
          <div class="memory-detail-badges">
            ${contextTargets.sourceConversationId ? `<span class="memory-badge">${escapeHtml(t("memory.contextConversation", {}, "会话"))} ${escapeHtml(summarizeSourcePath(contextTargets.sourceConversationId))}</span>` : ""}
            <span class="memory-badge">${escapeHtml(t("memory.contextLinkedMemories", {}, "关联记忆"))} ${escapeHtml(String(contextTargets.memoryCount))}</span>
            <span class="memory-badge">${escapeHtml(t("memory.contextArtifacts", {}, "产物"))} ${escapeHtml(String(contextTargets.artifactCount))}</span>
          </div>
          <div class="goal-detail-actions">
            ${contextTargets.sourceTaskId ? `<button class="button goal-inline-action-secondary" data-open-task-id="${escapeHtml(contextTargets.sourceTaskId)}">${escapeHtml(t("memory.contextOpenSourceTask", {}, "打开来源任务"))}</button>` : ""}
            ${contextTargets.firstMemoryId ? `<button class="button goal-inline-action-secondary" data-open-memory-id="${escapeHtml(contextTargets.firstMemoryId)}">${escapeHtml(t("memory.contextOpenFirstMemory", {}, "打开关联记忆"))}</button>` : ""}
            ${contextTargets.firstArtifactPath ? `<button class="button goal-inline-action-secondary" data-open-source="${escapeHtml(contextTargets.firstArtifactPath)}">${escapeHtml(t("memory.contextOpenFirstArtifact", {}, "打开相关产物"))}</button>` : ""}
            ${contextTargets.publishedPath ? `<button class="button goal-inline-action-secondary" data-open-source="${escapeHtml(contextTargets.publishedPath)}">${escapeHtml(t("memory.contextOpenPublishedArtifact", {}, "打开发布产物"))}</button>` : ""}
          </div>
        </div>
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
        ${skillFreshness ? renderSkillFreshnessDetail(skillFreshness, { escapeHtml, t, maxSignals: 3 }) : ""}
        ${learningReviewInput ? `
          <div class="memory-detail-card">
            <span class="memory-detail-label">Learning / Review Input</span>
            <div class="memory-detail-badges">
              <span class="memory-badge">${escapeHtml(learningReviewInput.summary?.headline || "-")}</span>
            </div>
            ${(Array.isArray(learningReviewInput.summaryLines) ? learningReviewInput.summaryLines : []).slice(0, 4).map((line) => `
              <div class="memory-detail-text">${escapeHtml(line)}</div>
            `).join("")}
            ${(Array.isArray(learningReviewInput.nudges) ? learningReviewInput.nudges : []).slice(0, 4).map((line) => `
              <div class="memory-detail-text">Nudge: ${escapeHtml(line)}</div>
            `).join("")}
          </div>
        ` : ""}
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
    const claimState = getMemoryShareClaimState(item);
    const claimOwner = claimState.claimOwner;
    const claimTimedOut = claimState.claimTimedOut;
    const targetAgentId = getMemoryShareTargetAgentId(item);
    const targetDisplayName = item.targetDisplayName || targetAgentId;
    const activeAgentId = getActiveAgentId();
    const canClaimNow = !claimOwner || claimTimedOut;
    const canReviewNow = shareActionMode === "pending"
      && (claimState.actionableByReviewer || !claimOwner || claimOwner === activeAgentId || claimTimedOut);
    const shareActionButtons = [];
    if (shareActionMode === "request" && sourceView.scope !== "shared") {
      shareActionButtons.push(
        `<button class="memory-usage-action-btn" data-memory-share-promote="${escapeHtml(item.id)}">${escapeHtml(t("memory.sharePromoteAction", {}, "Submit Shared Review"))}</button>`,
      );
    }
    if (shareActionMode === "pending") {
      if (claimOwner === activeAgentId && !claimTimedOut) {
        shareActionButtons.push(
          `<button class="memory-usage-action-btn" data-memory-share-claim="release" data-memory-share-claim-scope="${escapeHtml(shareActionScope)}">${escapeHtml(t("memory.shareReleaseAction", {}, "Release"))}</button>`,
        );
      }
      if (canClaimNow) {
        shareActionButtons.push(
          `<button class="memory-usage-action-btn" data-memory-share-claim="claim" data-memory-share-claim-scope="${escapeHtml(shareActionScope)}">${escapeHtml(t("memory.shareClaimAction", {}, "Claim"))}</button>`,
        );
      }
      if (canReviewNow) {
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
      }
    }
    if (shareActionMode === "approved") {
      shareActionButtons.push(
        `<button class="memory-usage-action-btn" data-memory-share-decision="revoked">${escapeHtml(t("memory.shareReviewRevokeAction", {}, "Revoke Shared"))}</button>`,
      );
    }
    const claimStatusText = claimOwner
      ? claimTimedOut
        ? t(
          "memory.detailSharedClaimTimedOut",
          { owner: claimOwner, time: formatDateTime(claimState.claimExpiresAt) },
          `${claimOwner} (timed out ${formatDateTime(claimState.claimExpiresAt)})`,
        )
        : t("memory.detailSharedClaimActive", { owner: claimOwner }, `${claimOwner} (active)`)
      : t("memory.detailSharedClaimNone", {}, "Unclaimed");
    const reviewerStateText = claimState.blockedByOtherReviewer
      ? t("memory.detailSharedReviewerBlocked", { owner: claimOwner }, `Blocked by ${claimOwner} until release or timeout.`)
      : claimTimedOut
        ? t("memory.detailSharedReviewerTimedOut", {}, "Previous claim timed out. You can claim again or review directly.")
        : claimOwner === activeAgentId
          ? t("memory.detailSharedReviewerMine", {}, "Currently claimed by you. You can review or release it.")
          : canReviewNow
            ? t("memory.detailSharedReviewerActionable", {}, "This review item is actionable for the current reviewer.")
            : t("memory.detailSharedReviewerIdle", {}, "This review item is waiting for a reviewer.");
    const canOpenSharedReviewContext = normalizeMemorySharePromotionStatus(item) && normalizeMemorySharePromotionStatus(item) !== "none";
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

        <div class="memory-detail-card">
          <div class="goal-summary-header">
            <div>
              <div class="goal-summary-title">${escapeHtml(t("memory.contextSummaryTitle", {}, "上下文链"))}</div>
              <div class="goal-summary-text">${escapeHtml(t("memory.contextSummaryMemoryText", {}, "把来源范围、shared 治理状态与继续下钻入口收拢到一处。"))}</div>
            </div>
          </div>
          <div class="memory-detail-badges">
            <span class="memory-badge ${getVisibilityBadgeClass(visibility)}">${escapeHtml(visibility)}</span>
            ${renderSourceViewBadge(sourceView)}
            <span class="memory-badge">${escapeHtml(shareStatus)}</span>
            ${targetDisplayName ? `<span class="memory-badge">${escapeHtml(targetDisplayName)}</span>` : ""}
            ${claimOwner ? `<span class="memory-badge">${escapeHtml(claimTimedOut ? t("memory.contextClaimTimedOut", {}, "claim 超时") : t("memory.contextClaimActive", {}, "claim 生效中"))}</span>` : ""}
          </div>
          <div class="memory-list-item-meta">
            <span>${escapeHtml(sourceExplanation)}</span>
          </div>
          <div class="goal-detail-actions">
            ${item.sourcePath ? `<button class="button goal-inline-action-secondary" data-open-source="${escapeHtml(item.sourcePath)}" data-open-line="${typeof item.startLine === "number" ? item.startLine : ""}">${escapeHtml(t("memory.contextOpenSource", {}, "打开来源文件"))}</button>` : ""}
            ${canOpenSharedReviewContext ? `<button class="button goal-inline-action-secondary" data-memory-open-shared-review-context="1">${escapeHtml(t("memory.contextOpenSharedReview", {}, "打开 Shared Review"))}</button>` : ""}
          </div>
        </div>

        <div class="memory-detail-grid">
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.detailSourcePath", {}, "Source Path"))}</span><div class="memory-detail-text">${item.sourcePath ? `<button class="memory-path-link" data-open-source="${escapeHtml(item.sourcePath)}" data-open-line="${typeof item.startLine === "number" ? item.startLine : ""}">${escapeHtml(item.sourcePath)}</button>` : "-"}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.detailLines", {}, "Lines"))}</span><div class="memory-detail-text">${escapeHtml(formatLineRange(item.startLine, item.endLine))}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.detailVisibility", {}, "Visibility"))}</span><div class="memory-detail-text">${escapeHtml(visibility)}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.sharedReviewTargetAgent", {}, "Target Agent"))}</span><div class="memory-detail-text">${escapeHtml(targetDisplayName)}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">来源视角</span><div class="memory-detail-text">${escapeHtml(formatResidentSourceSummary(sourceView))}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">来源解释</span><div class="memory-detail-text">${escapeHtml(sourceExplanation)}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">冲突说明</span><div class="memory-detail-text">${escapeHtml(sourceConflictSummary)}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">来源审计</span><div class="memory-detail-text">${escapeHtml(sourceAuditSummary)}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.detailSharedStatus", {}, "Shared Status"))}</span><div class="memory-detail-text">${escapeHtml(shareStatus)}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.detailSharedGovernance", {}, "Shared Governance"))}</span><div class="memory-detail-text">${escapeHtml(governanceSummary)}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.detailSharedClaim", {}, "Shared Claim"))}</span><div class="memory-detail-text">${escapeHtml(claimStatusText)}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.detailSharedReviewerState", {}, "Reviewer State"))}</span><div class="memory-detail-text">${escapeHtml(reviewerStateText)}</div></div>
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
    applyAgentViewState,
    captureAgentViewState,
    loadExternalOutboundAuditViewer,
    loadMemoryChunkViewer,
    loadMemoryViewer,
    loadMemoryViewerStats,
    loadSharedReviewQueue,
    loadTaskUsageOverview,
    loadTaskViewer,
    renderCandidateDetailPanel,
    renderCandidateOnlyDetail,
    renderExternalOutboundAuditDetail,
    renderExternalOutboundAuditList,
    renderMemoryList,
    renderSharedReviewList,
    renderMemoryDetail,
    renderMemoryViewerStats,
    renderTaskList,
    syncSharedReviewFilterUi,
    syncMemoryViewerHeaderTitle,
    switchOutboundAuditFocus,
    switchMemoryViewerTab,
    syncMemoryViewerUi,
  };
}
