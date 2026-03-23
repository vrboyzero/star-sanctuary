export function createGoalsGovernancePanelFeature({
  refs,
  escapeHtml,
  formatDateTime,
  goalRuntimeFilePath,
}) {
  const { goalsDetailEl } = refs;

  function renderGoalReviewGovernancePanelLoading() {
    const panel = goalsDetailEl?.querySelector("#goalGovernancePanel");
    if (!panel) return;
    panel.innerHTML = '<div class="memory-viewer-empty">正在汇总 review governance / approval workflow …</div>';
  }

  function renderGoalReviewGovernancePanelError(message) {
    const panel = goalsDetailEl?.querySelector("#goalGovernancePanel");
    if (!panel) return;
    panel.innerHTML = `<div class="memory-viewer-empty">${escapeHtml(message)}</div>`;
  }

  function renderGoalReviewGovernancePanel(goal, data) {
    const panel = goalsDetailEl?.querySelector("#goalGovernancePanel");
    if (!panel || !goal) return;
    if (!data) {
      panel.innerHTML = '<div class="memory-viewer-empty">当前还没有 review governance 汇总。</div>';
      return;
    }
    panel.innerHTML = `
      <div class="goal-summary-header">
        <div>
          <div class="goal-summary-title">Review Governance / Unified Approval</div>
          <div class="goal-summary-text">在现有 goal detail 内汇总 reviewer/template、suggestion review、checkpoint workflow 与 reminder 状态。</div>
        </div>
        <div class="goal-detail-actions">
          <button class="button" data-goal-approval-scan="${escapeHtml(goal.id)}">执行 Approval Scan</button>
          <button class="button goal-inline-action-secondary" data-open-source="${escapeHtml(data.notificationsPath || goalRuntimeFilePath(goal, "review-notifications.json"))}">打开 Notifications</button>
          <button class="button goal-inline-action-secondary" data-open-source="${escapeHtml(data.notificationDispatchesPath || goalRuntimeFilePath(goal, "review-notification-dispatches.json"))}">打开 Dispatch Outbox</button>
          ${data.governanceConfigPath ? `<button class="button goal-inline-action-secondary" data-open-source="${escapeHtml(data.governanceConfigPath)}">打开 Governance Config</button>` : ""}
        </div>
      </div>
      <div class="goal-summary-grid">
        <div class="goal-summary-item"><span class="goal-summary-label">Review Pending</span><strong class="goal-summary-value">${escapeHtml(String(data.workflowPendingCount))}</strong></div>
        <div class="goal-summary-item"><span class="goal-summary-label">Review Overdue</span><strong class="goal-summary-value">${escapeHtml(String(data.workflowOverdueCount))}</strong></div>
        <div class="goal-summary-item"><span class="goal-summary-label">Checkpoint Pending</span><strong class="goal-summary-value">${escapeHtml(String(data.checkpointWorkflowPendingCount))}</strong></div>
        <div class="goal-summary-item"><span class="goal-summary-label">Checkpoint Overdue</span><strong class="goal-summary-value">${escapeHtml(String(data.checkpointWorkflowOverdueCount))}</strong></div>
        <div class="goal-summary-item"><span class="goal-summary-label">Reviewers</span><strong class="goal-summary-value">${escapeHtml(String(data.reviewers.length))}</strong></div>
        <div class="goal-summary-item"><span class="goal-summary-label">Templates</span><strong class="goal-summary-value">${escapeHtml(String(data.templates.length))}</strong></div>
        <div class="goal-summary-item"><span class="goal-summary-label">Dispatches</span><strong class="goal-summary-value">${escapeHtml(String(data.notificationDispatchCounts?.total || data.notificationDispatches.length || 0))}</strong></div>
      </div>
      <div class="goal-tracking-columns">
        <div class="goal-tracking-column">
          <div class="goal-summary-title">Actionable Suggestion Reviews</div>
          ${data.actionableReviews.length ? `
            <div class="goal-tracking-list">
              ${data.actionableReviews.map((item) => `
                <div class="goal-tracking-item">
                  <div class="goal-tracking-item-head">
                    <span class="goal-tracking-item-title">${escapeHtml(item.title)}</span>
                    <span class="memory-badge">${escapeHtml(item.status)}</span>
                  </div>
                  <div class="memory-list-item-meta">
                    <span>${escapeHtml(item.id)}</span>
                    <span>${escapeHtml(item.suggestionType)}</span>
                    ${item.reviewer ? `<span>${escapeHtml(item.reviewer)}</span>` : ""}
                  </div>
                  <div class="goal-detail-actions">
                    <button class="button goal-inline-action" data-goal-suggestion-decision="accepted" data-goal-suggestion-goal-id="${escapeHtml(goal.id)}" data-goal-suggestion-review-id="${escapeHtml(item.id)}" data-goal-suggestion-type="${escapeHtml(item.suggestionType)}" data-goal-suggestion-id="${escapeHtml(item.suggestionId)}">通过</button>
                    <button class="button goal-inline-action-secondary" data-goal-suggestion-decision="rejected" data-goal-suggestion-goal-id="${escapeHtml(goal.id)}" data-goal-suggestion-review-id="${escapeHtml(item.id)}" data-goal-suggestion-type="${escapeHtml(item.suggestionType)}" data-goal-suggestion-id="${escapeHtml(item.suggestionId)}">拒绝</button>
                    <button class="button goal-inline-action-secondary" data-goal-suggestion-escalate="true" data-goal-suggestion-goal-id="${escapeHtml(goal.id)}" data-goal-suggestion-review-id="${escapeHtml(item.id)}" data-goal-suggestion-type="${escapeHtml(item.suggestionType)}" data-goal-suggestion-id="${escapeHtml(item.suggestionId)}">升级</button>
                  </div>
                </div>
              `).join("")}
            </div>
          ` : '<div class="memory-viewer-empty">当前没有待处理 suggestion review。</div>'}
          <div class="goal-summary-title">Templates</div>
          ${data.templates.length ? `
            <div class="goal-tracking-list">
              ${data.templates.map((item) => `
                <div class="goal-tracking-item">
                  <div class="goal-tracking-item-head">
                    <span class="goal-tracking-item-title">${escapeHtml(item.title)}</span>
                    <span class="memory-badge">${escapeHtml(item.mode)}</span>
                  </div>
                  <div class="memory-list-item-meta">
                    <span>${escapeHtml(item.id)}</span>
                    <span>${escapeHtml(item.target)}</span>
                  </div>
                </div>
              `).join("")}
            </div>
          ` : '<div class="memory-viewer-empty">当前 organization governance 尚未配置模板。</div>'}
        </div>
        <div class="goal-tracking-column">
          <div class="goal-summary-title">Actionable Checkpoints</div>
          ${data.actionableCheckpoints.length ? `
            <div class="goal-tracking-list">
              ${data.actionableCheckpoints.map((item) => `
                <div class="goal-tracking-item">
                  <div class="goal-tracking-item-head">
                    <span class="goal-tracking-item-title">${escapeHtml(item.title)}</span>
                    <span class="memory-badge ${item.status === "approved" ? "memory-badge-shared" : ""}">${escapeHtml(item.status)}</span>
                  </div>
                  <div class="memory-list-item-meta">
                    <span>${escapeHtml(item.id)}</span>
                    ${item.nodeId ? `<span>${escapeHtml(item.nodeId)}</span>` : ""}
                    ${item.reviewer ? `<span>${escapeHtml(item.reviewer)}</span>` : ""}
                    ${item.slaAt ? `<span>${escapeHtml(formatDateTime(item.slaAt))}</span>` : ""}
                  </div>
                  <div class="goal-detail-actions">
                    <button class="button goal-inline-action" data-goal-checkpoint-action="approve" data-goal-checkpoint-goal-id="${escapeHtml(goal.id)}" data-goal-checkpoint-node-id="${escapeHtml(item.nodeId || "")}" data-goal-checkpoint-id="${escapeHtml(item.id)}">批准</button>
                    <button class="button goal-inline-action-secondary" data-goal-checkpoint-action="reject" data-goal-checkpoint-goal-id="${escapeHtml(goal.id)}" data-goal-checkpoint-node-id="${escapeHtml(item.nodeId || "")}" data-goal-checkpoint-id="${escapeHtml(item.id)}">拒绝</button>
                    <button class="button goal-inline-action-secondary" data-goal-checkpoint-escalate="true" data-goal-checkpoint-goal-id="${escapeHtml(goal.id)}" data-goal-checkpoint-node-id="${escapeHtml(item.nodeId || "")}" data-goal-checkpoint-id="${escapeHtml(item.id)}">升级</button>
                  </div>
                </div>
              `).join("")}
            </div>
          ` : '<div class="memory-viewer-empty">当前没有待处理 checkpoint workflow。</div>'}
          <div class="goal-summary-title">Recent Notifications</div>
          ${data.notifications.length ? `
            <div class="goal-tracking-list">
              ${data.notifications.slice().reverse().slice(0, 6).map((item) => `
                <div class="goal-tracking-item">
                  <div class="goal-tracking-item-head">
                    <span class="goal-tracking-item-title">${escapeHtml(item.kind)}</span>
                    <span class="memory-badge">${escapeHtml(item.targetType)}</span>
                  </div>
                  <div class="memory-list-item-snippet">${escapeHtml(item.message || "")}</div>
                  <div class="memory-list-item-meta">
                    <span>${escapeHtml(item.targetId || "")}</span>
                    ${item.recipient ? `<span>${escapeHtml(item.recipient)}</span>` : ""}
                    ${item.createdAt ? `<span>${escapeHtml(formatDateTime(item.createdAt))}</span>` : ""}
                  </div>
                </div>
              `).join("")}
            </div>
          ` : '<div class="memory-viewer-empty">当前还没有 reminder / escalation 通知。</div>'}
          <div class="goal-summary-title">Dispatch Channels / Outbox</div>
          ${data.notificationDispatches.length ? `
            <div class="memory-list-item-meta" style="margin-bottom:10px;">
              <span>by channel: ${escapeHtml(Object.entries(data.notificationDispatchCounts?.byChannel || {}).map(([key, value]) => `${key}=${value}`).join(" | ") || "(none)")}</span>
              <span>by status: ${escapeHtml(Object.entries(data.notificationDispatchCounts?.byStatus || {}).map(([key, value]) => `${key}=${value}`).join(" | ") || "(none)")}</span>
            </div>
            <div class="goal-tracking-list">
              ${data.notificationDispatches.slice().reverse().slice(0, 8).map((item) => `
                <div class="goal-tracking-item">
                  <div class="goal-tracking-item-head">
                    <span class="goal-tracking-item-title">${escapeHtml(item.channel)}</span>
                    <span class="memory-badge">${escapeHtml(item.status)}</span>
                  </div>
                  <div class="memory-list-item-snippet">${escapeHtml(item.message || "")}</div>
                  <div class="memory-list-item-meta">
                    <span>${escapeHtml(item.targetType || "")}:${escapeHtml(item.targetId || "")}</span>
                    ${item.recipient ? `<span>${escapeHtml(item.recipient)}</span>` : ""}
                    ${item.routeKey ? `<span>${escapeHtml(item.routeKey)}</span>` : ""}
                    ${item.createdAt ? `<span>${escapeHtml(formatDateTime(item.createdAt))}</span>` : ""}
                  </div>
                </div>
              `).join("")}
            </div>
          ` : '<div class="memory-viewer-empty">当前还没有 materialized dispatch / outbox 记录。</div>'}
        </div>
      </div>
    `;
  }

  return {
    renderGoalReviewGovernancePanel,
    renderGoalReviewGovernancePanelError,
    renderGoalReviewGovernancePanelLoading,
  };
}
