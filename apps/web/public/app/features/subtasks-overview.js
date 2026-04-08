import { buildLaunchExplainabilityLines } from "./agent-launch-explainability.js";
import {
  buildContinuationAction,
  decodeContinuationAction,
  encodeContinuationAction,
  formatContinuationTargetLabel,
} from "./continuation-targets.js";
import { renderPromptSnapshotDetail } from "./prompt-snapshot-detail.js";

function formatSubtaskStatus(status) {
  switch (status) {
    case "running":
      return "运行中";
    case "done":
      return "已完成";
    case "error":
      return "失败";
    case "timeout":
      return "超时";
    case "stopped":
      return "已停止";
    default:
      return "等待中";
  }
}

function getStatusToneClass(status) {
  switch (status) {
    case "running":
      return "is-running";
    case "done":
      return "is-done";
    case "error":
      return "is-error";
    case "timeout":
      return "is-timeout";
    case "stopped":
      return "is-stopped";
    default:
      return "is-pending";
  }
}

function renderDetailCard(label, value, escapeHtml) {
  return `
    <div class="memory-detail-card">
      <span class="memory-detail-label">${escapeHtml(label)}</span>
      <div class="memory-detail-text">${escapeHtml(value || "-")}</div>
    </div>
  `;
}

function formatLaunchTimeout(timeoutMs) {
  const value = Number(timeoutMs);
  if (!Number.isFinite(value) || value <= 0) return "-";
  if (value % 1000 === 0) {
    return `${Math.round(value / 1000)}s`;
  }
  return `${value}ms`;
}

function formatWorktreeRuntimeStatus(status, t) {
  switch (status) {
    case "created":
      return t("subtasks.worktreeStatusCreated", {}, "created");
    case "missing":
      return t("subtasks.worktreeStatusMissing", {}, "missing");
    case "removed":
      return t("subtasks.worktreeStatusRemoved", {}, "removed");
    case "remove_failed":
      return t("subtasks.worktreeStatusRemoveFailed", {}, "remove_failed");
    case "failed":
      return t("subtasks.worktreeStatusFailed", {}, "failed");
    case "not_requested":
      return t("subtasks.worktreeStatusNotRequested", {}, "not_requested");
    default:
      return status || "-";
  }
}

function formatSteeringStatus(status, t) {
  switch (status) {
    case "delivered":
      return t("subtasks.steeringDelivered", {}, "Delivered");
    case "failed":
      return t("subtasks.steeringFailed", {}, "Failed");
    default:
      return t("subtasks.steeringAccepted", {}, "Accepted");
  }
}

function formatResumeStatus(status, t) {
  switch (status) {
    case "delivered":
      return t("subtasks.resumeDelivered", {}, "Delivered");
    case "failed":
      return t("subtasks.resumeFailed", {}, "Failed");
    default:
      return t("subtasks.resumeAccepted", {}, "Accepted");
  }
}

function formatJoinedValues(values) {
  if (!Array.isArray(values) || values.length === 0) return "-";
  const normalized = values
    .filter((item) => typeof item === "string" && item.trim())
    .map((item) => item.trim());
  return normalized.length ? normalized.join(", ") : "-";
}

function renderExplainabilityNote(lines, escapeHtml) {
  if (!Array.isArray(lines) || lines.length === 0) return "";
  return `
    <div class="tool-settings-policy-note">
      ${lines.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}
    </div>
  `;
}

function formatNotificationKindLabel(kind, t) {
  switch (kind) {
    case "failed":
      return t("subtasks.steeringFailed", {}, "Failed");
    case "completed":
      return t("subtasks.notificationCompleted", {}, "Completed");
    case "started":
      return t("subtasks.notificationStarted", {}, "Started");
    case "progress":
      return t("subtasks.notificationProgress", {}, "Progress");
    case "steering_requested":
      return t("subtasks.steeringAccepted", {}, "Accepted");
    case "steering_delivered":
      return t("subtasks.steeringDelivered", {}, "Delivered");
    case "steering_failed":
      return t("subtasks.steeringFailed", {}, "Failed");
    case "resume_requested":
      return t("subtasks.resumeAccepted", {}, "Accepted");
    case "resume_delivered":
      return t("subtasks.resumeDelivered", {}, "Delivered");
    case "resume_failed":
      return t("subtasks.resumeFailed", {}, "Failed");
    default:
      return kind || t("subtasks.notificationProgress", {}, "Progress");
  }
}

export function buildSubtaskExecutionExplainabilityLines({
  launchExplainability,
  resultEnvelope,
  promptSnapshotView,
  sessionId = "",
  summarizeSourcePath = (value) => value,
  formatDateTime = (value) => String(value ?? "-"),
  t = (_key, _params, fallback) => fallback ?? "",
}) {
  const lines = buildLaunchExplainabilityLines(launchExplainability, t);

  if (resultEnvelope && typeof resultEnvelope === "object") {
    const resultParts = [
      resultEnvelope.status ? `status=${resultEnvelope.status}` : "",
      resultEnvelope.agentId ? `agent=${resultEnvelope.agentId}` : "",
      resultEnvelope.finishedAt ? `finished=${formatDateTime(resultEnvelope.finishedAt)}` : "",
      resultEnvelope.outputPath ? `output=${summarizeSourcePath(resultEnvelope.outputPath)}` : "",
    ].filter(Boolean);
    if (resultParts.length) {
      lines.push(`${t("subtasks.detailExecutionResultEnvelope", {}, "result envelope")}: ${resultParts.join(", ")}`);
    }
  }

  const snapshot = promptSnapshotView?.snapshot;
  if (snapshot && typeof snapshot === "object") {
    const summary = snapshot.summary && typeof snapshot.summary === "object" ? snapshot.summary : {};
    const manifest = snapshot.manifest && typeof snapshot.manifest === "object" ? snapshot.manifest : {};
    const snapshotParts = [
      manifest.conversationId || sessionId ? `conversation=${manifest.conversationId || sessionId}` : "",
      Number.isFinite(summary.messageCount) ? `messages=${summary.messageCount}` : "",
      Number.isFinite(summary.tokenBreakdown?.systemPromptEstimatedTokens)
        ? `tokens=${summary.tokenBreakdown.systemPromptEstimatedTokens}`
        : "",
      manifest.createdAt ? `captured=${formatDateTime(manifest.createdAt)}` : "",
    ].filter(Boolean);
    if (snapshotParts.length) {
      lines.push(`${t("subtasks.detailExecutionPromptSnapshot", {}, "prompt snapshot")}: ${snapshotParts.join(", ")}`);
    }
  } else if (sessionId) {
    lines.push(`${t("subtasks.detailExecutionPromptSnapshot", {}, "prompt snapshot")}: missing for session=${sessionId}`);
  }

  return lines;
}

function describeWorktreeRuntimeStatus(status, t) {
  switch (status) {
    case "created":
      return t("subtasks.worktreeStatusDescCreated", {}, "The isolated worktree is present and can still be inspected.");
    case "missing":
      return t("subtasks.worktreeStatusDescMissing", {}, "A persisted worktree record exists, but the directory is missing on disk.");
    case "removed":
      return t("subtasks.worktreeStatusDescRemoved", {}, "The worktree has been cleaned up and removed after archive or recovery cleanup.");
    case "remove_failed":
      return t("subtasks.worktreeStatusDescRemoveFailed", {}, "Cleanup was attempted, but removing the worktree failed. Check the worktree error for details.");
    case "failed":
      return t("subtasks.worktreeStatusDescFailed", {}, "The worktree runtime failed before or during preparation.");
    case "not_requested":
      return t("subtasks.worktreeStatusDescNotRequested", {}, "This subtask did not request worktree isolation.");
    default:
      return t("subtasks.worktreeStatusDescUnknown", {}, "No additional worktree runtime note is available.");
  }
}

