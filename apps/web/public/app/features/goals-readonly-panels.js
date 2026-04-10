import {
  buildContinuationAction,
  encodeContinuationAction,
  formatContinuationTargetLabel,
} from "./continuation-targets.js";

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

  function renderGoalContinuationSection(continuationState) {
    if (!continuationState || typeof continuationState !== "object") return "";
    const checkpoints = continuationState.checkpoints && typeof continuationState.checkpoints === "object"
      ? continuationState.checkpoints
      : {};
    const progress = continuationState.progress && typeof continuationState.progress === "object"
      ? continuationState.progress
      : {};
    const recent = Array.isArray(progress.recent)
      ? progress.recent.filter((item) => typeof item === "string" && item.trim()).slice(0, 3)
      : [];
    const replay = continuationState.replay && typeof continuationState.replay === "object"
      ? continuationState.replay
      : null;

    const targetText = formatContinuationTargetLabel(continuationState);
    const targetAction = buildContinuationAction(continuationState);
    const encodedTargetAction = encodeContinuationAction(targetAction);
    const targetLabel = targetAction?.kind === "goalReplay"
      ? t("goals.detailReplayCheckpointButton", {}, "Replay Checkpoint")
      : targetText;
    const targetMarkup = continuationState.recommendedTargetId && encodedTargetAction
      ? `
        <button
          type="button"
          class="button goal-inline-action-secondary"
          data-continuation-action="${escapeHtml(encodedTargetAction)}"
        >${escapeHtml(targetLabel)}</button>
      `
      : `<strong class="goal-summary-value">${escapeHtml(targetLabel || targetText)}</strong>`;
    const replayText = replay?.kind === "goal_checkpoint"
      ? `${replay.checkpointId || "-"} -> ${replay.nodeId || "-"}`
      : "";
    const replayReason = replay?.kind === "goal_checkpoint"
      ? replay.summary || replay.reason || ""
      : "";

    return `
      <div class="goal-summary-title">${escapeHtml(t("goals.detailContinuationTitle", {}, "Continuation State"))}</div>
      <div class="goal-summary-grid">
        <div class="goal-summary-item">
          <span class="goal-summary-label">${escapeHtml(t("goals.detailContinuationMode", {}, "Resume Mode"))}</span>
          <strong class="goal-summary-value">${escapeHtml(continuationState.resumeMode || "-")}</strong>
        </div>
        <div class="goal-summary-item">
          <span class="goal-summary-label">${escapeHtml(t("goals.detailContinuationTarget", {}, "Recommended Target"))}</span>
          ${targetMarkup}
        </div>
        ${replayText ? `
          <div class="goal-summary-item">
            <span class="goal-summary-label">${escapeHtml(t("goals.detailContinuationReplay", {}, "Replay Target"))}</span>
            <strong class="goal-summary-value">${escapeHtml(replayText)}</strong>
          </div>
        ` : ""}
        <div class="goal-summary-item">
          <span class="goal-summary-label">${escapeHtml(t("goals.detailContinuationCheckpoints", {}, "Open Checkpoints"))}</span>
          <strong class="goal-summary-value">${escapeHtml(String(Number(checkpoints.openCount || 0)))}</strong>
        </div>
        <div class="goal-summary-item">
          <span class="goal-summary-label">${escapeHtml(t("goals.detailContinuationBlockers", {}, "Blockers"))}</span>
          <strong class="goal-summary-value">${escapeHtml(String(Number(checkpoints.blockerCount || 0)))}</strong>
        </div>
      </div>
      <div class="memory-list-item-snippet">${escapeHtml(continuationState.summary || "-")}</div>
      <div class="memory-list-item-snippet">${escapeHtml(continuationState.nextAction || "-")}</div>
      ${replayReason ? `<div class="memory-list-item-snippet">${escapeHtml(replayReason)}</div>` : ""}
      ${progress.current ? `<div class="memory-list-item-meta"><span>${escapeHtml(t("goals.detailContinuationProgress", {}, "Current Progress"))}</span><span>${escapeHtml(progress.current)}</span></div>` : ""}
      ${recent.length ? `
        <div class="goal-tracking-list">
          ${recent.map((item) => `
            <div class="goal-tracking-item">
              <div class="memory-list-item-snippet">${escapeHtml(item)}</div>
            </div>
          `).join("")}
        </div>
      ` : ""}
    `;
  }

  function deriveContinuationStateFromHandoff(goal, handoff) {
    if (!goal || !handoff || !handoff.generatedAt) return null;
    const openCheckpointCount = Number(
      handoff.tracking?.openCheckpointCount
      ?? handoff.tracking?.openCheckpoints
      ?? (Array.isArray(handoff.openCheckpoints) ? handoff.openCheckpoints.length : 0),
    );
    const blockerCount = Array.isArray(handoff.blockers) ? handoff.blockers.length : 0;
    const recentTimeline = Array.isArray(handoff.recentProgress)
      ? handoff.recentProgress.map((entry) => formatTimelineEntry(entry)).filter(Boolean).slice(0, 3)
      : Array.isArray(handoff.recentTimeline)
        ? handoff.recentTimeline.slice(0, 3)
        : [];
    const recommendedTargetId = handoff.recommendedNodeId
      || handoff.resumeNode
      || handoff.activeConversationId
      || goal.activeConversationId
      || goal.id;
    const targetType = handoff.recommendedNodeId || handoff.resumeNode
      ? "node"
      : handoff.activeConversationId || goal.activeConversationId
        ? "conversation"
        : "goal";

    return {
      scope: "goal",
      targetId: goal.id,
      recommendedTargetId,
      targetType,
      resumeMode: handoff.resumeMode || "goal_channel",
      summary: handoff.summary || "",
      nextAction: handoff.nextAction || "",
      replay: handoff.checkpointReplay && typeof handoff.checkpointReplay === "object"
        ? {
          kind: "goal_checkpoint",
          checkpointId: handoff.checkpointReplay.checkpointId || "",
          nodeId: handoff.checkpointReplay.nodeId || "",
          runId: handoff.checkpointReplay.runId || "",
          title: handoff.checkpointReplay.title || "",
          summary: handoff.checkpointReplay.summary || "",
          reason: handoff.checkpointReplay.reason || "",
        }
        : undefined,
      checkpoints: {
        openCount: openCheckpointCount,
        blockerCount,
      },
      progress: {
        current: handoff.currentPhase || goal.currentPhase || "",
        recent: recentTimeline,
      },
    };
  }

  function formatStructuredListItem(item, kind = "") {
    if (typeof item === "string") return item;
    if (!item || typeof item !== "object") return "";
    const label = typeof item.id === "string" && item.id.trim()
      ? `[${kind || item.kind || item.status || "-"}] ${item.id}`
      : typeof item.title === "string"
        ? item.title
        : "";
    const nodeId = typeof item.nodeId === "string" && item.nodeId.trim() ? `node=${item.nodeId}` : "";
    const title = typeof item.title === "string" ? item.title : "";
    const detail = typeof item.reason === "string"
      ? item.reason
      : typeof item.summary === "string"
        ? item.summary
        : typeof item.note === "string"
          ? item.note
          : "";
    return [label, nodeId, title && title !== label ? title : "", detail].filter(Boolean).join(" | ");
  }

  function formatTimelineEntry(entry) {
    if (typeof entry === "string") return entry;
    if (!entry || typeof entry !== "object") return "";
    return [
      typeof entry.at === "string" ? entry.at : "",
      typeof entry.event === "string" ? entry.event : "",
      typeof entry.nodeId === "string" && entry.nodeId ? `node=${entry.nodeId}` : "",
      typeof entry.checkpointId === "string" && entry.checkpointId ? `checkpoint=${entry.checkpointId}` : "",
      typeof entry.summary === "string" ? entry.summary : "",
      typeof entry.note === "string" ? entry.note : "",
    ].filter(Boolean).join(" | ");
  }

  function formatProgressEvent(value) {
    const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (!normalized) return "-";
    if (normalized === "timeline") return "时间线";
    if (normalized === "checkpoint_replay_started") return "Checkpoint Replay 已开始";
    if (normalized === "checkpoint_approved") return "Checkpoint 已批准";
    if (normalized === "checkpoint_rejected") return "Checkpoint 已拒绝";
    if (normalized === "checkpoint_expired") return "Checkpoint 已过期";
    if (normalized === "checkpoint_reopened") return "Checkpoint 已重新打开";
    if (normalized === "node_started") return "节点开始";
    if (normalized === "node_completed") return "节点完成";
    if (normalized === "node_blocked") return "节点阻塞";
    return value;
  }

  function formatProgressStatus(value) {
    const normalized = typeof value === "string" ? value.trim().toLowerCase() : "";
    if (!normalized) return "";
    if (normalized === "running" || normalized === "in_progress") return "运行中";
    if (normalized === "completed" || normalized === "done") return "已完成";
    if (normalized === "blocked") return "阻塞";
    if (normalized === "approved") return "已批准";
    if (normalized === "rejected") return "已拒绝";
    if (normalized === "expired") return "已过期";
    return value;
  }

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
    const source = runtimeBoardId ? "运行态 board-ref" : registryBoardId ? "任务注册表" : "-";

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
              <span class="goal-tracking-item-title">${escapeHtml(entry.title || formatProgressEvent(entry.event) || "时间线")}</span>
              <span class="memory-badge">${escapeHtml(formatProgressEvent(entry.event))}</span>
            </div>
            <div class="memory-list-item-meta">
              <span>${escapeHtml(formatDateTime(entry.at))}</span>
              ${entry.nodeId ? `<span>${escapeHtml(entry.nodeId)}</span>` : ""}
              ${entry.status ? `<span>${escapeHtml(formatProgressStatus(entry.status))}</span>` : ""}
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
    panel.innerHTML = '<div class="memory-viewer-empty">正在读取 goal handoff snapshot …</div>';
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

  function renderGoalHandoffPanel(goal, handoff, continuationState = null) {
    const panel = goalsDetailEl?.querySelector("#goalHandoffPanel");
    if (!panel || !goal) return;
    const effectiveContinuationState = continuationState || deriveContinuationStateFromHandoff(goal, handoff);
    const blockers = Array.isArray(handoff?.blockers) ? handoff.blockers.map((item) => formatStructuredListItem(item, item?.kind || "blocker")).filter(Boolean) : [];
    const openCheckpoints = Array.isArray(handoff?.openCheckpoints) ? handoff.openCheckpoints.map((item) => formatStructuredListItem(item, "checkpoint")).filter(Boolean) : [];
    const recentTimeline = Array.isArray(handoff?.recentProgress)
      ? handoff.recentProgress.map((item) => formatTimelineEntry(item)).filter(Boolean)
      : Array.isArray(handoff?.recentTimeline)
        ? handoff.recentTimeline.filter((item) => typeof item === "string" && item.trim())
        : [];
    const focusPlan = handoff?.focusCapability
      ? [
        handoff.focusCapability.planId,
        handoff.focusCapability.nodeId ? `node=${handoff.focusCapability.nodeId}` : "",
        handoff.focusCapability.executionMode || "",
        handoff.focusCapability.riskLevel ? `risk=${handoff.focusCapability.riskLevel}` : "",
        handoff.focusCapability.alignment ? `alignment=${handoff.focusCapability.alignment}` : "",
      ].filter(Boolean).join(" | ")
      : handoff?.focusPlan || "";
    const focusSummary = handoff?.focusCapability?.summary || handoff?.focusSummary || "";
    const openCheckpointCount = Number(
      handoff?.tracking?.openCheckpointCount
      ?? handoff?.tracking?.openCheckpoints
      ?? openCheckpoints.length,
    );

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
          <div class="goal-summary-title">交接摘要 / 恢复交接</div>
          <div class="goal-summary-text">从 goal runtime 重建当前长期任务的恢复建议、阻塞点与最近交接摘要。</div>
        </div>
        <span class="memory-badge memory-badge-shared">当前快照</span>
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
          <strong class="goal-summary-value">${escapeHtml(handoff.recommendedNodeId || handoff.resumeNode || "-")}</strong>
        </div>
        <div class="goal-summary-item">
          <span class="goal-summary-label">待处理 Checkpoint</span>
          <strong class="goal-summary-value">${escapeHtml(String(openCheckpointCount))}</strong>
        </div>
        <div class="goal-summary-item">
          <span class="goal-summary-label">阻塞项</span>
          <strong class="goal-summary-value">${escapeHtml(String(blockers.length))}</strong>
        </div>
        <div class="goal-summary-item">
          <span class="goal-summary-label">上次运行</span>
          <strong class="goal-summary-value">${escapeHtml(handoff.lastRunId || handoff.lastRun || "-")}</strong>
        </div>
      </div>

      <div class="goal-tracking-columns">
        <div class="goal-tracking-column">
          <div class="goal-summary-title">交接摘要</div>
          <div class="memory-list-item-snippet">${escapeHtml(handoff.summary || "暂无摘要")}</div>
          <div class="goal-summary-title">下一步建议</div>
          <div class="memory-list-item-snippet">${escapeHtml(handoff.nextAction || "暂无建议")}</div>
          <div class="goal-summary-title">跟踪快照</div>
          <div class="memory-list-item-meta">
            <span>节点 ${escapeHtml(String(handoff.tracking.totalNodes || "0"))}</span>
            <span>完成 ${escapeHtml(String(handoff.tracking.completedNodes || "0"))}</span>
            <span>进行中 ${escapeHtml(String(handoff.tracking.inProgressNodes || "0"))}</span>
            <span>阻塞 ${escapeHtml(String(handoff.tracking.blockedNodes || "0"))}</span>
            <span>Checkpoint ${escapeHtml(String(openCheckpointCount))}</span>
          </div>
          ${focusPlan ? `
            <div class="goal-summary-title">当前关注能力</div>
            <div class="memory-list-item-snippet">${escapeHtml(focusPlan)}</div>
            ${focusSummary ? `<div class="memory-list-item-snippet">${escapeHtml(focusSummary)}</div>` : ""}
          ` : ""}
          ${renderGoalContinuationSection(effectiveContinuationState)}
        </div>
        <div class="goal-tracking-column">
          <div class="goal-summary-title">阻塞 / 待处理</div>
          ${blockers.length || openCheckpoints.length ? `
            <div class="goal-tracking-list">
              ${blockers.map((item) => `
                <div class="goal-tracking-item">
                  <div class="memory-list-item-snippet">${escapeHtml(item)}</div>
                </div>
              `).join("")}
              ${openCheckpoints.map((item) => `
                <div class="goal-tracking-item">
                  <div class="memory-list-item-snippet">${escapeHtml(item)}</div>
                </div>
              `).join("")}
            </div>
          ` : '<div class="memory-viewer-empty">当前 handoff 中没有阻塞或待审批项。</div>'}

          <div class="goal-summary-title">最近时间线</div>
          ${recentTimeline.length ? `
            <div class="goal-tracking-list">
              ${recentTimeline.map((item) => `
                <div class="goal-tracking-item">
                  <div class="memory-list-item-snippet">${escapeHtml(item)}</div>
                </div>
              `).join("")}
            </div>
          ` : '<div class="memory-viewer-empty">handoff 中还没有最近时间线摘要。</div>'}
        </div>
      </div>

      <div class="goal-detail-actions">
        <button class="button" data-goal-generate-handoff="${escapeHtml(goal.id)}">刷新交接摘要</button>
        <button class="button goal-inline-action-secondary" data-open-source="${escapeHtml(goal.handoffPath)}">打开 handoff.md</button>
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
