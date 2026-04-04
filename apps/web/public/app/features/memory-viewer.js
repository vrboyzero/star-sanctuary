export function createMemoryViewerFeature({
  refs,
  isConnected,
  sendReq,
  makeId,
  getMemoryViewerState,
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
  t = (_key, _params, fallback) => fallback ?? "",
}) {
  const {
    memoryViewerSection,
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
    memoryChunkCategoryFilterEl,
  } = refs;

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

    if (!isConnected()) {
      renderMemoryViewerStats(null);
      renderMemoryViewerListEmpty(t("memory.disconnectedList", {}, "Not connected to the server."));
      renderMemoryViewerDetailEmpty(t("memory.disconnectedDetail", {}, "Tasks and memories will be available after connection is ready."));
      return;
    }

    const memoryViewerState = getMemoryViewerState();
    if (memoryViewerState.tab === "tasks") {
      await Promise.all([
        loadMemoryViewerStats(),
        loadTaskUsageOverview(),
      ]);
      await loadTaskViewer(forceSelectFirst);
    } else {
      memoryViewerState.selectedTask = null;
      memoryViewerState.selectedCandidate = null;
      await loadMemoryViewerStats();
      await loadMemoryChunkViewer(forceSelectFirst);
    }
  }

  async function loadMemoryViewerStats() {
    const res = await sendReq({ type: "req", id: makeId(), method: "memory.stats" });
    const memoryViewerState = getMemoryViewerState();
    if (!res || !res.ok) {
      renderMemoryViewerStats(null);
      return;
    }
    memoryViewerState.stats = res.payload?.status ?? null;
    renderMemoryViewerStats(memoryViewerState.stats);
  }

  async function loadTaskUsageOverview() {
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
        params: { limit: 6, filter: { assetType: "method" } },
      }),
      sendReq({
        type: "req",
        id: makeId(),
        method: "experience.usage.stats",
        params: { limit: 6, filter: { assetType: "skill" } },
      }),
    ]);

    if (memoryViewerState.tab !== "tasks" || memoryViewerState.usageOverviewSeq !== seq) return;

    memoryViewerState.usageOverview = {
      loading: false,
      methods: methodsRes?.ok && Array.isArray(methodsRes.payload?.items) ? methodsRes.payload.items : [],
      skills: skillsRes?.ok && Array.isArray(skillsRes.payload?.items) ? skillsRes.payload.items : [],
    };
    renderMemoryViewerStats(memoryViewerState.stats);
  }

  async function loadTaskViewer(forceSelectFirst = false) {
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

    const res = await sendReq({ type: "req", id: makeId(), method: "memory.task.list", params });
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
    await loadTaskDetail(memoryViewerState.selectedId);
  }

  async function loadMemoryChunkViewer(forceSelectFirst = false) {
    renderMemoryViewerListEmpty(t("memory.memoriesLoading", {}, "Loading memories..."));
    renderMemoryViewerDetailEmpty(t("memory.memoryDetailLoading", {}, "Loading memory details..."));

    const query = memorySearchInputEl ? memorySearchInputEl.value.trim() : "";
    const filter = {};
    if (memoryChunkTypeFilterEl?.value) filter.memoryType = memoryChunkTypeFilterEl.value;
    if (memoryChunkVisibilityFilterEl?.value) filter.scope = memoryChunkVisibilityFilterEl.value;
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
    const res = await sendReq({ type: "req", id: makeId(), method, params });
    const memoryViewerState = getMemoryViewerState();
    if (!res || !res.ok) {
      renderMemoryViewerListEmpty(t("memory.memoryListLoadFailed", {}, "Failed to load memory list."));
      renderMemoryViewerDetailEmpty(res?.error?.message || t("memory.memoryReadFailed", {}, "Failed to read memory data."));
      return;
    }

    const items = Array.isArray(res.payload?.items) ? res.payload.items : [];
    memoryViewerState.items = items;
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
    await loadMemoryDetail(memoryViewerState.selectedId);
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

      memoryViewerStatsEl.innerHTML = `
        <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.statCurrentResults", {}, "Current Results"))}</span><strong class="memory-stat-value">${formatCount(items.length)}</strong></div>
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

    memoryViewerStatsEl.innerHTML = `
      <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("memory.statCurrentTaskResults", {}, "Current Task Results"))}</span><strong class="memory-stat-value">${formatCount(Array.isArray(memoryViewerState.items) ? memoryViewerState.items.length : 0)}</strong></div>
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
      return `
        <div class="memory-list-item ${isActive ? "active" : ""}" data-memory-id="${escapeHtml(item.id)}">
          <div class="memory-list-item-title">${escapeHtml(title)}</div>
          <div class="memory-list-item-meta">
            <span>${escapeHtml(formatMemoryTypeLabel(item.memoryType))}</span>
            <span>${escapeHtml(formatMemorySourceTypeLabel(item.sourceType))}</span>
            <span class="memory-badge ${getVisibilityBadgeClass(visibility)}">${escapeHtml(visibility)}</span>
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

    return `
      <div class="memory-detail-card">
        <div class="memory-inline-item-head">
          <span class="memory-detail-label">${escapeHtml(t("memory.candidatePanelTitle", {}, "Candidate Detail Panel"))}</span>
          <div class="memory-detail-badges">
            <span class="memory-badge">${escapeHtml(candidate.type || "未知类型")}</span>
            <span class="memory-badge">${escapeHtml(formatTaskStatusLabel(candidate.status))}</span>
            <button class="memory-usage-action-btn" data-close-candidate-panel="1">${escapeHtml(t("memory.close", {}, "Close"))}</button>
          </div>
        </div>
        <div class="memory-detail-text"><strong>${escapeHtml(candidate.title || candidate.id || t("memory.candidateUntitled", {}, "Untitled Candidate"))}</strong></div>
        <div class="memory-detail-grid">
          <div class="memory-detail-card"><span class="memory-detail-label">候选 ID</span><div class="memory-detail-text">${escapeHtml(candidate.id || "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">来源任务</span><div class="memory-detail-text">${candidate.taskId ? `<button class="memory-path-link" data-open-task-id="${escapeHtml(candidate.taskId)}">${escapeHtml(candidate.taskId)}</button>` : "-"}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">标识</span><div class="memory-detail-text">${escapeHtml(candidate.slug || "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">发布路径</span><div class="memory-detail-text">${candidate.publishedPath ? `<button class="memory-path-link" data-open-source="${escapeHtml(candidate.publishedPath)}">${escapeHtml(candidate.publishedPath)}</button>` : "-"}</div></div>
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
                    <button class="memory-path-link" data-open-memory-id="${escapeHtml(link.chunkId || "")}">${escapeHtml(link.chunkId || "打开记忆")}</button>
                  </div>
                  ${link.sourcePath ? `<button class="memory-path-link" data-open-source="${escapeHtml(link.sourcePath)}">${escapeHtml(link.sourcePath)}</button>` : ""}
                  ${link.snippet ? `<div class="memory-detail-text">${escapeHtml(link.snippet)}</div>` : ""}
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
            <span class="memory-badge">${escapeHtml(category)}</span>
            <span class="memory-badge">分数 ${formatScore(item.score)}</span>
          </div>
        </div>

        <div class="memory-detail-grid">
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.detailSourcePath", {}, "Source Path"))}</span><div class="memory-detail-text">${item.sourcePath ? `<button class="memory-path-link" data-open-source="${escapeHtml(item.sourcePath)}" data-open-line="${typeof item.startLine === "number" ? item.startLine : ""}">${escapeHtml(item.sourcePath)}</button>` : "-"}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.detailLines", {}, "Lines"))}</span><div class="memory-detail-text">${escapeHtml(formatLineRange(item.startLine, item.endLine))}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">${escapeHtml(t("memory.detailVisibility", {}, "Visibility"))}</span><div class="memory-detail-text">${escapeHtml(visibility)}</div></div>
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
    switchMemoryViewerTab,
    syncMemoryViewerUi,
  };
}
