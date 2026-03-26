export function createGoalsReadonlyPanelsFeature({
  refs,
  escapeHtml,
  formatDateTime,
  normalizeGoalBoardId,
  goalRuntimeFilePath,
  onBindHandoffPanelActions,
  t = (_key, _params, fallback) => fallback ?? "",
}) {
  const { goalsDetailEl } = refs;

  function renderGoalCanvasPanelLoading() {
    const panel = goalsDetailEl?.querySelector("#goalCanvasPanel");
    if (!panel) return;
    panel.innerHTML = `<div class="memory-viewer-empty">${escapeHtml(t("goals.canvasPanelLoading", {}, "Loading board-ref.json ..."))}</div>`;
  }

  function renderGoalCanvasPanel(goal, payload) {
    const panel = goalsDetailEl?.querySelector("#goalCanvasPanel");
    if (!panel || !goal) return;

    const registryBoardId = normalizeGoalBoardId(goal.boardId);
    const runtimeBoardId = normalizeGoalBoardId(payload?.runtimeBoardId);
    const effectiveBoardId = runtimeBoardId || registryBoardId;
    const hasMismatch = Boolean(runtimeBoardId && registryBoardId && runtimeBoardId !== registryBoardId);
    const linkedAt = payload?.linkedAt || payload?.updatedAt || "";
    const boardRefPath = goalRuntimeFilePath(goal, "board-ref.json");
    const source = runtimeBoardId ? "runtime board-ref" : registryBoardId ? "goal registry" : "-";

    let statusLabel = t("goals.canvasStatusUnbound", {}, "Unbound");
    let statusClass = "memory-badge";
    let hint = t("goals.canvasHintUnbound", {}, "No Canvas main-board binding is detected yet. You can open the board list or create one first.");

    if (effectiveBoardId && hasMismatch) {
      statusLabel = t("goals.canvasStatusMismatch", {}, "Binding Mismatch");
      statusClass = "memory-badge";
      hint = t("goals.canvasHintMismatch", { runtimeBoardId, registryBoardId }, `Runtime board-ref (${runtimeBoardId}) differs from registry default board (${registryBoardId}). The runtime binding is used first.`);
    } else if (effectiveBoardId && runtimeBoardId) {
      statusLabel = t("goals.canvasStatusBound", {}, "Bound");
      statusClass = "memory-badge memory-badge-shared";
      hint = t("goals.canvasHintBoundRuntime", {}, "A runtime Canvas binding is detected. You can jump directly to the linked board from long task details.");
    } else if (effectiveBoardId) {
      statusLabel = t("goals.canvasStatusPending", {}, "Pending");
      statusClass = "memory-badge";
      hint = t("goals.canvasHintRegistryOnly", {}, "Only the default board declared in the registry is detected. If opening fails, open the board list to create or fix the binding first.");
    } else if (payload?.readError) {
      hint = t("goals.canvasHintReadError", {}, "Unable to read board-ref.json. If you use a custom path, confirm it has been added to the workspace roots.");
    }

    panel.innerHTML = `
      <div class="goal-summary-header">
        <div>
          <div class="goal-summary-title">${escapeHtml(t("goals.canvasPanelTitle", {}, "Canvas Link"))}</div>
          <div class="goal-summary-text">${escapeHtml(hint)}</div>
        </div>
        <span class="${statusClass}">${escapeHtml(statusLabel)}</span>
      </div>
      <div class="goal-summary-grid">
        <div class="goal-summary-item">
          <span class="goal-summary-label">${escapeHtml(t("goals.canvasCurrentBoard", {}, "Current Board"))}</span>
          <strong class="goal-summary-value">${escapeHtml(effectiveBoardId || "-")}</strong>
        </div>
        <div class="goal-summary-item">
          <span class="goal-summary-label">${escapeHtml(t("goals.canvasSource", {}, "Source"))}</span>
          <strong class="goal-summary-value">${escapeHtml(source)}</strong>
        </div>
        <div class="goal-summary-item">
          <span class="goal-summary-label">${escapeHtml(t("goals.canvasRuntimeBoardRef", {}, "Runtime board-ref"))}</span>
          <strong class="goal-summary-value">${escapeHtml(runtimeBoardId || "-")}</strong>
        </div>
        <div class="goal-summary-item">
          <span class="goal-summary-label">${escapeHtml(t("goals.canvasRegistryBoardId", {}, "Registry boardId"))}</span>
          <strong class="goal-summary-value">${escapeHtml(registryBoardId || "-")}</strong>
        </div>
        <div class="goal-summary-item">
          <span class="goal-summary-label">${escapeHtml(t("goals.canvasLinkedAt", {}, "Linked At"))}</span>
          <strong class="goal-summary-value">${escapeHtml(formatDateTime(linkedAt))}</strong>
        </div>
        <div class="goal-summary-item">
          <span class="goal-summary-label">${escapeHtml(t("goals.canvasBoardRefPath", {}, "board-ref Path"))}</span>
          <strong class="goal-summary-value">${escapeHtml(boardRefPath || "-")}</strong>
        </div>
      </div>
      <div class="goal-detail-actions">
        <button class="button" data-open-goal-board="${escapeHtml(effectiveBoardId)}" ${effectiveBoardId ? "" : "disabled"}>${escapeHtml(t("goals.canvasOpenLinkedBoard", {}, "Open Linked Canvas"))}</button>
        <button class="button goal-inline-action-secondary" data-open-goal-board-list="${escapeHtml(goal.id)}">${escapeHtml(t("goals.canvasOpenBoardList", {}, "Open Canvas List"))}</button>
        <button class="button goal-inline-action-secondary" data-open-source="${escapeHtml(boardRefPath)}">${escapeHtml(t("goals.canvasOpenBoardRef", {}, "Open board-ref.json"))}</button>
      </div>
    `;
  }

  function renderGoalProgressPanelLoading() {
    const panel = goalsDetailEl?.querySelector("#goalProgressPanel");
    if (!panel) return;
    panel.innerHTML = '<div class="memory-viewer-empty">正在读取 progress.md …</div>';
  }

  function renderGoalProgressPanel(entries) {
    const panel = goalsDetailEl?.querySelector("#goalProgressPanel");
    if (!panel) return;
    const recentEntries = Array.isArray(entries) ? entries.slice().reverse().slice(0, 18) : [];
    if (!recentEntries.length) {
      panel.innerHTML = '<div class="memory-viewer-empty">progress.md 中还没有时间线记录。</div>';
      return;
    }

    panel.innerHTML = `
      <div class="goal-progress-timeline">
        ${recentEntries.map((entry) => `
          <div class="goal-progress-item">
            <div class="goal-progress-item-head">
              <span class="goal-tracking-item-title">${escapeHtml(entry.title || entry.event || "timeline")}</span>
              <span class="memory-badge">${escapeHtml(entry.event || "-")}</span>
            </div>
            <div class="memory-list-item-meta">
              <span>${escapeHtml(formatDateTime(entry.at))}</span>
              ${entry.nodeId ? `<span>${escapeHtml(entry.nodeId)}</span>` : ""}
              ${entry.status ? `<span>${escapeHtml(entry.status)}</span>` : ""}
              ${entry.checkpointId ? `<span>${escapeHtml(entry.checkpointId)}</span>` : ""}
            </div>
            ${entry.summary ? `<div class="memory-list-item-snippet">${escapeHtml(entry.summary)}</div>` : ""}
            ${entry.note ? `<div class="memory-list-item-snippet">${escapeHtml(entry.note)}</div>` : ""}
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderGoalHandoffPanelLoading() {
    const panel = goalsDetailEl?.querySelector("#goalHandoffPanel");
    if (!panel) return;
    panel.innerHTML = '<div class="memory-viewer-empty">正在读取 handoff.md …</div>';
  }

  function renderGoalHandoffPanelError(goal, message) {
    const panel = goalsDetailEl?.querySelector("#goalHandoffPanel");
    if (!panel) return;
    panel.innerHTML = `
      <div class="memory-viewer-empty">${escapeHtml(message)}</div>
      <div class="goal-detail-actions">
        <button class="button" data-goal-generate-handoff="${escapeHtml(goal.id)}">生成 handoff</button>
        <button class="button goal-inline-action-secondary" data-open-source="${escapeHtml(goal.handoffPath)}">打开 handoff</button>
      </div>
    `;
    onBindHandoffPanelActions?.(goal);
  }

  function renderGoalHandoffPanel(goal, handoff) {
    const panel = goalsDetailEl?.querySelector("#goalHandoffPanel");
    if (!panel || !goal) return;

    if (!handoff || !handoff.generatedAt) {
      panel.innerHTML = `
        <div class="memory-viewer-empty">当前还没有正式 handoff。可在节点切换、暂停前或需要交接时手动生成。</div>
        <div class="goal-detail-actions">
          <button class="button" data-goal-generate-handoff="${escapeHtml(goal.id)}">生成 handoff</button>
          <button class="button goal-inline-action-secondary" data-open-source="${escapeHtml(goal.handoffPath)}">打开 handoff</button>
        </div>
      `;
      onBindHandoffPanelActions?.(goal);
      return;
    }

    panel.innerHTML = `
      <div class="goal-summary-header">
        <div>
          <div class="goal-summary-title">Handoff / 恢复交接</div>
          <div class="goal-summary-text">从 handoff.md 读取当前 goal 的恢复建议、阻塞点与最近交接摘要。</div>
        </div>
        <span class="memory-badge memory-badge-shared">已生成</span>
      </div>
      <div class="goal-summary-grid">
        <div class="goal-summary-item">
          <span class="goal-summary-label">生成时间</span>
          <strong class="goal-summary-value">${escapeHtml(formatDateTime(handoff.generatedAt))}</strong>
        </div>
        <div class="goal-summary-item">
          <span class="goal-summary-label">恢复模式</span>
          <strong class="goal-summary-value">${escapeHtml(handoff.resumeMode || "-")}</strong>
        </div>
        <div class="goal-summary-item">
          <span class="goal-summary-label">建议节点</span>
          <strong class="goal-summary-value">${escapeHtml(handoff.resumeNode || "-")}</strong>
        </div>
        <div class="goal-summary-item">
          <span class="goal-summary-label">Open Checkpoint</span>
          <strong class="goal-summary-value">${escapeHtml(String(handoff.openCheckpoints.length))}</strong>
        </div>
        <div class="goal-summary-item">
          <span class="goal-summary-label">阻塞项</span>
          <strong class="goal-summary-value">${escapeHtml(String(handoff.blockers.length))}</strong>
        </div>
        <div class="goal-summary-item">
          <span class="goal-summary-label">上次 Run</span>
          <strong class="goal-summary-value">${escapeHtml(handoff.lastRun || "-")}</strong>
        </div>
      </div>

      <div class="goal-tracking-columns">
        <div class="goal-tracking-column">
          <div class="goal-summary-title">交接摘要</div>
          <div class="memory-list-item-snippet">${escapeHtml(handoff.summary || "暂无摘要")}</div>
          <div class="goal-summary-title">下一步建议</div>
          <div class="memory-list-item-snippet">${escapeHtml(handoff.nextAction || "暂无建议")}</div>
          <div class="goal-summary-title">Tracking Snapshot</div>
          <div class="memory-list-item-meta">
            <span>nodes ${escapeHtml(String(handoff.tracking.totalNodes || "0"))}</span>
            <span>done ${escapeHtml(String(handoff.tracking.completedNodes || "0"))}</span>
            <span>running ${escapeHtml(String(handoff.tracking.inProgressNodes || "0"))}</span>
            <span>blocked ${escapeHtml(String(handoff.tracking.blockedNodes || "0"))}</span>
            <span>checkpoint ${escapeHtml(String(handoff.tracking.openCheckpoints || "0"))}</span>
          </div>
          ${handoff.focusPlan ? `
            <div class="goal-summary-title">Focus Capability</div>
            <div class="memory-list-item-snippet">${escapeHtml(handoff.focusPlan)}</div>
            ${handoff.focusSummary ? `<div class="memory-list-item-snippet">${escapeHtml(handoff.focusSummary)}</div>` : ""}
          ` : ""}
        </div>
        <div class="goal-tracking-column">
          <div class="goal-summary-title">阻塞 / 待处理</div>
          ${handoff.blockers.length || handoff.openCheckpoints.length ? `
            <div class="goal-tracking-list">
              ${handoff.blockers.map((item) => `
                <div class="goal-tracking-item">
                  <div class="memory-list-item-snippet">${escapeHtml(item)}</div>
                </div>
              `).join("")}
              ${handoff.openCheckpoints.map((item) => `
                <div class="goal-tracking-item">
                  <div class="memory-list-item-snippet">${escapeHtml(item)}</div>
                </div>
              `).join("")}
            </div>
          ` : '<div class="memory-viewer-empty">当前 handoff 中没有阻塞或待审批项。</div>'}

          <div class="goal-summary-title">最近 Timeline</div>
          ${handoff.recentTimeline.length ? `
            <div class="goal-tracking-list">
              ${handoff.recentTimeline.map((item) => `
                <div class="goal-tracking-item">
                  <div class="memory-list-item-snippet">${escapeHtml(item)}</div>
                </div>
              `).join("")}
            </div>
          ` : '<div class="memory-viewer-empty">handoff 中还没有最近时间线摘要。</div>'}
        </div>
      </div>

      <div class="goal-detail-actions">
        <button class="button" data-goal-generate-handoff="${escapeHtml(goal.id)}">刷新 handoff</button>
        <button class="button goal-inline-action-secondary" data-open-source="${escapeHtml(goal.handoffPath)}">打开 handoff</button>
      </div>
    `;
    onBindHandoffPanelActions?.(goal);
  }

  return {
    renderGoalCanvasPanel,
    renderGoalCanvasPanelLoading,
    renderGoalHandoffPanel,
    renderGoalHandoffPanelError,
    renderGoalHandoffPanelLoading,
    renderGoalProgressPanel,
    renderGoalProgressPanelLoading,
  };
}
