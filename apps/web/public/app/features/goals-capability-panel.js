export function createGoalsCapabilityPanelFeature({
  refs,
  escapeHtml,
  formatDateTime,
}) {
  const { goalsDetailEl } = refs;

  function formatCapabilityMode(mode) {
    return mode === "multi_agent" ? "Multi Agent" : "Single Agent";
  }

  function formatCapabilityRisk(level) {
    if (level === "high") return "High Risk";
    if (level === "medium") return "Medium Risk";
    return "Low Risk";
  }

  function renderCapabilityTagList(items, emptyText) {
    if (!Array.isArray(items) || !items.length) {
      return `<div class="memory-viewer-empty">${escapeHtml(emptyText)}</div>`;
    }
    return `
      <div class="goal-capability-tag-list">
        ${items.map((item) => `<span class="memory-badge">${escapeHtml(item)}</span>`).join("")}
      </div>
    `;
  }

  function renderGoalCapabilityPanelLoading() {
    const panel = goalsDetailEl?.querySelector("#goalCapabilityPanel");
    if (!panel) return;
    panel.innerHTML = '<div class="memory-viewer-empty">正在读取 capability-plans.json …</div>';
  }

  function renderGoalCapabilityPanelError(message) {
    const panel = goalsDetailEl?.querySelector("#goalCapabilityPanel");
    if (!panel) return;
    panel.innerHTML = `<div class="memory-viewer-empty">${escapeHtml(message)}</div>`;
  }

  function renderGoalCapabilityPanel(goal, payload) {
    const panel = goalsDetailEl?.querySelector("#goalCapabilityPanel");
    if (!panel) return;
    const plans = Array.isArray(payload?.plans) ? payload.plans : [];
    const nodeMap = payload?.nodeMap && typeof payload.nodeMap === "object" ? payload.nodeMap : {};
    const planCount = plans.length;
    const orchestratedCount = plans.filter((plan) => plan.status === "orchestrated").length;
    const highRiskCount = plans.filter((plan) => plan.riskLevel === "high").length;
    const driftCount = plans.filter((plan) => plan.analysis?.status === "partial" || plan.analysis?.status === "diverged").length;
    const actualMethodCount = new Set(plans.flatMap((plan) => plan.actualUsage.methods)).size;
    const actualSkillCount = new Set(plans.flatMap((plan) => plan.actualUsage.skills)).size;
    const actualMcpCount = new Set(plans.flatMap((plan) => plan.actualUsage.mcpServers)).size;
    const preferredNodeIds = [goal?.activeNodeId, goal?.lastNodeId]
      .map((item) => typeof item === "string" ? item.trim() : "")
      .filter(Boolean);
    const focusPlan = preferredNodeIds.map((nodeId) => plans.find((plan) => plan.nodeId === nodeId)).find(Boolean) || plans[0] || null;
    const recentPlans = plans.slice(0, 6);

    if (!planCount) {
      panel.innerHTML = `
        <div class="memory-viewer-empty">
          capability-plans.json 中还没有计划记录。可先在 goal channel 中执行
          <code>goal_capability_plan</code> / <code>goal_orchestrate</code>。
        </div>
      `;
      return;
    }

    const focusNodeTitle = focusPlan?.nodeId ? (nodeMap[focusPlan.nodeId] || focusPlan.nodeId) : "当前节点";
    panel.innerHTML = `
      <div class="goal-capability-stats">
        <div class="goal-summary-item">
          <span class="goal-summary-label">Plan 总数</span>
          <strong class="goal-summary-value">${escapeHtml(String(planCount))}</strong>
        </div>
        <div class="goal-summary-item">
          <span class="goal-summary-label">已编排</span>
          <strong class="goal-summary-value">${escapeHtml(String(orchestratedCount))}</strong>
        </div>
        <div class="goal-summary-item">
          <span class="goal-summary-label">高风险</span>
          <strong class="goal-summary-value">${escapeHtml(String(highRiskCount))}</strong>
        </div>
        <div class="goal-summary-item">
          <span class="goal-summary-label">偏差计划</span>
          <strong class="goal-summary-value">${escapeHtml(String(driftCount))}</strong>
        </div>
        <div class="goal-summary-item">
          <span class="goal-summary-label">实际 Methods</span>
          <strong class="goal-summary-value">${escapeHtml(String(actualMethodCount))}</strong>
        </div>
        <div class="goal-summary-item">
          <span class="goal-summary-label">实际 Skills</span>
          <strong class="goal-summary-value">${escapeHtml(String(actualSkillCount))}</strong>
        </div>
        <div class="goal-summary-item">
          <span class="goal-summary-label">实际 MCP</span>
          <strong class="goal-summary-value">${escapeHtml(String(actualMcpCount))}</strong>
        </div>
      </div>

      ${focusPlan ? `
        <div class="goal-capability-focus">
          <div class="goal-tracking-item-head">
            <div>
              <div class="goal-summary-title">当前重点 Plan</div>
              <div class="goal-summary-text">${escapeHtml(focusNodeTitle)} · ${escapeHtml(focusPlan.nodeId || focusPlan.id)}</div>
            </div>
            <div class="goal-checkpoint-meta">
              <span class="memory-badge ${focusPlan.status === "orchestrated" ? "memory-badge-shared" : ""}">${escapeHtml(focusPlan.status)}</span>
              <span class="memory-badge">${escapeHtml(formatCapabilityMode(focusPlan.executionMode))}</span>
              <span class="memory-badge ${focusPlan.riskLevel === "high" ? "is-overdue" : ""}">${escapeHtml(formatCapabilityRisk(focusPlan.riskLevel))}</span>
              <span class="memory-badge ${focusPlan.analysis?.status === "diverged" ? "is-overdue" : focusPlan.analysis?.status === "aligned" ? "memory-badge-shared" : ""}">${escapeHtml(focusPlan.analysis?.status || "pending")}</span>
            </div>
          </div>
          ${focusPlan.summary ? `<div class="memory-list-item-snippet">${escapeHtml(focusPlan.summary)}</div>` : ""}
          ${focusPlan.objective ? `<div class="memory-list-item-snippet">${escapeHtml(focusPlan.objective)}</div>` : ""}
          ${focusPlan.analysis?.summary ? `<div class="memory-list-item-snippet">${escapeHtml(focusPlan.analysis.summary)}</div>` : ""}
          <div class="memory-list-item-meta">
            <span>${escapeHtml(focusPlan.id)}</span>
            ${focusPlan.runId ? `<span>${escapeHtml(focusPlan.runId)}</span>` : ""}
            <span>${escapeHtml(formatDateTime(focusPlan.updatedAt || focusPlan.generatedAt))}</span>
            ${focusPlan.orchestratedAt ? `<span>orchestrated ${escapeHtml(formatDateTime(focusPlan.orchestratedAt))}</span>` : ""}
          </div>

          <div class="goal-capability-columns">
            <div class="goal-capability-column">
              <div class="goal-summary-label">Plan 能力编排</div>
              ${renderCapabilityTagList(
                [
                  ...focusPlan.methods.map((item) => item.title || item.file),
                  ...focusPlan.skills.map((item) => item.name),
                  ...focusPlan.mcpServers.map((item) => item.serverId),
                  ...focusPlan.subAgents.map((item) => `${item.agentId}: ${item.objective}`),
                ],
                "当前 plan 还没有明确列出 methods / skills / MCP / sub-agent。",
              )}
            </div>
            <div class="goal-capability-column">
              <div class="goal-summary-label">Actual Usage</div>
              ${renderCapabilityTagList(
                [
                  ...focusPlan.actualUsage.methods.map((item) => `method:${item}`),
                  ...focusPlan.actualUsage.skills.map((item) => `skill:${item}`),
                  ...focusPlan.actualUsage.mcpServers.map((item) => `mcp:${item}`),
                ],
                "当前还没有采集到实际 usage。",
              )}
              ${focusPlan.actualUsage.toolNames.length ? `
                <div class="goal-capability-tool-list">
                  ${focusPlan.actualUsage.toolNames.map((item) => `<code>${escapeHtml(item)}</code>`).join("")}
                </div>
              ` : ""}
              ${focusPlan.actualUsage.updatedAt ? `
                <div class="memory-list-item-meta">
                  <span>usage updated</span>
                  <span>${escapeHtml(formatDateTime(focusPlan.actualUsage.updatedAt))}</span>
                </div>
              ` : ""}
            </div>
          </div>

          <div class="goal-capability-columns">
            <div class="goal-capability-column">
              <div class="goal-summary-label">Reasoning / Query Hints</div>
              ${renderCapabilityTagList(
                [...focusPlan.reasoning, ...focusPlan.queryHints.map((item) => `hint:${item}`)],
                "当前 plan 没有额外 reasoning / query hints。",
              )}
            </div>
            <div class="goal-capability-column">
              <div class="goal-summary-label">Risk / Checkpoint / Gaps</div>
              ${renderCapabilityTagList(
                [
                  focusPlan.checkpoint.required ? "checkpoint:required" : "checkpoint:optional",
                  `mode:${focusPlan.checkpoint.approvalMode || "none"}`,
                  ...focusPlan.checkpoint.requiredRequestFields.map((item) => `request:${item}`),
                  ...focusPlan.checkpoint.requiredDecisionFields.map((item) => `decision:${item}`),
                  focusPlan.checkpoint.suggestedReviewer ? `reviewer:${focusPlan.checkpoint.suggestedReviewer}` : "",
                  focusPlan.checkpoint.suggestedReviewerRole ? `role:${focusPlan.checkpoint.suggestedReviewerRole}` : "",
                  focusPlan.checkpoint.suggestedSlaHours ? `sla:${focusPlan.checkpoint.suggestedSlaHours}h` : "",
                  focusPlan.checkpoint.escalationMode && focusPlan.checkpoint.escalationMode !== "none" ? `escalation:${focusPlan.checkpoint.escalationMode}` : "",
                  ...focusPlan.checkpoint.reasons,
                  ...focusPlan.gaps.map((item) => `gap:${item}`),
                ].filter(Boolean),
                "当前 plan 没有额外风险说明或能力缺口。",
              )}
            </div>
          </div>

          <div class="goal-capability-columns">
            <div class="goal-capability-column">
              <div class="goal-summary-label">Deviation Analysis</div>
              ${renderCapabilityTagList(
                (focusPlan.analysis?.deviations || []).map((item) => `${item.area}:${item.summary}`),
                "当前没有检测到明显偏差。",
              )}
            </div>
            <div class="goal-capability-column">
              <div class="goal-summary-label">Suggestions</div>
              ${renderCapabilityTagList(
                focusPlan.analysis?.recommendations || [],
                "当前没有额外补建议。",
              )}
            </div>
          </div>
        </div>
      ` : ""}

      <div class="goal-tracking-column">
        <div class="goal-summary-title">最近 Capability Plans</div>
        <div class="goal-tracking-list">
          ${recentPlans.map((plan) => {
            const nodeTitle = plan.nodeId ? (nodeMap[plan.nodeId] || plan.nodeId) : plan.id;
            return `
              <div class="goal-tracking-item">
                <div class="goal-tracking-item-head">
                  <span class="goal-tracking-item-title">${escapeHtml(nodeTitle)}</span>
                  <div class="goal-checkpoint-meta">
                    <span class="memory-badge ${plan.status === "orchestrated" ? "memory-badge-shared" : ""}">${escapeHtml(plan.status)}</span>
                    <span class="memory-badge">${escapeHtml(plan.executionMode)}</span>
                    <span class="memory-badge ${plan.riskLevel === "high" ? "is-overdue" : ""}">${escapeHtml(plan.riskLevel)}</span>
                  </div>
                </div>
                ${plan.summary ? `<div class="memory-list-item-snippet">${escapeHtml(plan.summary)}</div>` : ""}
                <div class="memory-list-item-meta">
                  <span>${escapeHtml(plan.id)}</span>
                  ${plan.nodeId ? `<span>${escapeHtml(plan.nodeId)}</span>` : ""}
                  <span>${escapeHtml(formatDateTime(plan.updatedAt || plan.generatedAt))}</span>
                </div>
                <div class="goal-checkpoint-meta">
                  <span class="memory-badge">plan m=${escapeHtml(String(plan.methods.length))}</span>
                  <span class="memory-badge">s=${escapeHtml(String(plan.skills.length))}</span>
                  <span class="memory-badge">mcp=${escapeHtml(String(plan.mcpServers.length))}</span>
                  <span class="memory-badge">actual=${escapeHtml(String(
                    plan.actualUsage.methods.length + plan.actualUsage.skills.length + plan.actualUsage.mcpServers.length,
                  ))}</span>
                </div>
              </div>
            `;
          }).join("")}
        </div>
      </div>
    `;
  }

  return {
    renderGoalCapabilityPanel,
    renderGoalCapabilityPanelError,
    renderGoalCapabilityPanelLoading,
  };
}
