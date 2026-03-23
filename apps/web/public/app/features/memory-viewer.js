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

  function syncMemoryViewerUi() {
    const memoryViewerState = getMemoryViewerState();
    const isTasks = memoryViewerState.tab === "tasks";
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
      renderMemoryViewerListEmpty("未连接到服务器。");
      renderMemoryViewerDetailEmpty("连接完成后可查看任务与记忆。");
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
    renderMemoryViewerListEmpty("Tasks 加载中…");
    renderMemoryViewerDetailEmpty("正在加载 task 详情…");

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
      renderMemoryViewerListEmpty("Task 列表加载失败。");
      renderMemoryViewerDetailEmpty(res?.error?.message || "无法读取 task 数据。");
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
      renderMemoryViewerDetailEmpty("没有匹配的 task。");
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
    renderMemoryViewerListEmpty("Memories 加载中…");
    renderMemoryViewerDetailEmpty("正在加载 memory 详情…");

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
      renderMemoryViewerListEmpty("Memory 列表加载失败。");
      renderMemoryViewerDetailEmpty(res?.error?.message || "无法读取 memory 数据。");
      return;
    }

    const items = Array.isArray(res.payload?.items) ? res.payload.items : [];
    memoryViewerState.items = items;
    renderMemoryViewerStats(memoryViewerState.stats);

    if (!items.length) {
      memoryViewerState.selectedId = null;
      renderMemoryList(items);
      renderMemoryViewerDetailEmpty("没有匹配的 memory。");
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
        <div class="memory-stat-card"><span class="memory-stat-label">记忆文件</span><strong class="memory-stat-value">--</strong></div>
        <div class="memory-stat-card"><span class="memory-stat-label">记忆块</span><strong class="memory-stat-value">--</strong></div>
        <div class="memory-stat-card"><span class="memory-stat-label">向量索引</span><strong class="memory-stat-value">--</strong></div>
        <div class="memory-stat-card"><span class="memory-stat-label">摘要完成</span><strong class="memory-stat-value">--</strong></div>
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
        <div class="memory-stat-card"><span class="memory-stat-label">当前结果</span><strong class="memory-stat-value">${formatCount(items.length)}</strong></div>
        <div class="memory-stat-card"><span class="memory-stat-label">筛选分类</span><strong class="memory-stat-value">${escapeHtml(activeCategoryLabel)}</strong></div>
        <div class="memory-stat-card"><span class="memory-stat-label">当前已分类</span><strong class="memory-stat-value">${formatCount(currentCategorized)}</strong></div>
        <div class="memory-stat-card"><span class="memory-stat-label">当前未分类</span><strong class="memory-stat-value">${formatCount(currentUncategorized)}</strong></div>
        <div class="memory-stat-card"><span class="memory-stat-label">全库已分类</span><strong class="memory-stat-value">${formatCount(stats.categorized)}</strong></div>
        <div class="memory-stat-card"><span class="memory-stat-label">全库未分类</span><strong class="memory-stat-value">${formatCount(stats.uncategorized)}</strong></div>
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
      <div class="memory-stat-card"><span class="memory-stat-label">当前 Task 结果</span><strong class="memory-stat-value">${formatCount(Array.isArray(memoryViewerState.items) ? memoryViewerState.items.length : 0)}</strong></div>
      <div class="memory-stat-card"><span class="memory-stat-label">当前已用 Method</span><strong class="memory-stat-value">${formatCount(usedMethods.length)}</strong></div>
      <div class="memory-stat-card"><span class="memory-stat-label">当前已用 Skill</span><strong class="memory-stat-value">${formatCount(usedSkills.length)}</strong></div>
      <div class="memory-stat-card"><span class="memory-stat-label">最近采用时间</span><strong class="memory-stat-value memory-stat-value-compact">${escapeHtml(formatDateTime(lastUsedAt))}</strong></div>
      ${activeGoalId ? `<div class="memory-stat-card"><span class="memory-stat-label">Goal Filter</span><strong class="memory-stat-value memory-stat-value-compact">${escapeHtml(activeGoalLabel)}</strong><div class="memory-stat-caption">${escapeHtml(activeGoalId)}</div></div>` : ""}
      ${renderTaskUsageOverviewCard()}
    `;
    bindStatsAuditJumpLinks();
  }

  function renderTaskList(items) {
    if (!memoryViewerListEl) return;
    if (!items.length) {
      renderMemoryViewerListEmpty("没有可展示的 task。");
      return;
    }

    const memoryViewerState = getMemoryViewerState();
    memoryViewerListEl.innerHTML = items.map((item) => {
      const title = item.title || item.objective || item.summary || item.conversationId || item.id;
      const snippet = item.summary || item.outcome || item.objective || "暂无摘要";
      const isActive = item.id === memoryViewerState.selectedId;
      const goalId = getTaskGoalId(item);
      return `
        <div class="memory-list-item ${isActive ? "active" : ""}" data-task-id="${escapeHtml(item.id)}">
          <div class="memory-list-item-title">${escapeHtml(title)}</div>
          <div class="memory-list-item-meta">
            <span>${escapeHtml(item.status || "unknown")}</span>
            <span>${escapeHtml(item.source || "unknown")}</span>
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
      renderMemoryViewerListEmpty("没有可展示的 memory。");
      return;
    }

    const memoryViewerState = getMemoryViewerState();
    memoryViewerListEl.innerHTML = items.map((item) => {
      const title = summarizeSourcePath(item.sourcePath);
      const summary = item.summary || item.snippet || "暂无摘要";
      const isActive = item.id === memoryViewerState.selectedId;
      const visibility = normalizeMemoryVisibility(item.visibility);
      const category = formatMemoryCategory(item.category);
      return `
        <div class="memory-list-item ${isActive ? "active" : ""}" data-memory-id="${escapeHtml(item.id)}">
          <div class="memory-list-item-title">${escapeHtml(title)}</div>
          <div class="memory-list-item-meta">
            <span>${escapeHtml(item.memoryType || "other")}</span>
            <span>${escapeHtml(item.sourceType || "unknown")}</span>
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
          <span class="memory-detail-label">Candidate 详情面板</span>
          <div class="memory-detail-badges">
            <span class="memory-badge">${escapeHtml(candidate.type || "unknown")}</span>
            <span class="memory-badge">${escapeHtml(candidate.status || "unknown")}</span>
            <button class="memory-usage-action-btn" data-close-candidate-panel="1">关闭</button>
          </div>
        </div>
        <div class="memory-detail-text"><strong>${escapeHtml(candidate.title || candidate.id || "未命名候选")}</strong></div>
        <div class="memory-detail-grid">
          <div class="memory-detail-card"><span class="memory-detail-label">Candidate ID</span><div class="memory-detail-text">${escapeHtml(candidate.id || "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">Source Task</span><div class="memory-detail-text">${candidate.taskId ? `<button class="memory-path-link" data-open-task-id="${escapeHtml(candidate.taskId)}">${escapeHtml(candidate.taskId)}</button>` : "-"}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">Slug</span><div class="memory-detail-text">${escapeHtml(candidate.slug || "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">Published Path</span><div class="memory-detail-text">${candidate.publishedPath ? `<button class="memory-path-link" data-open-source="${escapeHtml(candidate.publishedPath)}">${escapeHtml(candidate.publishedPath)}</button>` : "-"}</div></div>
        </div>
        ${candidate.summary ? `<div class="memory-detail-text">${escapeHtml(candidate.summary)}</div>` : ""}
        <div class="memory-detail-card">
          <span class="memory-detail-label">来源快照</span>
          <div class="memory-detail-grid">
            <div class="memory-detail-card"><span class="memory-detail-label">Conversation</span><div class="memory-detail-text">${escapeHtml(snapshot.conversationId || "-")}</div></div>
            <div class="memory-detail-card"><span class="memory-detail-label">状态</span><div class="memory-detail-text">${escapeHtml(snapshot.status || "-")}</div></div>
            <div class="memory-detail-card"><span class="memory-detail-label">Source</span><div class="memory-detail-text">${escapeHtml(snapshot.source || "-")}</div></div>
            <div class="memory-detail-card"><span class="memory-detail-label">开始</span><div class="memory-detail-text">${escapeHtml(formatDateTime(snapshot.startedAt))}</div></div>
          </div>
          ${snapshot.objective ? `<div class="memory-detail-text"><strong>Objective:</strong> ${escapeHtml(snapshot.objective)}</div>` : ""}
          ${snapshot.summary ? `<div class="memory-detail-text"><strong>Summary:</strong> ${escapeHtml(snapshot.summary)}</div>` : ""}
        </div>
        <div class="memory-detail-card">
          <span class="memory-detail-label">来源记忆 (${memoryLinks.length})</span>
          ${memoryLinks.length ? `
            <div class="memory-inline-list">
              ${memoryLinks.map((link) => `
                <div class="memory-inline-item">
                  <div class="memory-inline-item-head">
                    <span class="memory-badge">${escapeHtml(link.relation || "used")}</span>
                    ${link.memoryType ? `<span class="memory-badge">${escapeHtml(link.memoryType)}</span>` : ""}
                    <button class="memory-path-link" data-open-memory-id="${escapeHtml(link.chunkId || "")}">${escapeHtml(link.chunkId || "open memory")}</button>
                  </div>
                  ${link.sourcePath ? `<button class="memory-path-link" data-open-source="${escapeHtml(link.sourcePath)}">${escapeHtml(link.sourcePath)}</button>` : ""}
                  ${link.snippet ? `<div class="memory-detail-text">${escapeHtml(link.snippet)}</div>` : ""}
                </div>
              `).join("")}
            </div>
          ` : `<div class="memory-detail-text">无来源记忆链接。</div>`}
        </div>
        <div class="memory-detail-card">
          <span class="memory-detail-label">来源产物 (${artifactPaths.length})</span>
          ${artifactPaths.length ? `
            <div class="memory-inline-list">
              ${artifactPaths.map((artifactPath) => `
                <div class="memory-inline-item">
                  <button class="memory-path-link" data-open-source="${escapeHtml(artifactPath)}">${escapeHtml(artifactPath)}</button>
                </div>
              `).join("")}
            </div>
          ` : `<div class="memory-detail-text">无来源产物。</div>`}
        </div>
        <div class="memory-detail-card">
          <span class="memory-detail-label">Tool Calls (${toolCalls.length})</span>
          ${toolCalls.length ? `
            <div class="memory-inline-list">
              ${toolCalls.map((call) => `
                <div class="memory-inline-item">
                  <div class="memory-inline-item-head">
                    <span class="memory-badge">${escapeHtml(call.toolName || "unknown")}</span>
                    <span class="memory-badge">${call.success ? "success" : "failed"}</span>
                    <span class="memory-badge">${escapeHtml(formatDuration(call.durationMs))}</span>
                  </div>
                  ${call.note ? `<div class="memory-detail-text">${escapeHtml(call.note)}</div>` : ""}
                </div>
              `).join("")}
            </div>
          ` : `<div class="memory-detail-text">无工具调用记录。</div>`}
        </div>
        <div class="memory-detail-card">
          <span class="memory-detail-label">Candidate Content</span>
          <pre class="memory-detail-pre">${escapeHtml(candidate.content || "暂无内容")}</pre>
        </div>
      </div>
    `;
  }

  function renderCandidateOnlyDetail(candidate) {
    if (!memoryViewerDetailEl) return;
    if (!candidate) {
      renderMemoryViewerDetailEmpty("Candidate 不存在。");
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
      renderMemoryViewerDetailEmpty("Memory 不存在。");
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
            <span class="memory-badge">${escapeHtml(item.memoryType || "other")}</span>
            <span class="memory-badge">${escapeHtml(item.sourceType || "unknown")}</span>
            <span class="memory-badge ${getVisibilityBadgeClass(visibility)}">${escapeHtml(visibility)}</span>
            <span class="memory-badge">${escapeHtml(category)}</span>
            <span class="memory-badge">score ${formatScore(item.score)}</span>
          </div>
        </div>

        <div class="memory-detail-grid">
          <div class="memory-detail-card"><span class="memory-detail-label">Source Path</span><div class="memory-detail-text">${item.sourcePath ? `<button class="memory-path-link" data-open-source="${escapeHtml(item.sourcePath)}" data-open-line="${typeof item.startLine === "number" ? item.startLine : ""}">${escapeHtml(item.sourcePath)}</button>` : "-"}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">Lines</span><div class="memory-detail-text">${escapeHtml(formatLineRange(item.startLine, item.endLine))}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">Visibility</span><div class="memory-detail-text">${escapeHtml(visibility)}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">分类</span><div class="memory-detail-text">${escapeHtml(category)}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">Summary</span><div class="memory-detail-text">${escapeHtml(item.summary || "暂无摘要")}</div></div>
        </div>

        <div class="memory-detail-card">
          <span class="memory-detail-label">Snippet</span>
          <div class="memory-detail-text">${escapeHtml(item.snippet || "暂无内容")}</div>
        </div>

        <div class="memory-detail-card">
          <span class="memory-detail-label">Content</span>
          <pre class="memory-detail-pre">${escapeHtml(item.content || item.snippet || "暂无内容")}</pre>
        </div>

        ${item.metadata ? `
          <div class="memory-detail-card">
            <span class="memory-detail-label">Metadata</span>
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
