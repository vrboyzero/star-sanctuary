export function createGoalsDetailFeature({
  refs,
  getActiveConversationId,
  isConversationForGoal,
  escapeHtml,
  formatGoalStatus,
  formatDateTime,
  formatGoalPathSource,
  goalDocFilePath,
  goalRuntimeFilePath,
  goalBaseConversationId,
  onBindDetailActions,
  onLoadGoalCanvasData,
  onLoadGoalTrackingData,
  onLoadGoalCapabilityData,
  onLoadGoalProgressData,
  onLoadGoalHandoffData,
  onLoadGoalReviewGovernanceData,
}) {
  const { goalsDetailEl } = refs;

  function buildGoalRuntimeSummaryCard(goal, options) {
    const {
      activeNodeId,
      lastNodeId,
      lastRunId,
      isCurrentConversation,
    } = options;
    const currentChannel = goal.activeConversationId || goalBaseConversationId(goal.id);
    return `
      <div class="memory-detail-card goal-summary-card">
        <div class="goal-summary-header">
          <div>
            <div class="goal-summary-title">运行摘要</div>
            <div class="goal-summary-text">当前 goal channel、最近节点与运行记录一览。</div>
          </div>
          ${isCurrentConversation ? '<span class="memory-badge memory-badge-shared">当前正在此通道</span>' : '<span class="memory-badge">可恢复</span>'}
        </div>
        <div class="goal-summary-grid">
          <div class="goal-summary-item">
            <span class="goal-summary-label">状态</span>
            <strong class="goal-summary-value">${escapeHtml(formatGoalStatus(goal.status))}</strong>
          </div>
          <div class="goal-summary-item">
            <span class="goal-summary-label">当前节点</span>
            <strong class="goal-summary-value">${escapeHtml(activeNodeId || "-")}</strong>
          </div>
          <div class="goal-summary-item">
            <span class="goal-summary-label">上次节点</span>
            <strong class="goal-summary-value">${escapeHtml(lastNodeId || "-")}</strong>
          </div>
          <div class="goal-summary-item">
            <span class="goal-summary-label">上次 Run</span>
            <strong class="goal-summary-value">${escapeHtml(lastRunId || "-")}</strong>
          </div>
        </div>
        <div class="memory-detail-pre">${escapeHtml(currentChannel)}</div>
      </div>
    `;
  }

  function buildGoalRecoveryCard(goal, options) {
    const {
      activeNodeId,
      lastNodeId,
      isCurrentConversation,
    } = options;
    let title = "恢复建议";
    let text = "可以直接进入该长期任务的基础 goal channel。";
    let actions = `
      <button class="button" data-goal-resume-detail="${escapeHtml(goal.id)}">进入基础通道</button>
    `;

    if (goal.status === "executing" && isCurrentConversation) {
      title = "建议继续当前通道";
      text = "你已经位于该长期任务的执行通道中，优先继续当前上下文，避免重复恢复。";
      actions = `
        <button class="button" data-goal-resume-detail="${escapeHtml(goal.id)}">刷新并继续当前通道</button>
        <button class="button" data-open-goal-tasks="${escapeHtml(goal.id)}">查看关联 Tasks</button>
      `;
    } else if (goal.status === "executing" && activeNodeId) {
      title = "建议恢复当前执行节点";
      text = `该长期任务目前记录的活动节点是 ${activeNodeId}，优先回到这个节点继续执行。`;
      actions = `
        <button class="button" data-goal-resume-last-node="${escapeHtml(goal.id)}" data-goal-last-node-id="${escapeHtml(activeNodeId)}">恢复当前节点</button>
        <button class="button" data-goal-resume-detail="${escapeHtml(goal.id)}">进入基础通道</button>
      `;
    } else if (lastNodeId) {
      title = "建议按上次节点恢复";
      text = `检测到最近一次活跃节点为 ${lastNodeId}，优先按该节点恢复，比直接回基础通道更连续。`;
      actions = `
        <button class="button" data-goal-resume-last-node="${escapeHtml(goal.id)}" data-goal-last-node-id="${escapeHtml(lastNodeId)}">按上次节点恢复</button>
        <button class="button" data-goal-resume-detail="${escapeHtml(goal.id)}">进入基础通道</button>
      `;
    } else if (goal.status === "planning" || goal.status === "aligning" || goal.status === "ready") {
      title = "建议先进入基础通道";
      text = "当前还没有可恢复的节点历史，建议先进入基础 goal channel，继续拆解方案与任务。";
      actions = `
        <button class="button" data-goal-resume-detail="${escapeHtml(goal.id)}">进入基础通道</button>
        <button class="button" data-open-source="${escapeHtml(goal.northstarPath)}">打开 NORTHSTAR.md</button>
      `;
    }

    return `
      <div class="memory-detail-card goal-recovery-card">
        <div class="goal-summary-header">
          <div>
            <div class="goal-summary-title">${escapeHtml(title)}</div>
            <div class="goal-summary-text">${escapeHtml(text)}</div>
          </div>
        </div>
        <div class="goal-detail-actions">
          ${actions}
        </div>
      </div>
    `;
  }

  function renderGoalDetail(goal) {
    if (!goalsDetailEl) return;
    if (!goal) {
      goalsDetailEl.innerHTML = '<div class="memory-viewer-empty">选择左侧长期任务查看详情。</div>';
      return;
    }

    const activeConversationId = getActiveConversationId();
    const isCurrentConversation = isConversationForGoal(activeConversationId, goal.id);
    const objective = goal.objective ? String(goal.objective).trim() : "";
    const lastNodeId = typeof goal.lastNodeId === "string" && goal.lastNodeId.trim() ? goal.lastNodeId.trim() : "";
    const lastRunId = typeof goal.lastRunId === "string" && goal.lastRunId.trim() ? goal.lastRunId.trim() : "";
    const activeNodeId = typeof goal.activeNodeId === "string" && goal.activeNodeId.trim() ? goal.activeNodeId.trim() : "";
    const runtimeSummaryCard = buildGoalRuntimeSummaryCard(goal, {
      activeNodeId,
      lastNodeId,
      lastRunId,
      isCurrentConversation,
    });
    const recoveryCard = buildGoalRecoveryCard(goal, {
      activeNodeId,
      lastNodeId,
      isCurrentConversation,
    });

    goalsDetailEl.innerHTML = `
      <div class="memory-detail-shell">
        <div class="memory-detail-header">
          <div>
            <div class="memory-detail-title">${escapeHtml(goal.title || goal.id)}</div>
            <div class="memory-list-item-snippet">${escapeHtml(objective || "未填写 objective，可直接打开 NORTHSTAR.md 或 00-goal.md 继续完善。")}</div>
          </div>
          <div class="memory-detail-badges">
            <span class="memory-badge memory-badge-shared">${escapeHtml(formatGoalStatus(goal.status))}</span>
            <span class="memory-badge">${escapeHtml(goal.currentPhase || "-")}</span>
            ${isCurrentConversation ? '<span class="memory-badge memory-badge-shared">current channel</span>' : ""}
          </div>
        </div>

        ${runtimeSummaryCard}
        ${recoveryCard}

        <div class="memory-detail-card goal-handoff-card">
          <div id="goalHandoffPanel">
            <div class="memory-viewer-empty">正在读取 handoff.md …</div>
          </div>
        </div>

        <div class="memory-detail-card goal-governance-card">
          <div id="goalGovernancePanel">
            <div class="memory-viewer-empty">正在汇总 review governance / approval workflow …</div>
          </div>
        </div>

        <div class="memory-detail-grid">
          <div class="memory-detail-card"><span class="memory-detail-label">Goal ID</span><div class="memory-detail-text">${escapeHtml(goal.id)}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">更新时间</span><div class="memory-detail-text">${escapeHtml(formatDateTime(goal.updatedAt || goal.createdAt))}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">创建时间</span><div class="memory-detail-text">${escapeHtml(formatDateTime(goal.createdAt))}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">Path Source</span><div class="memory-detail-text">${escapeHtml(formatGoalPathSource(goal.pathSource))}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">当前 Active Node</span><div class="memory-detail-text">${escapeHtml(activeNodeId || "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">上次 Active Node</span><div class="memory-detail-text">${escapeHtml(lastNodeId || "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">上次 Run ID</span><div class="memory-detail-text">${escapeHtml(lastRunId || "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">最近活跃时间</span><div class="memory-detail-text">${escapeHtml(formatDateTime(goal.lastActiveAt))}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">最近暂停时间</span><div class="memory-detail-text">${escapeHtml(formatDateTime(goal.pausedAt))}</div></div>
        </div>

        <div class="memory-detail-card">
          <span class="memory-detail-label">执行通道</span>
          <div class="memory-detail-pre">${escapeHtml(goal.activeConversationId || goalBaseConversationId(goal.id))}</div>
        </div>

        <div class="memory-detail-card">
          <span class="memory-detail-label">关键路径</span>
          <div class="goal-path-list">
            <button class="button goal-path-button" data-open-source="${escapeHtml(goalDocFilePath(goal, "00-goal.md"))}">打开 00-goal</button>
            <button class="button goal-path-button" data-open-source="${escapeHtml(goal.northstarPath)}">打开 NORTHSTAR.md</button>
            <button class="button goal-path-button" data-open-source="${escapeHtml(goal.tasksPath)}">打开任务图</button>
            <button class="button goal-path-button" data-open-source="${escapeHtml(goalRuntimeFilePath(goal, "capability-plans.json"))}">打开 capability-plans.json</button>
            <button class="button goal-path-button" data-open-source="${escapeHtml(goalRuntimeFilePath(goal, "checkpoints.json"))}">打开 checkpoints.json</button>
            <button class="button goal-path-button" data-open-source="${escapeHtml(goal.progressPath)}">打开 progress</button>
            <button class="button goal-path-button" data-open-source="${escapeHtml(goal.handoffPath)}">打开 handoff</button>
            <button class="button goal-path-button" data-open-source="${escapeHtml(goalRuntimeFilePath(goal, "state.json"))}">打开 state.json</button>
            <button class="button goal-path-button" data-open-source="${escapeHtml(goalRuntimeFilePath(goal, "runtime.json"))}">打开 runtime.json</button>
          </div>
        </div>

        <div class="memory-detail-grid">
          <div class="memory-detail-card"><span class="memory-detail-label">Goal Root</span><div class="memory-detail-pre">${escapeHtml(goal.goalRoot || "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">Doc Root</span><div class="memory-detail-pre">${escapeHtml(goal.docRoot || "-")}</div></div>
          <div class="memory-detail-card"><span class="memory-detail-label">Runtime Root</span><div class="memory-detail-pre">${escapeHtml(goal.runtimeRoot || "-")}</div></div>
        </div>

        <div class="goal-detail-actions">
          <button class="button" data-open-goal-tasks="${escapeHtml(goal.id)}">查看关联 Tasks</button>
          <button class="button" data-goal-resume-detail="${escapeHtml(goal.id)}">恢复并进入通道</button>
          ${lastNodeId ? `<button class="button" data-goal-resume-last-node="${escapeHtml(goal.id)}" data-goal-last-node-id="${escapeHtml(lastNodeId)}">按上次节点恢复</button>` : ""}
          <button class="button goal-inline-action-secondary" data-goal-pause-detail="${escapeHtml(goal.id)}">暂停</button>
        </div>

        <div class="memory-detail-card goal-canvas-card">
          <div id="goalCanvasPanel">
            <div class="memory-viewer-empty">正在读取 board-ref.json …</div>
          </div>
        </div>

        <div class="memory-detail-card goal-tracking-card">
          <div class="goal-summary-header">
            <div>
              <div class="goal-summary-title">Checkpoint / Node 追踪</div>
              <div class="goal-summary-text">从 tasks.json 与 checkpoints.json 读取当前长期任务的结构化执行进度。</div>
            </div>
          </div>
          <div id="goalTrackingPanel">
            <div class="memory-viewer-empty">正在读取 tasks.json / checkpoints.json …</div>
          </div>
        </div>

        <div class="memory-detail-card goal-capability-card">
          <div class="goal-summary-header">
            <div>
              <div class="goal-summary-title">Capability Plan</div>
              <div class="goal-summary-text">从 capability-plans.json 读取节点执行前规划，以及运行后回写的 actual usage。</div>
            </div>
          </div>
          <div id="goalCapabilityPanel">
            <div class="memory-viewer-empty">正在读取 capability-plans.json …</div>
          </div>
        </div>

        <div class="memory-detail-card goal-progress-card">
          <div class="goal-summary-header">
            <div>
              <div class="goal-summary-title">执行时间线</div>
              <div class="goal-summary-text">从 progress.md 读取节点流转与 checkpoint 审批时间线。</div>
            </div>
          </div>
          <div id="goalProgressPanel">
            <div class="memory-viewer-empty">正在读取 progress.md …</div>
          </div>
        </div>
      </div>
    `;

    onBindDetailActions?.(goal);
    onLoadGoalCanvasData?.(goal);
    onLoadGoalTrackingData?.(goal);
    onLoadGoalCapabilityData?.(goal);
    onLoadGoalProgressData?.(goal);
    onLoadGoalHandoffData?.(goal);
    onLoadGoalReviewGovernanceData?.(goal);
  }

  return {
    renderGoalDetail,
  };
}
