export function createGoalsGovernancePanelFeature({
  refs,
  escapeHtml,
  formatDateTime,
  goalRuntimeFilePath,
}) {
  const { goalsDetailEl } = refs;

  function formatGovernanceStatus(status) {
    const normalized = typeof status === "string" ? status.trim().toLowerCase() : "";
    if (!normalized) return "未知";
    if (normalized === "pending" || normalized === "required" || normalized === "waiting_user") return "待处理";
    if (normalized === "approved" || normalized === "accepted") return "已通过";
    if (normalized === "rejected") return "已拒绝";
    if (normalized === "expired") return "已过期";
    if (normalized === "overdue") return "已逾期";
    if (normalized === "escalated") return "已升级";
    if (normalized === "sent") return "已发送";
    if (normalized === "failed" || normalized === "error") return "失败";
    return status;
  }

  function formatGovernanceTargetType(targetType) {
    const normalized = typeof targetType === "string" ? targetType.trim().toLowerCase() : "";
    if (!normalized) return "未知对象";
    if (normalized === "checkpoint") return "Checkpoint";
    if (normalized === "suggestion_review") return "建议评审";
    if (normalized === "template") return "模板";
    return targetType;
  }

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
      panel.innerHTML = '<div class="memory-viewer-empty">当前还没有评审治理汇总。</div>';
      return;
    }
    panel.innerHTML = `
      <div class="goal-summary-header">
        <div>
          <div class="goal-summary-title">评审治理 / 统一审批</div>
          <div class="goal-summary-text">在当前长期任务详情中汇总评审人、模板、建议评审、checkpoint 工作流与提醒状态。</div>
        </div>
        <div class="goal-detail-actions">
          <button class="button" data-goal-approval-scan="${escapeHtml(goal.id)}">执行审批扫描</button>
          <button class="button goal-inline-action-secondary" data-open-source="${escapeHtml(data.notificationsPath || goalRuntimeFilePath(goal, "review-notifications.json"))}">打开通知记录</button>
          <button class="button goal-inline-action-secondary" data-open-source="${escapeHtml(data.notificationDispatchesPath || goalRuntimeFilePath(goal, "review-notification-dispatches.json"))}">打开分发队列</button>
          ${data.governanceConfigPath ? `<button class="button goal-inline-action-secondary" data-open-source="${escapeHtml(data.governanceConfigPath)}">打开治理配置</button>` : ""}
        </div>
      </div>
      <div class="goal-summary-grid">
        <div class="goal-summary-item"><span class="goal-summary-label">待评审</span><strong class="goal-summary-value">${escapeHtml(String(data.workflowPendingCount))}</strong></div>
        <div class="goal-summary-item"><span class="goal-summary-label">评审逾期</span><strong class="goal-summary-value">${escapeHtml(String(data.workflowOverdueCount))}</strong></div>
        <div class="goal-summary-item"><span class="goal-summary-label">待处理 Checkpoint</span><strong class="goal-summary-value">${escapeHtml(String(data.checkpointWorkflowPendingCount))}</strong></div>
        <div class="goal-summary-item"><span class="goal-summary-label">Checkpoint 逾期</span><strong class="goal-summary-value">${escapeHtml(String(data.checkpointWorkflowOverdueCount))}</strong></div>
        <div class="goal-summary-item"><span class="goal-summary-label">评审人</span><strong class="goal-summary-value">${escapeHtml(String(data.reviewers.length))}</strong></div>
        <div class="goal-summary-item"><span class="goal-summary-label">模板</span><strong class="goal-summary-value">${escapeHtml(String(data.templates.length))}</strong></div>
        <div class="goal-summary-item"><span class="goal-summary-label">分发记录</span><strong class="goal-summary-value">${escapeHtml(String(data.notificationDispatchCounts?.total || data.notificationDispatches.length || 0))}</strong></div>
      </div>
      <div class="goal-tracking-columns">
        <div class="goal-tracking-column">
          <div class="goal-summary-title">待处理建议评审</div>
          ${data.actionableReviews.length ? `
            <div class="goal-tracking-list">
              ${data.actionableReviews.map((item) => `
                <div class="goal-tracking-item">
                  <div class="goal-tracking-item-head">
                    <span class="goal-tracking-item-title">${escapeHtml(item.title)}</span>
                    <span class="memory-badge">${escapeHtml(formatGovernanceStatus(item.status))}</span>
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
          ` : '<div class="memory-viewer-empty">当前没有待处理的建议评审。</div>'}
          <div class="goal-summary-title">模板</div>
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
          ` : '<div class="memory-viewer-empty">当前组织治理还没有配置模板。</div>'}
        </div>
        <div class="goal-tracking-column">
          <div class="goal-summary-title">待处理 Checkpoint</div>
          ${data.actionableCheckpoints.length ? `
            <div class="goal-tracking-list">
              ${data.actionableCheckpoints.map((item) => `
                <div class="goal-tracking-item">
                  <div class="goal-tracking-item-head">
                    <span class="goal-tracking-item-title">${escapeHtml(item.title)}</span>
                    <span class="memory-badge ${item.status === "approved" ? "memory-badge-shared" : ""}">${escapeHtml(formatGovernanceStatus(item.status))}</span>
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
          ` : '<div class="memory-viewer-empty">当前没有待处理的 checkpoint 工作流。</div>'}
          <div class="goal-summary-title">最近通知</div>
          ${data.notifications.length ? `
            <div class="goal-tracking-list">
              ${data.notifications.slice().reverse().slice(0, 6).map((item) => `
                <div class="goal-tracking-item">
                  <div class="goal-tracking-item-head">
                    <span class="goal-tracking-item-title">${escapeHtml(item.kind || "通知")}</span>
                    <span class="memory-badge">${escapeHtml(formatGovernanceTargetType(item.targetType))}</span>
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
          ` : '<div class="memory-viewer-empty">当前还没有提醒或升级通知。</div>'}
          <div class="goal-summary-title">分发渠道 / 队列</div>
          ${data.notificationDispatches.length ? `
            <div class="memory-list-item-meta" style="margin-bottom:10px;">
              <span>按渠道：${escapeHtml(Object.entries(data.notificationDispatchCounts?.byChannel || {}).map(([key, value]) => `${key}=${value}`).join(" | ") || "无")}</span>
              <span>按状态：${escapeHtml(Object.entries(data.notificationDispatchCounts?.byStatus || {}).map(([key, value]) => `${formatGovernanceStatus(key)}=${value}`).join(" | ") || "无")}</span>
            </div>
            <div class="goal-tracking-list">
              ${data.notificationDispatches.slice().reverse().slice(0, 8).map((item) => `
                <div class="goal-tracking-item">
                  <div class="goal-tracking-item-head">
                    <span class="goal-tracking-item-title">${escapeHtml(item.channel)}</span>
                    <span class="memory-badge">${escapeHtml(formatGovernanceStatus(item.status))}</span>
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
          ` : '<div class="memory-viewer-empty">当前还没有实际分发或队列记录。</div>'}
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
