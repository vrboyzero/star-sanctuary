export function createGoalsTrackingPanelFeature({
  refs,
  escapeHtml,
  formatDateTime,
  getGoalCheckpointSlaBadge,
}) {
  const { goalsDetailEl } = refs;

  function formatNodeStatus(status) {
    const normalized = typeof status === "string" ? status.trim().toLowerCase() : "";
    if (!normalized) return "未知";
    if (normalized === "completed" || normalized === "done") return "已完成";
    if (normalized === "running" || normalized === "executing" || normalized === "in_progress") return "运行中";
    if (normalized === "blocked") return "阻塞";
    if (normalized === "ready") return "就绪";
    if (normalized === "pending") return "待处理";
    return status;
  }

  function formatCheckpointStatus(status) {
    const normalized = typeof status === "string" ? status.trim().toLowerCase() : "";
    if (!normalized) return "未知";
    if (normalized === "waiting_user" || normalized === "required") return "待处理";
    if (normalized === "approved") return "已批准";
    if (normalized === "rejected") return "已拒绝";
    if (normalized === "expired") return "已过期";
    if (normalized === "reopened") return "已重新打开";
    return status;
  }

  function formatCheckpointHistoryAction(action) {
    const normalized = typeof action === "string" ? action.trim().toLowerCase() : "";
    if (!normalized) return "记录";
    if (normalized === "approve" || normalized === "approved") return "批准";
    if (normalized === "reject" || normalized === "rejected") return "拒绝";
    if (normalized === "expire" || normalized === "expired") return "标记过期";
    if (normalized === "reopen" || normalized === "reopened") return "重新打开";
    if (normalized === "request" || normalized === "requested") return "发起";
    return action;
  }

  function renderGoalTrackingPanelLoading() {
    const panel = goalsDetailEl?.querySelector("#goalTrackingPanel");
    if (!panel) return;
    panel.innerHTML = '<div class="memory-viewer-empty">正在读取 tasks.json / checkpoints.json …</div>';
  }

  function renderGoalTrackingPanel(goal, payload) {
    const panel = goalsDetailEl?.querySelector("#goalTrackingPanel");
    if (!panel) return;
    const nodes = Array.isArray(payload?.nodes) ? payload.nodes : [];
    const checkpoints = Array.isArray(payload?.checkpoints) ? payload.checkpoints : [];
    const completedNodeCount = nodes.filter((node) => node.status === "completed").length;
    const runningNodeCount = nodes.filter((node) => node.status === "running").length;
    const blockedNodeCount = nodes.filter((node) => node.status === "blocked").length;
    const waitingCheckpointCount = checkpoints.filter((item) => item.status === "waiting_user" || item.status === "required").length;
    const approvedCheckpointCount = checkpoints.filter((item) => item.status === "approved").length;
    const rejectedCheckpointCount = checkpoints.filter((item) => item.status === "rejected").length;
    const recentNodes = nodes.slice(0, 6);
    const recentCheckpoints = checkpoints
      .slice()
      .sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime())
      .slice(0, 6);

    panel.innerHTML = `
      <div class="goal-tracking-stats">
        <div class="goal-summary-item">
          <span class="goal-summary-label">节点总数</span>
          <strong class="goal-summary-value">${escapeHtml(String(nodes.length))}</strong>
        </div>
        <div class="goal-summary-item">
          <span class="goal-summary-label">已完成</span>
          <strong class="goal-summary-value">${escapeHtml(String(completedNodeCount))}</strong>
        </div>
        <div class="goal-summary-item">
          <span class="goal-summary-label">进行中</span>
          <strong class="goal-summary-value">${escapeHtml(String(runningNodeCount))}</strong>
        </div>
        <div class="goal-summary-item">
          <span class="goal-summary-label">阻塞</span>
          <strong class="goal-summary-value">${escapeHtml(String(blockedNodeCount))}</strong>
        </div>
        <div class="goal-summary-item">
          <span class="goal-summary-label">Checkpoint</span>
          <strong class="goal-summary-value">${escapeHtml(String(checkpoints.length))}</strong>
        </div>
        <div class="goal-summary-item">
          <span class="goal-summary-label">待处理</span>
          <strong class="goal-summary-value">${escapeHtml(String(waitingCheckpointCount))}</strong>
        </div>
        <div class="goal-summary-item">
          <span class="goal-summary-label">已批准</span>
          <strong class="goal-summary-value">${escapeHtml(String(approvedCheckpointCount))}</strong>
        </div>
        <div class="goal-summary-item">
          <span class="goal-summary-label">已拒绝</span>
          <strong class="goal-summary-value">${escapeHtml(String(rejectedCheckpointCount))}</strong>
        </div>
      </div>

      <div class="goal-tracking-columns">
        <div class="goal-tracking-column">
          <div class="goal-summary-title">最近节点</div>
          ${recentNodes.length ? `
            <div class="goal-tracking-list">
              ${recentNodes.map((node) => `
                <div class="goal-tracking-item">
                  <div class="goal-tracking-item-head">
                    <span class="goal-tracking-item-title">${escapeHtml(node.title)}</span>
                    <span class="memory-badge ${node.status === "completed" ? "memory-badge-shared" : ""}">${escapeHtml(formatNodeStatus(node.status))}</span>
                  </div>
                  <div class="memory-list-item-meta">
                    <span>${escapeHtml(node.id)}</span>
                    ${node.phase ? `<span>${escapeHtml(node.phase)}</span>` : ""}
                    ${node.owner ? `<span>${escapeHtml(node.owner)}</span>` : ""}
                  </div>
                </div>
              `).join("")}
            </div>
          ` : '<div class="memory-viewer-empty">tasks.json 中还没有节点。</div>'}
        </div>
        <div class="goal-tracking-column">
          <div class="goal-summary-title">最近 Checkpoint</div>
          ${recentCheckpoints.length ? `
            <div class="goal-tracking-list">
              ${recentCheckpoints.map((item) => `
                <div class="goal-tracking-item">
                  <div class="goal-tracking-item-head">
                    <span class="goal-tracking-item-title">${escapeHtml(item.title)}</span>
                    <span class="memory-badge ${item.status === "approved" ? "memory-badge-shared" : ""}">${escapeHtml(formatCheckpointStatus(item.status))}</span>
                  </div>
                  <div class="memory-list-item-snippet">${escapeHtml(item.summary || item.note || "暂无摘要")}</div>
                  <div class="memory-list-item-meta">
                    <span>${escapeHtml(item.id)}</span>
                    ${item.nodeId ? `<span>${escapeHtml(item.nodeId)}</span>` : ""}
                    <span>${escapeHtml(formatDateTime(item.updatedAt))}</span>
                  </div>
                  <div class="goal-checkpoint-meta">
                    ${item.reviewer ? `<span class="memory-badge">评审人 ${escapeHtml(item.reviewer)}</span>` : ""}
                    ${item.reviewerRole ? `<span class="memory-badge">${escapeHtml(item.reviewerRole)}</span>` : ""}
                    ${item.requestedBy ? `<span class="memory-badge">发起 ${escapeHtml(item.requestedBy)}</span>` : ""}
                    ${item.decidedBy ? `<span class="memory-badge">审批 ${escapeHtml(item.decidedBy)}</span>` : ""}
                    ${getGoalCheckpointSlaBadge(item)}
                  </div>
                  <div class="goal-detail-actions goal-checkpoint-actions">
                    ${["waiting_user", "required"].includes(item.status) ? `
                      <button class="button goal-inline-action" data-goal-checkpoint-action="approve" data-goal-checkpoint-goal-id="${escapeHtml(goal.id)}" data-goal-checkpoint-node-id="${escapeHtml(item.nodeId || "")}" data-goal-checkpoint-id="${escapeHtml(item.id)}">批准</button>
                      <button class="button goal-inline-action-secondary" data-goal-checkpoint-action="reject" data-goal-checkpoint-goal-id="${escapeHtml(goal.id)}" data-goal-checkpoint-node-id="${escapeHtml(item.nodeId || "")}" data-goal-checkpoint-id="${escapeHtml(item.id)}">拒绝</button>
                      <button class="button goal-inline-action-secondary" data-goal-checkpoint-action="expire" data-goal-checkpoint-goal-id="${escapeHtml(goal.id)}" data-goal-checkpoint-node-id="${escapeHtml(item.nodeId || "")}" data-goal-checkpoint-id="${escapeHtml(item.id)}">过期</button>
                    ` : ""}
                    ${["rejected", "expired"].includes(item.status) ? `
                      <button class="button goal-inline-action" data-goal-checkpoint-action="reopen" data-goal-checkpoint-goal-id="${escapeHtml(goal.id)}" data-goal-checkpoint-node-id="${escapeHtml(item.nodeId || "")}" data-goal-checkpoint-id="${escapeHtml(item.id)}">重新打开</button>
                    ` : ""}
                  </div>
                  ${item.history.length ? `
                    <div class="goal-checkpoint-history">
                      ${item.history.slice().reverse().slice(0, 4).map((history) => `
                        <div class="goal-checkpoint-history-item">
                          <span class="memory-badge">${escapeHtml(formatCheckpointHistoryAction(history.action))}</span>
                          <span>${escapeHtml(formatDateTime(history.at))}</span>
                          ${history.actor ? `<span>${escapeHtml(history.actor)}</span>` : ""}
                          ${history.note ? `<span>${escapeHtml(history.note)}</span>` : ""}
                        </div>
                      `).join("")}
                    </div>
                  ` : ""}
                </div>
              `).join("")}
            </div>
          ` : '<div class="memory-viewer-empty">checkpoints.json 中还没有 checkpoint。</div>'}
        </div>
      </div>
    `;
  }

  function renderGoalTrackingPanelError(message) {
    const panel = goalsDetailEl?.querySelector("#goalTrackingPanel");
    if (!panel) return;
    panel.innerHTML = `<div class="memory-viewer-empty">${escapeHtml(message)}</div>`;
  }

  return {
    renderGoalTrackingPanel,
    renderGoalTrackingPanelError,
    renderGoalTrackingPanelLoading,
  };
}