export function parseGoalSessionReference(conversationId) {
  const value = typeof conversationId === "string" ? conversationId.trim() : "";
  if (!value) return null;
  const goalNodeMatch = /^goal:([^:]+):node:([^:]+):run:([^:]+)$/.exec(value);
  if (goalNodeMatch) {
    return {
      kind: "goal_node",
      goalId: goalNodeMatch[1],
      nodeId: goalNodeMatch[2],
      runId: goalNodeMatch[3],
    };
  }
  const goalMatch = /^goal:([^:]+)$/.exec(value);
  if (goalMatch) {
    return {
      kind: "goal",
      goalId: goalMatch[1],
    };
  }
  return null;
}

export function findSubtaskBySessionId(items, sessionId) {
  const normalizedSessionId = typeof sessionId === "string" ? sessionId.trim() : "";
  if (!normalizedSessionId || !Array.isArray(items)) return null;
  return items.find((item) => typeof item?.sessionId === "string" && item.sessionId.trim() === normalizedSessionId) || null;
}

export function createSubtasksOverviewFeature({
  refs,
  isConnected,
  isViewActive,
  sendReq,
  makeId,
  getSubtasksState,
  getActiveConversationId,
  escapeHtml,
  formatDateTime,
  summarizeSourcePath,
  onOpenSourcePath,
  onOpenTask,
  onOpenGoal,
  onOpenContinuationAction,
  showNotice,
  t = (_key, _params, fallback) => fallback ?? "",
}) {
  const {
    subtasksSection,
    subtasksSummaryEl,
    subtasksListEl,
    subtasksDetailEl,
  } = refs;

  function getEmptyStateMessage(subtasksState) {
    if (subtasksState?.includeArchived === true) {
      return t("subtasks.emptyNoTasks", {}, "No subtasks to display.");
    }
    return t("subtasks.emptyNoVisibleTasks", {}, "No subtasks to display. Archived tasks are hidden by default.");
  }

  function renderSubtasksSummary(items) {
    if (!subtasksSummaryEl) return;
    const safeItems = Array.isArray(items) ? items : [];
    const runningCount = safeItems.filter((item) => item?.status === "running").length;
    const doneCount = safeItems.filter((item) => item?.status === "done").length;
    const failedCount = safeItems.filter((item) => item?.status === "error" || item?.status === "timeout" || item?.status === "stopped").length;

    subtasksSummaryEl.innerHTML = `
      <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("subtasks.statTasks", {}, "Subtasks"))}</span><strong class="memory-stat-value">${escapeHtml(String(safeItems.length))}</strong></div>
      <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("subtasks.statRunning", {}, "Running"))}</span><strong class="memory-stat-value">${escapeHtml(String(runningCount))}</strong></div>
      <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("subtasks.statDone", {}, "Done"))}</span><strong class="memory-stat-value">${escapeHtml(String(doneCount))}</strong></div>
      <div class="memory-stat-card"><span class="memory-stat-label">${escapeHtml(t("subtasks.statFailed", {}, "Failed"))}</span><strong class="memory-stat-value">${escapeHtml(String(failedCount))}</strong></div>
    `;
  }

  function renderSubtasksListEmpty(message) {
    if (!subtasksListEl) return;
    subtasksListEl.innerHTML = `<div class="memory-viewer-empty">${escapeHtml(message)}</div>`;
  }

  function renderSubtasksDetailEmpty(message) {
    if (!subtasksDetailEl) return;
    subtasksDetailEl.innerHTML = `<div class="memory-viewer-empty">${escapeHtml(message)}</div>`;
  }

  function renderSubtasksLoading(message) {
    renderSubtasksSummary([]);
    renderSubtasksListEmpty(message);
    renderSubtasksDetailEmpty(t("subtasks.detailSelect", {}, "Select a subtask on the left to view details."));
  }

  function renderSubtasksEmpty(message) {
    renderSubtasksSummary([]);
    renderSubtasksListEmpty(message);
    renderSubtasksDetailEmpty(t("subtasks.detailSelect", {}, "Select a subtask on the left to view details."));
  }

  function bindListActions() {
    if (!subtasksListEl) return;
    subtasksListEl.querySelectorAll("[data-subtask-id]").forEach((node) => {
      node.addEventListener("click", () => {
        const taskId = node.getAttribute("data-subtask-id");
        if (!taskId) return;
        const subtasksState = getSubtasksState();
        subtasksState.selectedId = taskId;
        renderSubtaskList(subtasksState.items);
        void loadSubtaskDetail(taskId);
      });
    });
  }

  function bindDetailActions() {
    if (!subtasksDetailEl) return;
    subtasksDetailEl.querySelectorAll("[data-open-output-path]").forEach((node) => {
      node.addEventListener("click", () => {
        const outputPath = node.getAttribute("data-open-output-path");
        if (!outputPath) return;
        void onOpenSourcePath(outputPath);
      });
    });
    subtasksDetailEl.querySelectorAll("[data-open-source]").forEach((node) => {
      node.addEventListener("click", () => {
        const sourcePath = node.getAttribute("data-open-source");
        if (!sourcePath) return;
        void onOpenSourcePath(sourcePath);
      });
    });
    subtasksDetailEl.querySelectorAll("[data-open-task-id]").forEach((node) => {
      node.addEventListener("click", () => {
        const taskId = node.getAttribute("data-open-task-id");
        if (!taskId) return;
        void onOpenTask?.(taskId);
      });
    });
    subtasksDetailEl.querySelectorAll("[data-open-goal-id]").forEach((node) => {
      node.addEventListener("click", () => {
        const goalId = node.getAttribute("data-open-goal-id");
        if (!goalId) return;
        void onOpenGoal?.(goalId);
      });
    });
    subtasksDetailEl.querySelectorAll("[data-continuation-action]").forEach((node) => {
      node.addEventListener("click", () => {
        if (typeof onOpenContinuationAction !== "function") return;
        const action = decodeContinuationAction(node.getAttribute("data-continuation-action") || "");
        if (!action) return;
        void onOpenContinuationAction(action);
      });
    });
    subtasksDetailEl.querySelectorAll("[data-subtask-stop]").forEach((node) => {
      node.addEventListener("click", () => {
        const taskId = node.getAttribute("data-subtask-stop");
        if (!taskId) return;
        void performSubtaskAction("subtask.stop", taskId);
      });
    });
    subtasksDetailEl.querySelectorAll("[data-subtask-archive]").forEach((node) => {
      node.addEventListener("click", () => {
        const taskId = node.getAttribute("data-subtask-archive");
        if (!taskId) return;
        const confirmed = window.confirm(t("subtasks.archiveConfirm", {}, "Archive this subtask?"));
        if (!confirmed) return;
        void performSubtaskAction("subtask.archive", taskId);
      });
    });
    subtasksDetailEl.querySelectorAll("[data-subtask-steering-send]").forEach((node) => {
      node.addEventListener("click", () => {
        const taskId = node.getAttribute("data-subtask-steering-send");
        if (!taskId) return;
        const input = subtasksDetailEl.querySelector(`[data-subtask-steering-input="${taskId}"]`);
        const message = typeof input?.value === "string" ? input.value.trim() : "";
        if (!message) return;
        void performSubtaskSteering(taskId, message);
      });
    });
    subtasksDetailEl.querySelectorAll("[data-subtask-steering-input]").forEach((node) => {
      node.addEventListener("input", () => {
        const taskId = node.getAttribute("data-subtask-steering-input");
        if (!taskId) return;
        const subtasksState = getSubtasksState();
        if (!subtasksState.steeringDrafts || typeof subtasksState.steeringDrafts !== "object") {
          subtasksState.steeringDrafts = {};
        }
        subtasksState.steeringDrafts[taskId] = node.value;
      });
    });
    subtasksDetailEl.querySelectorAll("[data-subtask-resume-send]").forEach((node) => {
      node.addEventListener("click", () => {
        const taskId = node.getAttribute("data-subtask-resume-send");
        if (!taskId) return;
        const input = subtasksDetailEl.querySelector(`[data-subtask-resume-input="${taskId}"]`);
        const message = typeof input?.value === "string" ? input.value.trim() : "";
        void performSubtaskResume(taskId, message);
      });
    });
    subtasksDetailEl.querySelectorAll("[data-subtask-resume-input]").forEach((node) => {
      node.addEventListener("input", () => {
        const taskId = node.getAttribute("data-subtask-resume-input");
        if (!taskId) return;
        const subtasksState = getSubtasksState();
        if (!subtasksState.resumeDrafts || typeof subtasksState.resumeDrafts !== "object") {
          subtasksState.resumeDrafts = {};
        }
        subtasksState.resumeDrafts[taskId] = node.value;
      });
    });
  }

  function renderSubtaskList(items) {
    if (!subtasksListEl) return;
    const safeItems = Array.isArray(items) ? items : [];
    if (!safeItems.length) {
      renderSubtasksListEmpty(getEmptyStateMessage(getSubtasksState()));
      return;
    }

    const subtasksState = getSubtasksState();
    const activeConversationId = getActiveConversationId();
    const isFilteredToConversation = Boolean(subtasksState.conversationId);
    const continuationFocusSessionId = typeof subtasksState.continuationFocusSessionId === "string"
      ? subtasksState.continuationFocusSessionId.trim()
      : "";

    subtasksListEl.innerHTML = safeItems.map((item) => {
      const isActive = item?.id === subtasksState.selectedId;
      const isCurrentConversation = !isFilteredToConversation
        && activeConversationId
        && item?.parentConversationId === activeConversationId;
      const isContinuationFocus = continuationFocusSessionId
        && typeof item?.sessionId === "string"
        && item.sessionId.trim() === continuationFocusSessionId;
      const progressText = item?.progress?.message || item?.summary || item?.instruction || "";
      return `
        <div class="memory-list-item subtask-list-item${isActive ? " active" : ""}${isContinuationFocus ? " is-continuation-focus" : ""}" data-subtask-id="${escapeHtml(item.id || "")}" data-subtask-session-id="${escapeHtml(item?.sessionId || "")}">
          <div class="subtask-list-item-head">
            <div class="memory-list-item-title">${escapeHtml(item.id || "-")}</div>
            <div class="memory-detail-badges">
              ${isCurrentConversation ? `<span class="memory-badge memory-badge-shared">${escapeHtml(t("subtasks.currentConversation", {}, "current"))}</span>` : ""}
              ${item?.archivedAt ? `<span class="memory-badge">${escapeHtml(t("subtasks.archivedBadge", {}, "archived"))}</span>` : ""}
              <span class="memory-badge subtask-status-badge ${getStatusToneClass(item?.status)}">${escapeHtml(formatSubtaskStatus(item?.status))}</span>
            </div>
          </div>
          <div class="memory-list-item-meta">
            <span>${escapeHtml(item?.agentId || "-")}</span>
            ${item?.sessionId ? `<span>${escapeHtml(item.sessionId)}</span>` : ""}
            <span>${escapeHtml(formatDateTime(item?.updatedAt || item?.createdAt))}</span>
          </div>
          <div class="memory-list-item-snippet">${escapeHtml(progressText || t("subtasks.noSummary", {}, "No summary yet."))}</div>
          <div class="memory-list-item-meta">
            <span>${escapeHtml(summarizeSourcePath(item?.parentConversationId || "-"))}</span>
            ${item?.outputPath ? `<span>${escapeHtml(summarizeSourcePath(item.outputPath))}</span>` : ""}
          </div>
        </div>
      `;
    }).join("");

    bindListActions();
  }

  function renderNotifications(items) {
    const safeItems = Array.isArray(items) ? items : [];
    if (!safeItems.length) {
      return `<div class="memory-detail-text">${escapeHtml(t("subtasks.noNotifications", {}, "No notifications yet."))}</div>`;
    }

    return `
      <div class="subtask-notification-list">
        ${safeItems.map((item) => `
          <div class="subtask-notification-item">
            <div class="subtask-notification-head">
              <span class="memory-badge subtask-status-badge ${getStatusToneClass(item?.kind === "failed" || item?.kind === "steering_failed" || item?.kind === "resume_failed" ? "error" : item?.kind === "completed" || item?.kind === "steering_delivered" || item?.kind === "resume_delivered" ? "done" : item?.kind === "started" || item?.kind === "progress" || item?.kind === "steering_requested" || item?.kind === "resume_requested" ? "running" : "pending")}">${escapeHtml(formatNotificationKindLabel(item?.kind, t))}</span>
              <span class="subtask-notification-meta">${escapeHtml(formatDateTime(item?.createdAt))}</span>
            </div>
            <div class="memory-detail-text">${escapeHtml(item?.message || "-")}</div>
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderSteeringRecords(items) {
    const safeItems = Array.isArray(items) ? items : [];
    if (!safeItems.length) {
      return `<div class="memory-detail-text">${escapeHtml(t("subtasks.noSteering", {}, "No steering requests yet."))}</div>`;
    }
    return `
      <div class="subtask-notification-list">
        ${safeItems.map((item) => `
          <div class="subtask-notification-item">
            <div class="subtask-notification-head">
              <span class="memory-badge subtask-status-badge ${getStatusToneClass(item?.status === "failed" ? "error" : item?.status === "delivered" ? "done" : "running")}">${escapeHtml(formatSteeringStatus(item?.status, t))}</span>
              <span class="subtask-notification-meta">${escapeHtml(formatDateTime(item?.deliveredAt || item?.requestedAt))}</span>
            </div>
            <div class="memory-detail-text">${escapeHtml(item?.message || "-")}</div>
            ${item?.error ? `<div class="memory-detail-text">${escapeHtml(item.error)}</div>` : ""}
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderResumeRecords(items) {
    const safeItems = Array.isArray(items) ? items : [];
    if (!safeItems.length) {
      return `<div class="memory-detail-text">${escapeHtml(t("subtasks.noResume", {}, "No resume requests yet."))}</div>`;
    }
    return `
      <div class="subtask-notification-list">
        ${safeItems.map((item) => `
          <div class="subtask-notification-item">
            <div class="subtask-notification-head">
              <span class="memory-badge subtask-status-badge ${getStatusToneClass(item?.status === "failed" ? "error" : item?.status === "delivered" ? "done" : "running")}">${escapeHtml(formatResumeStatus(item?.status, t))}</span>
              <span class="subtask-notification-meta">${escapeHtml(formatDateTime(item?.deliveredAt || item?.requestedAt))}</span>
            </div>
            <div class="memory-detail-text">${escapeHtml(item?.message || t("subtasks.resumeDefaultMessage", {}, "Continue from the last recorded state."))}</div>
            ${item?.resumedFromSessionId ? `<div class="memory-list-item-meta"><span>${escapeHtml(t("subtasks.detailResumeSourceSession", {}, "Resumed From"))}</span><span>${escapeHtml(item.resumedFromSessionId)}</span></div>` : ""}
            ${item?.error ? `<div class="memory-detail-text">${escapeHtml(item.error)}</div>` : ""}
          </div>
        `).join("")}
      </div>
    `;
  }

  function renderContinuationState(state) {
    if (!state || typeof state !== "object") return "";
    const checkpoints = state.checkpoints && typeof state.checkpoints === "object" ? state.checkpoints : {};
    const progress = state.progress && typeof state.progress === "object" ? state.progress : {};
    const recent = Array.isArray(progress.recent)
      ? progress.recent.filter((item) => typeof item === "string" && item.trim())
      : [];
    const labels = Array.isArray(checkpoints.labels)
      ? checkpoints.labels.filter((item) => typeof item === "string" && item.trim())
      : [];
    const targetText = formatContinuationTargetLabel(state);
    const targetAction = buildContinuationAction(state);
    const encodedTargetAction = encodeContinuationAction(targetAction);
    const targetMarkup = state.recommendedTargetId && encodedTargetAction
      ? `
        <button
          type="button"
          class="button goal-inline-action-secondary"
          data-continuation-action="${escapeHtml(encodedTargetAction)}"
        >${escapeHtml(targetText)}</button>
      `
      : escapeHtml(targetText);

    return `
      <section class="memory-detail-card">
        <span class="memory-detail-label">${escapeHtml(t("subtasks.detailContinuation", {}, "Continuation State"))}</span>
        <div class="memory-detail-grid">
          ${renderDetailCard(t("subtasks.detailContinuationMode", {}, "Resume Mode"), state.resumeMode || "-", escapeHtml)}
          ${renderDetailCard(t("subtasks.detailContinuationNextAction", {}, "Next Action"), state.nextAction || "-", escapeHtml)}
          ${renderDetailCard(t("subtasks.detailContinuationCheckpoints", {}, "Open Checkpoints"), String(Number(checkpoints.openCount || 0)), escapeHtml)}
          ${renderDetailCard(t("subtasks.detailContinuationBlockers", {}, "Blockers"), String(Number(checkpoints.blockerCount || 0)), escapeHtml)}
          ${renderDetailCard(t("subtasks.detailContinuationProgress", {}, "Current Progress"), progress.current || "-", escapeHtml)}
          <div class="memory-detail-card">
            <span class="memory-detail-label">${escapeHtml(t("subtasks.detailContinuationTarget", {}, "Recommended Target"))}</span>
            <div class="memory-detail-text">${targetMarkup}</div>
          </div>
        </div>
        <div class="memory-detail-text">${escapeHtml(state.summary || "-")}</div>
        ${labels.length ? `<div class="memory-list-item-meta"><span>${escapeHtml(labels.join(" | "))}</span></div>` : ""}
        ${recent.length ? `
          <div class="subtask-notification-list">
            ${recent.map((item) => `
              <div class="subtask-notification-item">
                <div class="memory-detail-text">${escapeHtml(item)}</div>
              </div>
            `).join("")}
          </div>
        ` : `<div class="memory-detail-text">${escapeHtml(t("subtasks.detailContinuationRecentEmpty", {}, "No recent continuation events."))}</div>`}
      </section>
    `;
  }

  function renderSubtaskDetail(item, outputContent = "") {
    if (!subtasksDetailEl) return;
    if (!item) {
      renderSubtasksDetailEmpty(t("subtasks.detailSelect", {}, "Select a subtask on the left to view details."));
      return;
    }

    const subtasksState = getSubtasksState();
    const pendingActionKind = subtasksState.pendingActionTaskId === item.id ? subtasksState.pendingActionKind : null;
    const canStop = item.status === "pending" || item.status === "running";
    const canArchive = !item.archivedAt && (item.status === "done" || item.status === "error" || item.status === "timeout" || item.status === "stopped");
    const canResume = !item.archivedAt && (item.status === "done" || item.status === "error" || item.status === "timeout" || item.status === "stopped");
    const outputText = typeof outputContent === "string" && outputContent.trim()
      ? outputContent
      : item?.outputPreview || "";
    const resultEnvelope = subtasksState.selectedResultEnvelope && subtasksState.selectedResultEnvelope.taskId === item.id
      ? subtasksState.selectedResultEnvelope
      : null;
    const launchExplainability = subtasksState.selectedLaunchExplainability?.taskId === item.id
      ? subtasksState.selectedLaunchExplainability.value
      : null;
    const promptSnapshotView = subtasksState.selectedPromptSnapshot?.taskId === item.id
      ? subtasksState.selectedPromptSnapshot.value
      : null;
    const continuationState = subtasksState.selectedContinuationState?.taskId === item.id
      ? subtasksState.selectedContinuationState.value
      : null;
    const launchExplainabilityLines = buildLaunchExplainabilityLines(launchExplainability, t);
    const executionExplainabilityLines = buildSubtaskExecutionExplainabilityLines({
      launchExplainability,
      resultEnvelope,
      promptSnapshotView,
      sessionId: item?.sessionId || "",
      summarizeSourcePath,
      formatDateTime,
      t,
    });
    const delegation = item?.launchSpec?.delegation && typeof item.launchSpec.delegation === "object"
      ? item.launchSpec.delegation
      : null;
    const worktreeStatus = item?.launchSpec?.worktreeStatus || "";
    const worktreeStatusLabel = formatWorktreeRuntimeStatus(worktreeStatus, t);
    const worktreeStatusDescription = describeWorktreeRuntimeStatus(worktreeStatus, t);
    const parentTaskId = typeof item?.launchSpec?.parentTaskId === "string" ? item.launchSpec.parentTaskId.trim() : "";
    const worktreePath = typeof item?.launchSpec?.worktreePath === "string" ? item.launchSpec.worktreePath.trim() : "";
    const goalSession = parseGoalSessionReference(item.parentConversationId);
    const steeringRecords = Array.isArray(item?.steering) ? item.steering : [];
    const steeringDraft = typeof subtasksState.steeringDrafts?.[item.id] === "string"
      ? subtasksState.steeringDrafts[item.id]
      : "";
    const resumeRecords = Array.isArray(item?.resume) ? item.resume : [];
    const resumeDraft = typeof subtasksState.resumeDrafts?.[item.id] === "string"
      ? subtasksState.resumeDrafts[item.id]
      : "";
    const continuationFocusSessionId = typeof subtasksState.continuationFocusSessionId === "string"
      ? subtasksState.continuationFocusSessionId.trim()
      : "";
    const isContinuationFocus = continuationFocusSessionId
      && typeof item?.sessionId === "string"
      && item.sessionId.trim() === continuationFocusSessionId;
    const detailActionButtons = [];
    if (canStop) {
      detailActionButtons.push(`<button class="button" data-subtask-stop="${escapeHtml(item.id)}" ${pendingActionKind ? "disabled" : ""}>${escapeHtml(pendingActionKind === "stop" ? t("subtasks.actionStopping", {}, "Stopping...") : t("subtasks.actionStop", {}, "Stop"))}</button>`);
    }
    if (canArchive) {
      detailActionButtons.push(`<button class="button" data-subtask-archive="${escapeHtml(item.id)}" ${pendingActionKind ? "disabled" : ""}>${escapeHtml(pendingActionKind === "archive" ? t("subtasks.actionArchiving", {}, "Archiving...") : t("subtasks.actionArchive", {}, "Archive"))}</button>`);
    }
    if (goalSession?.goalId) {
      detailActionButtons.push(`<button class="button goal-inline-action-secondary" data-open-goal-id="${escapeHtml(goalSession.goalId)}">${escapeHtml(t("subtasks.openGoal", {}, "Open long task"))}</button>`);
    }
    if (parentTaskId) {
      detailActionButtons.push(`<button class="button goal-inline-action-secondary" data-open-task-id="${escapeHtml(parentTaskId)}">${escapeHtml(t("subtasks.openParentTask", {}, "Open parent task"))}</button>`);
    }
    if (worktreePath) {
      detailActionButtons.push(`<button class="button goal-inline-action-secondary" data-open-source="${escapeHtml(worktreePath)}">${escapeHtml(t("subtasks.openWorktree", {}, "Open worktree"))}</button>`);
    }

    subtasksDetailEl.innerHTML = `
      <div class="memory-detail-shell${isContinuationFocus ? " is-continuation-focus" : ""}" data-subtask-session-focus="${escapeHtml(item?.sessionId || "")}">
        <div class="memory-detail-header">
          <div>
            <div class="memory-detail-title">${escapeHtml(item.id || "-")}</div>
            <div class="memory-list-item-meta">
              <span>${escapeHtml(item.agentId || "-")}</span>
              ${item?.sessionId ? `<span>${escapeHtml(item.sessionId)}</span>` : ""}
              <span>${escapeHtml(formatDateTime(item.updatedAt || item.createdAt))}</span>
            </div>
          </div>
          <div class="memory-detail-badges">
            <span class="memory-badge">${escapeHtml(item.kind || "sub_agent")}</span>
            <span class="memory-badge subtask-status-badge ${getStatusToneClass(item.status)}">${escapeHtml(formatSubtaskStatus(item.status))}</span>
            ${item.archivedAt ? `<span class="memory-badge">${escapeHtml(t("subtasks.archivedBadge", {}, "archived"))}</span>` : ""}
          </div>
        </div>

        ${detailActionButtons.length ? `
          <div class="subtask-detail-actions">
            ${detailActionButtons.join("")}
          </div>
        ` : ""}

        <div class="memory-detail-grid">
          ${renderDetailCard(t("subtasks.detailParentConversation", {}, "Parent Conversation"), item.parentConversationId, escapeHtml)}
          <div class="memory-detail-card${isContinuationFocus ? " is-continuation-focus" : ""}">
            <span class="memory-detail-label">${escapeHtml(t("subtasks.detailSessionId", {}, "Session ID"))}</span>
            <div class="memory-detail-text">${escapeHtml(item.sessionId || "-")}</div>
          </div>
          ${renderDetailCard(t("subtasks.detailAgentId", {}, "Agent"), item.agentId || "-", escapeHtml)}
          ${renderDetailCard(t("subtasks.detailLaunchProfile", {}, "Launch Profile"), item?.launchSpec?.profileId || "-", escapeHtml)}
          ${renderDetailCard(t("subtasks.detailLaunchChannel", {}, "Launch Channel"), item?.launchSpec?.channel || "-", escapeHtml)}
          ${renderDetailCard(t("subtasks.detailLaunchTimeout", {}, "Launch Timeout"), formatLaunchTimeout(item?.launchSpec?.timeoutMs), escapeHtml)}
          ${renderDetailCard(t("subtasks.detailLaunchBackground", {}, "Background"), item?.launchSpec?.background === true ? t("subtasks.boolYes", {}, "Yes") : item?.launchSpec?.background === false ? t("subtasks.boolNo", {}, "No") : "-", escapeHtml)}
          ${renderDetailCard(t("subtasks.detailCreatedAt", {}, "Created At"), formatDateTime(item.createdAt), escapeHtml)}
          ${renderDetailCard(t("subtasks.detailUpdatedAt", {}, "Updated At"), formatDateTime(item.updatedAt), escapeHtml)}
          ${renderDetailCard(t("subtasks.detailFinishedAt", {}, "Finished At"), formatDateTime(item.finishedAt), escapeHtml)}
          ${renderDetailCard(t("subtasks.detailArchivedAt", {}, "Archived At"), formatDateTime(item.archivedAt), escapeHtml)}
        </div>

        <div class="subtask-detail-sections">
          <section class="memory-detail-card">
            <span class="memory-detail-label">${escapeHtml(t("subtasks.detailInstruction", {}, "Instruction"))}</span>
            <pre class="memory-detail-pre">${escapeHtml(item.instruction || "-")}</pre>
          </section>

          <section class="memory-detail-card">
            <span class="memory-detail-label">${escapeHtml(t("subtasks.detailSummary", {}, "Summary"))}</span>
            <div class="memory-detail-text">${escapeHtml(item.summary || t("subtasks.noSummary", {}, "No summary yet."))}</div>
          </section>

          <section class="memory-detail-card">
            <span class="memory-detail-label">${escapeHtml(t("subtasks.detailProgress", {}, "Progress"))}</span>
            <div class="memory-detail-text">${escapeHtml(item?.progress?.message || "-")}</div>
          </section>

          ${renderContinuationState(continuationState)}

          <section class="memory-detail-card">
            <span class="memory-detail-label">${escapeHtml(t("subtasks.detailSteering", {}, "Steering"))}</span>
            ${item.status === "running" ? `
              <div class="subtask-steering-panel">
                <textarea class="editor-textarea subtask-steering-input" rows="4" data-subtask-steering-input="${escapeHtml(item.id)}" placeholder="${escapeHtml(t("subtasks.steeringPlaceholder", {}, "Describe how this running subtask should adjust its next attempt."))}" ${pendingActionKind === "steering" ? "disabled" : ""}>${escapeHtml(steeringDraft)}</textarea>
                <div class="subtask-detail-actions">
                  <button class="button" data-subtask-steering-send="${escapeHtml(item.id)}" ${pendingActionKind === "steering" ? "disabled" : ""}>${escapeHtml(pendingActionKind === "steering" ? t("subtasks.actionSteering", {}, "Sending...") : t("subtasks.actionSteer", {}, "Send steering"))}</button>
                </div>
              </div>
            ` : ""}
            ${renderSteeringRecords(steeringRecords)}
          </section>

          <section class="memory-detail-card">
            <span class="memory-detail-label">${escapeHtml(t("subtasks.detailResume", {}, "Resume"))}</span>
            ${canResume ? `
              <div class="subtask-steering-panel">
                <textarea class="editor-textarea subtask-steering-input" rows="4" data-subtask-resume-input="${escapeHtml(item.id)}" placeholder="${escapeHtml(t("subtasks.resumePlaceholder", {}, "Optionally describe how this finished subtask should continue from its last recorded state."))}" ${pendingActionKind === "resume" ? "disabled" : ""}>${escapeHtml(resumeDraft)}</textarea>
                <div class="subtask-detail-actions">
                  <button class="button" data-subtask-resume-send="${escapeHtml(item.id)}" ${pendingActionKind === "resume" ? "disabled" : ""}>${escapeHtml(pendingActionKind === "resume" ? t("subtasks.actionResuming", {}, "Resuming...") : t("subtasks.actionResume", {}, "Resume"))}</button>
                </div>
              </div>
            ` : ""}
            ${renderResumeRecords(resumeRecords)}
          </section>

          ${executionExplainabilityLines.length ? `
            <section class="memory-detail-card">
              <span class="memory-detail-label">${escapeHtml(t("subtasks.detailExecutionExplainability", {}, "Execution Explainability"))}</span>
              ${renderExplainabilityNote(executionExplainabilityLines, escapeHtml)}
            </section>
          ` : ""}

          ${launchExplainabilityLines.length ? `
            <section class="memory-detail-card">
              <span class="memory-detail-label">${escapeHtml(t("subtasks.detailLaunchExplainability", {}, "Launch Explainability"))}</span>
              ${renderExplainabilityNote(launchExplainabilityLines, escapeHtml)}
            </section>
          ` : ""}

          ${item?.sessionId
            ? renderPromptSnapshotDetail(promptSnapshotView, {
              escapeHtml,
              formatDateTime,
              t,
              sessionId: item.sessionId,
            })
            : ""}

          <section class="memory-detail-card">
            <span class="memory-detail-label">${escapeHtml(t("subtasks.detailLaunchSpec", {}, "Launch Spec"))}</span>
            <div class="memory-detail-grid">
              ${renderDetailCard(t("subtasks.detailLaunchPermission", {}, "Permission Mode"), item?.launchSpec?.permissionMode || "-", escapeHtml)}
              ${renderDetailCard(t("subtasks.detailLaunchIsolation", {}, "Isolation"), item?.launchSpec?.isolationMode || "-", escapeHtml)}
              ${renderDetailCard(t("subtasks.detailLaunchRole", {}, "Launch Role"), item?.launchSpec?.role || "-", escapeHtml)}
              ${renderDetailCard(t("subtasks.detailLaunchRolePolicy", {}, "Role Policy"), item?.launchSpec?.policySummary || "-", escapeHtml)}
              ${renderDetailCard(t("subtasks.detailLaunchParentTask", {}, "Parent Task"), item?.launchSpec?.parentTaskId || "-", escapeHtml)}
              ${renderDetailCard(t("subtasks.detailLaunchCwd", {}, "Launch CWD"), item?.launchSpec?.cwd || "-", escapeHtml)}
              ${renderDetailCard(t("subtasks.detailLaunchResolvedCwd", {}, "Resolved CWD"), item?.launchSpec?.resolvedCwd || item?.launchSpec?.cwd || "-", escapeHtml)}
              ${renderDetailCard(t("subtasks.detailLaunchWorktreeStatus", {}, "Worktree Runtime"), worktreeStatusLabel, escapeHtml)}
              ${renderDetailCard(t("subtasks.detailLaunchWorktreePath", {}, "Worktree Path"), item?.launchSpec?.worktreePath || "-", escapeHtml)}
              ${renderDetailCard(t("subtasks.detailLaunchWorktreeRepo", {}, "Worktree Repo"), item?.launchSpec?.worktreeRepoRoot || "-", escapeHtml)}
              ${renderDetailCard(t("subtasks.detailLaunchWorktreeBranch", {}, "Worktree Branch"), item?.launchSpec?.worktreeBranch || "-", escapeHtml)}
              ${renderDetailCard(t("subtasks.detailLaunchToolSet", {}, "Tool Set"), Array.isArray(item?.launchSpec?.toolSet) && item.launchSpec.toolSet.length ? item.launchSpec.toolSet.join(", ") : "-", escapeHtml)}
              ${renderDetailCard(t("subtasks.detailLaunchAllowedFamilies", {}, "Allowed Families"), Array.isArray(item?.launchSpec?.allowedToolFamilies) && item.launchSpec.allowedToolFamilies.length ? item.launchSpec.allowedToolFamilies.join(", ") : "-", escapeHtml)}
              ${renderDetailCard(t("subtasks.detailLaunchMaxRisk", {}, "Max Risk"), item?.launchSpec?.maxToolRiskLevel || "-", escapeHtml)}
              ${renderDetailCard(t("subtasks.detailLaunchContextKeys", {}, "Context Keys"), Array.isArray(item?.launchSpec?.contextKeys) && item.launchSpec.contextKeys.length ? item.launchSpec.contextKeys.join(", ") : "-", escapeHtml)}
            </div>
          </section>

          ${delegation ? `
            <section class="memory-detail-card">
              <span class="memory-detail-label">${escapeHtml(t("subtasks.detailDelegationProtocol", {}, "Delegation Protocol"))}</span>
              <div class="memory-detail-grid">
                ${renderDetailCard(t("subtasks.detailDelegationSource", {}, "Delegation Source"), delegation.source || "-", escapeHtml)}
                ${renderDetailCard(t("subtasks.detailDelegationIntentKind", {}, "Intent Kind"), delegation.intentKind || "-", escapeHtml)}
                ${renderDetailCard(t("subtasks.detailDelegationIntent", {}, "Intent"), delegation.intentSummary || "-", escapeHtml)}
                ${renderDetailCard(t("subtasks.detailDelegationDeliverable", {}, "Deliverable"), delegation.expectedDeliverableFormat || "-", escapeHtml)}
                ${renderDetailCard(t("subtasks.detailDelegationDeliverableSummary", {}, "Deliverable Summary"), delegation.expectedDeliverableSummary || "-", escapeHtml)}
                ${renderDetailCard(t("subtasks.detailDelegationAggregation", {}, "Aggregation"), delegation.aggregationMode || "-", escapeHtml)}
                ${renderDetailCard(t("subtasks.detailDelegationSourceAgents", {}, "Source Agents"), formatJoinedValues(delegation.sourceAgentIds), escapeHtml)}
                ${renderDetailCard(t("subtasks.detailDelegationContextKeys", {}, "Delegation Context Keys"), formatJoinedValues(delegation.contextKeys), escapeHtml)}
              </div>
            </section>
          ` : ""}

          ${resultEnvelope ? `
            <section class="memory-detail-card">
              <span class="memory-detail-label">${escapeHtml(t("subtasks.detailResultEnvelope", {}, "Result Envelope"))}</span>
              <div class="memory-detail-grid">
                ${renderDetailCard(t("subtasks.detailResultEnvelopeStatus", {}, "Envelope Status"), resultEnvelope.status || "-", escapeHtml)}
                ${renderDetailCard(t("subtasks.detailResultEnvelopeAgent", {}, "Envelope Agent"), resultEnvelope.agentId || "-", escapeHtml)}
                ${renderDetailCard(t("subtasks.detailResultEnvelopeFinishedAt", {}, "Envelope Finished At"), formatDateTime(resultEnvelope.finishedAt), escapeHtml)}
                ${renderDetailCard(t("subtasks.detailResultEnvelopeOutputPath", {}, "Envelope Output Path"), resultEnvelope.outputPath || "-", escapeHtml)}
              </div>
              <div class="memory-detail-text">${escapeHtml(resultEnvelope.summary || "-")}</div>
            </section>
          ` : ""}

          ${worktreeStatus ? `
            <section class="memory-detail-card">
              <span class="memory-detail-label">${escapeHtml(t("subtasks.detailLaunchWorktreeStatusNote", {}, "Worktree Status Note"))}</span>
              <div class="memory-detail-text">${escapeHtml(worktreeStatusDescription)}</div>
            </section>
          ` : ""}

          ${item?.launchSpec?.worktreeError ? `
            <section class="memory-detail-card">
              <span class="memory-detail-label">${escapeHtml(t("subtasks.detailLaunchWorktreeError", {}, "Worktree Error"))}</span>
              <pre class="memory-detail-pre">${escapeHtml(item.launchSpec.worktreeError)}</pre>
            </section>
          ` : ""}

          ${item?.error ? `
            <section class="memory-detail-card">
              <span class="memory-detail-label">${escapeHtml(t("subtasks.detailError", {}, "Error"))}</span>
              <pre class="memory-detail-pre">${escapeHtml(item.error)}</pre>
            </section>
          ` : ""}

          ${item?.archiveReason ? `
            <section class="memory-detail-card">
              <span class="memory-detail-label">${escapeHtml(t("subtasks.detailArchiveReason", {}, "Archive Reason"))}</span>
              <div class="memory-detail-text">${escapeHtml(item.archiveReason)}</div>
            </section>
          ` : ""}

          <section class="memory-detail-card">
            <span class="memory-detail-label">${escapeHtml(t("subtasks.detailNotifications", {}, "Notifications"))}</span>
            ${renderNotifications(item.notifications)}
          </section>

          <section class="memory-detail-card">
            <div class="subtask-output-header">
              <span class="memory-detail-label">${escapeHtml(t("subtasks.detailOutput", {}, "Output"))}</span>
              ${item?.outputPath ? `<button class="memory-path-link" data-open-output-path="${escapeHtml(item.outputPath)}">${escapeHtml(t("subtasks.openOutputPath", {}, "Open output path"))}</button>` : ""}
            </div>
            ${item?.outputPath ? `<div class="memory-list-item-meta"><span>${escapeHtml(t("subtasks.detailOutputPath", {}, "Output Path"))}</span><span>${escapeHtml(item.outputPath)}</span></div>` : ""}
            ${outputText
              ? `<pre class="memory-detail-pre">${escapeHtml(outputText)}</pre>`
              : `<div class="memory-detail-text">${escapeHtml(t("subtasks.noOutput", {}, "No output yet."))}</div>`}
          </section>
        </div>
      </div>
    `;

    bindDetailActions();
  }

  async function loadSubtaskDetail(taskId, options = {}) {
    if (!taskId) return;
    const subtasksState = getSubtasksState();
    const seq = subtasksState.detailSeq + 1;
    subtasksState.detailSeq = seq;
    subtasksState.detailLoading = true;
    renderSubtaskList(subtasksState.items);
    if (!options.quiet) {
      renderSubtasksDetailEmpty(t("subtasks.detailLoading", {}, "Loading subtask details..."));
    }

    const res = await sendReq({
      type: "req",
      id: makeId(),
      method: "subtask.get",
      params: { taskId },
    });

    if (seq !== subtasksState.detailSeq) return;
    subtasksState.detailLoading = false;

    if (!res || !res.ok || !res.payload?.item) {
      subtasksState.selectedItem = null;
      subtasksState.selectedOutputContent = "";
      subtasksState.selectedContinuationState = null;
      subtasksState.selectedResultEnvelope = null;
      subtasksState.selectedLaunchExplainability = null;
      subtasksState.selectedPromptSnapshot = null;
      renderSubtasksDetailEmpty(res?.error?.message || t("subtasks.detailLoadFailed", {}, "Failed to load subtask details."));
      return;
    }

    const item = res.payload.item;
    subtasksState.selectedId = item.id;
    subtasksState.selectedItem = item;
    subtasksState.selectedOutputContent = typeof res.payload.outputContent === "string" ? res.payload.outputContent : "";
    subtasksState.selectedContinuationState = res.payload?.continuationState && typeof res.payload.continuationState === "object"
      ? { taskId: item.id, value: res.payload.continuationState }
      : null;
    subtasksState.selectedResultEnvelope = res.payload?.resultEnvelope && typeof res.payload.resultEnvelope === "object"
      ? res.payload.resultEnvelope
      : null;
    subtasksState.selectedLaunchExplainability = res.payload?.launchExplainability && typeof res.payload.launchExplainability === "object"
      ? { taskId: item.id, value: res.payload.launchExplainability }
      : null;
    subtasksState.selectedPromptSnapshot = res.payload?.promptSnapshotView && typeof res.payload.promptSnapshotView === "object"
      ? { taskId: item.id, value: res.payload.promptSnapshotView }
      : null;
    subtasksState.items = subtasksState.items.map((current) => current?.id === item.id ? item : current);
    renderSubtasksSummary(subtasksState.items);
    renderSubtaskList(subtasksState.items);
    renderSubtaskDetail(item, subtasksState.selectedOutputContent);
  }

  async function performSubtaskAction(method, taskId) {
    const subtasksState = getSubtasksState();
    const item = Array.isArray(subtasksState.items)
      ? subtasksState.items.find((current) => current?.id === taskId) || subtasksState.selectedItem
      : subtasksState.selectedItem;
    if (!item) return;

    subtasksState.pendingActionTaskId = taskId;
    subtasksState.pendingActionKind = method === "subtask.stop" ? "stop" : "archive";
    if (subtasksState.selectedItem?.id === taskId) {
      renderSubtaskDetail(subtasksState.selectedItem, subtasksState.selectedOutputContent);
    } else {
      renderSubtaskList(subtasksState.items);
    }

    const res = await sendReq({
      type: "req",
      id: makeId(),
      method,
      params: { taskId },
    });

    subtasksState.pendingActionTaskId = null;
    subtasksState.pendingActionKind = null;

    if (!res || !res.ok || !res.payload?.item) {
      if (subtasksState.selectedItem?.id === taskId) {
        renderSubtaskDetail(subtasksState.selectedItem, subtasksState.selectedOutputContent);
      } else {
        renderSubtaskList(subtasksState.items);
      }
      showNotice?.(
        method === "subtask.stop"
          ? t("subtasks.stopFailedTitle", {}, "Stop failed")
          : t("subtasks.archiveFailedTitle", {}, "Archive failed"),
        res?.error?.message || (method === "subtask.stop"
          ? t("subtasks.stopFailed", {}, "Failed to stop subtask.")
          : t("subtasks.archiveFailed", {}, "Failed to archive subtask.")),
        "error",
      );
      return;
    }

    handleSubtaskUpdate({
      kind: method === "subtask.stop" ? "stopped" : "archived",
      item: res.payload.item,
    });
    showNotice?.(
      method === "subtask.stop"
        ? t("subtasks.stopSuccessTitle", {}, "Subtask stopped")
        : t("subtasks.archiveSuccessTitle", {}, "Subtask archived"),
      method === "subtask.stop"
        ? t("subtasks.stopSuccess", {}, "The subtask has been stopped.")
        : t("subtasks.archiveSuccess", {}, "The subtask has been archived."),
      "info",
    );
  }

  async function performSubtaskSteering(taskId, message) {
    const subtasksState = getSubtasksState();
    subtasksState.pendingActionTaskId = taskId;
    subtasksState.pendingActionKind = "steering";
    if (subtasksState.selectedItem?.id === taskId) {
      renderSubtaskDetail(subtasksState.selectedItem, subtasksState.selectedOutputContent);
    }

    const res = await sendReq({
      type: "req",
      id: makeId(),
      method: "subtask.update",
      params: { taskId, message },
    });

    subtasksState.pendingActionTaskId = null;
    subtasksState.pendingActionKind = null;

    if (!res || !res.ok || !res.payload?.item) {
      if (subtasksState.selectedItem?.id === taskId) {
        renderSubtaskDetail(subtasksState.selectedItem, subtasksState.selectedOutputContent);
      }
      showNotice?.(
        t("subtasks.steeringFailedTitle", {}, "Steering failed"),
        res?.error?.message || t("subtasks.steeringFailedMessage", {}, "Failed to send steering to the running subtask."),
        "error",
      );
      return;
    }

    if (!subtasksState.steeringDrafts || typeof subtasksState.steeringDrafts !== "object") {
      subtasksState.steeringDrafts = {};
    }
    subtasksState.steeringDrafts[taskId] = "";
    handleSubtaskUpdate({
      kind: "updated",
      item: res.payload.item,
    });
    showNotice?.(
      t("subtasks.steeringSuccessTitle", {}, "Steering accepted"),
      t("subtasks.steeringSuccessMessage", {}, "The running subtask accepted the steering request and is relaunching with the new guidance."),
      "info",
    );
  }

  async function performSubtaskResume(taskId, message) {
    const subtasksState = getSubtasksState();
    subtasksState.pendingActionTaskId = taskId;
    subtasksState.pendingActionKind = "resume";
    if (subtasksState.selectedItem?.id === taskId) {
      renderSubtaskDetail(subtasksState.selectedItem, subtasksState.selectedOutputContent);
    }

    const res = await sendReq({
      type: "req",
      id: makeId(),
      method: "subtask.resume",
      params: { taskId, ...(message ? { message } : {}) },
    });

    subtasksState.pendingActionTaskId = null;
    subtasksState.pendingActionKind = null;

    if (!res || !res.ok || !res.payload?.item) {
      if (subtasksState.selectedItem?.id === taskId) {
        renderSubtaskDetail(subtasksState.selectedItem, subtasksState.selectedOutputContent);
      }
      showNotice?.(
        t("subtasks.resumeFailedTitle", {}, "Resume failed"),
        res?.error?.message || t("subtasks.resumeFailedMessage", {}, "Failed to resume the finished subtask."),
        "error",
      );
      return;
    }

    if (!subtasksState.resumeDrafts || typeof subtasksState.resumeDrafts !== "object") {
      subtasksState.resumeDrafts = {};
    }
    subtasksState.resumeDrafts[taskId] = "";
    handleSubtaskUpdate({
      kind: "updated",
      item: res.payload.item,
    });
    showNotice?.(
      t("subtasks.resumeSuccessTitle", {}, "Resume accepted"),
      t("subtasks.resumeSuccessMessage", {}, "The finished subtask accepted the resume request and is relaunching from its last recorded state."),
      "info",
    );
  }

  async function loadSubtasks(forceSelectFirst = false) {
    if (!subtasksSection) return;
    if (!isConnected()) {
      const subtasksState = getSubtasksState();
      subtasksState.loading = false;
      subtasksState.detailLoading = false;
      renderSubtasksLoading(t("subtasks.loadingDisconnected", {}, "Disconnected"));
      return;
    }

    const subtasksState = getSubtasksState();
    subtasksState.loading = true;
    subtasksState.detailLoading = false;
    const seq = subtasksState.loadSeq + 1;
    subtasksState.loadSeq = seq;
    renderSubtasksLoading(t("subtasks.loading", {}, "Loading..."));

    const activeConversationId = getActiveConversationId();
    const linkedSessionContext = subtasksState.linkedSessionContext && typeof subtasksState.linkedSessionContext === "object"
      ? subtasksState.linkedSessionContext
      : null;
    const effectiveConversationId = activeConversationId
      && linkedSessionContext?.sessionId === activeConversationId
      && linkedSessionContext.parentConversationId
      ? linkedSessionContext.parentConversationId
      : activeConversationId;
    const params = {
      ...(effectiveConversationId ? { conversationId: effectiveConversationId } : {}),
      includeArchived: subtasksState.includeArchived === true,
    };
    const res = await sendReq({
      type: "req",
      id: makeId(),
      method: "subtask.list",
      params,
    });

    if (seq !== subtasksState.loadSeq) return;
    subtasksState.loading = false;

    if (!res || !res.ok || !Array.isArray(res.payload?.items)) {
      subtasksState.items = [];
      subtasksState.selectedId = null;
      subtasksState.selectedItem = null;
      subtasksState.selectedOutputContent = "";
      subtasksState.selectedContinuationState = null;
      subtasksState.selectedResultEnvelope = null;
      subtasksState.selectedLaunchExplainability = null;
      subtasksState.selectedPromptSnapshot = null;
      renderSubtasksEmpty(res?.error?.message || t("subtasks.listLoadFailed", {}, "Failed to load subtask list."));
      return;
    }

    const items = res.payload.items;
    subtasksState.items = items;
    subtasksState.conversationId = res.payload?.conversationId || null;
    renderSubtasksSummary(items);

    if (!items.length) {
      subtasksState.selectedId = null;
      subtasksState.selectedItem = null;
      subtasksState.selectedOutputContent = "";
      subtasksState.selectedContinuationState = null;
      subtasksState.selectedResultEnvelope = null;
      subtasksState.selectedLaunchExplainability = null;
      subtasksState.selectedPromptSnapshot = null;
      renderSubtasksEmpty(getEmptyStateMessage(subtasksState));
      return;
    }

    const linkedSessionId = linkedSessionContext?.sessionId || "";
    const linkedTaskId = linkedSessionContext?.taskId || "";
    const linkedItem = linkedSessionId ? findSubtaskBySessionId(items, linkedSessionId) : null;
    const selectedExists = items.some((item) => item?.id === subtasksState.selectedId);
    if (forceSelectFirst || !selectedExists) {
      subtasksState.selectedId = linkedItem?.id || linkedTaskId || items[0].id;
    }

    renderSubtaskList(items);
    await loadSubtaskDetail(subtasksState.selectedId);
  }

  function refreshLocale() {
    if (!subtasksSection) return;
    const subtasksState = getSubtasksState();
    if (!isConnected()) {
      renderSubtasksLoading(t("subtasks.loadingDisconnected", {}, "Disconnected"));
      return;
    }
    if (subtasksState.loading) {
      renderSubtasksLoading(t("subtasks.loading", {}, "Loading..."));
      return;
    }
    renderSubtasksSummary(subtasksState.items);
    renderSubtaskList(subtasksState.items);
    if (subtasksState.detailLoading) {
      renderSubtasksDetailEmpty(t("subtasks.detailLoading", {}, "Loading subtask details..."));
      return;
    }
    if (subtasksState.selectedItem && subtasksState.selectedItem.id === subtasksState.selectedId) {
      renderSubtaskDetail(subtasksState.selectedItem, subtasksState.selectedOutputContent);
      return;
    }
    if (Array.isArray(subtasksState.items) && subtasksState.items.length === 0 && subtasksState.loadSeq > 0) {
      renderSubtasksDetailEmpty(t("subtasks.detailSelect", {}, "Select a subtask on the left to view details."));
      return;
    }
    renderSubtasksDetailEmpty(t("subtasks.detailSelect", {}, "Select a subtask on the left to view details."));
  }

  function flushSubtaskUpdate(taskId) {
    const subtasksState = getSubtasksState();
    const pending = subtasksState.liveUpdatePending?.[taskId];
    if (!pending?.item) return;
    delete subtasksState.liveUpdatePending[taskId];
    if (subtasksState.liveUpdateTimers?.[taskId]) {
      clearTimeout(subtasksState.liveUpdateTimers[taskId]);
      delete subtasksState.liveUpdateTimers[taskId];
    }

    const item = pending.item;
    const includeArchived = subtasksState.includeArchived === true;
    const matchesConversation = !subtasksState.conversationId || item.parentConversationId === subtasksState.conversationId;
    const nextItems = Array.isArray(subtasksState.items) ? [...subtasksState.items] : [];
    const existingIndex = nextItems.findIndex((current) => current?.id === item.id);

    if (!matchesConversation || (!includeArchived && item.archivedAt)) {
      if (existingIndex >= 0) {
        nextItems.splice(existingIndex, 1);
      }
      if (subtasksState.selectedId === item.id && item.archivedAt && !includeArchived) {
        subtasksState.selectedItem = item;
        subtasksState.selectedOutputContent = "";
      }
    } else if (existingIndex >= 0) {
      nextItems.splice(existingIndex, 1, item);
    } else {
      nextItems.unshift(item);
    }

    subtasksState.items = nextItems.sort((a, b) => Number(b?.createdAt || 0) - Number(a?.createdAt || 0));
    if (subtasksState.selectedId === item.id) {
      subtasksState.selectedItem = item;
    }

    if (Array.isArray(subtasksState.items) && subtasksState.items.length === 0) {
      subtasksState.selectedId = null;
      subtasksState.selectedItem = null;
      subtasksState.selectedOutputContent = "";
      subtasksState.selectedContinuationState = null;
      subtasksState.selectedResultEnvelope = null;
      subtasksState.selectedLaunchExplainability = null;
      subtasksState.selectedPromptSnapshot = null;
      if (isViewActive?.()) {
        renderSubtasksEmpty(getEmptyStateMessage(subtasksState));
      }
      return;
    }

    if (!subtasksState.selectedId && subtasksState.items[0]?.id) {
      subtasksState.selectedId = subtasksState.items[0].id;
    }

    if (!isViewActive?.()) {
      return;
    }

    renderSubtasksSummary(subtasksState.items);
    renderSubtaskList(subtasksState.items);
    if (subtasksState.selectedId === item.id) {
      if (item.archivedAt && !includeArchived) {
        renderSubtaskDetail(item, subtasksState.selectedOutputContent);
      } else {
        void loadSubtaskDetail(item.id, { quiet: true });
      }
    }
  }

  function handleSubtaskUpdate(payload) {
    const item = payload && payload.item && typeof payload.item === "object" ? payload.item : null;
    const taskId = typeof item?.id === "string" ? item.id : "";
    if (!taskId) return;
    const subtasksState = getSubtasksState();
    if (!subtasksState.liveUpdatePending || typeof subtasksState.liveUpdatePending !== "object") {
      subtasksState.liveUpdatePending = {};
    }
    if (!subtasksState.liveUpdateTimers || typeof subtasksState.liveUpdateTimers !== "object") {
      subtasksState.liveUpdateTimers = {};
    }
    subtasksState.liveUpdatePending[taskId] = { item, kind: payload?.kind || "updated" };
    if (subtasksState.liveUpdateTimers[taskId]) {
      clearTimeout(subtasksState.liveUpdateTimers[taskId]);
    }
    subtasksState.liveUpdateTimers[taskId] = setTimeout(() => {
      flushSubtaskUpdate(taskId);
    }, subtasksState.liveUpdateDelayMs || 120);
  }

  return {
    loadSubtasks,
    loadSubtaskDetail,
    refreshLocale,
    handleSubtaskUpdate,
    renderSubtasksSummary,
    renderSubtaskList,
    renderSubtaskDetail,
  };
}
