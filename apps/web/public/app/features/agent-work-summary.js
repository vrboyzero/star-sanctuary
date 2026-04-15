import { buildContinuationAction, formatContinuationTargetLabel } from "./continuation-targets.js";

function tr(t, key, params, fallback) {
  return typeof t === "function" ? t(key, params ?? {}, fallback) : fallback;
}

function truncateLabel(value, max = 72) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) return "";
  return normalized.length > max ? `${normalized.slice(0, max - 3)}...` : normalized;
}

function normalizeStatus(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function formatStatusLabel(agent, t) {
  switch (normalizeStatus(agent?.status)) {
    case "running":
      return tr(t, "agentPanel.workSummaryStatusRunning", {}, "运行中");
    case "background":
      return tr(t, "agentPanel.workSummaryStatusBackground", {}, "后台运行");
    case "error":
      return tr(t, "agentPanel.workSummaryStatusError", {}, "异常");
    case "idle":
    default:
      return tr(t, "agentPanel.workSummaryStatusIdle", {}, "空闲");
  }
}

function buildFocusValue(agent, t) {
  const continuation = agent?.continuationState;
  const focus = [
    continuation?.summary,
    continuation?.nextAction,
    agent?.observabilityHeadline,
    agent?.recentSubtaskDigest?.latestSummary,
    agent?.recentTaskDigest?.latestTitle,
  ].find((value) => typeof value === "string" && value.trim());

  return truncateLabel(
    focus || tr(t, "agentPanel.workSummaryFocusEmpty", {}, "当前没有明确关注对象"),
    84,
  );
}

function buildAttentionValue(agent, t) {
  const pendingReviewCount = Number(agent?.sharedGovernance?.pendingCount) || 0;
  if (pendingReviewCount > 0) {
    return tr(
      t,
      "agentPanel.workSummaryAttentionReview",
      { count: pendingReviewCount },
      `待审阅 ${pendingReviewCount} 项`,
    );
  }

  const taskStatus = normalizeStatus(agent?.recentTaskDigest?.latestStatus);
  if (taskStatus && ["error", "failed", "blocked", "timeout", "pending_approval"].includes(taskStatus)) {
    return tr(
      t,
      "agentPanel.workSummaryAttentionTask",
      {
        title: truncateLabel(agent?.recentTaskDigest?.latestTitle || agent?.recentTaskDigest?.latestTaskId || "", 36),
        status: taskStatus,
      },
      `长任务 ${truncateLabel(agent?.recentTaskDigest?.latestTitle || agent?.recentTaskDigest?.latestTaskId || "", 36)} · ${taskStatus}`,
    );
  }

  const subtaskStatus = normalizeStatus(agent?.recentSubtaskDigest?.latestStatus);
  if (subtaskStatus && ["error", "failed", "blocked", "timeout", "pending_approval"].includes(subtaskStatus)) {
    return tr(
      t,
      "agentPanel.workSummaryAttentionSubtask",
      {
        summary: truncateLabel(agent?.recentSubtaskDigest?.latestSummary || agent?.recentSubtaskDigest?.latestTaskId || "", 36),
        status: subtaskStatus,
      },
      `子任务 ${truncateLabel(agent?.recentSubtaskDigest?.latestSummary || agent?.recentSubtaskDigest?.latestTaskId || "", 36)} · ${subtaskStatus}`,
    );
  }

  return tr(t, "agentPanel.workSummaryAttentionClear", {}, "当前没有待处理事项");
}

function countAttention(agent) {
  const pendingReviewCount = Number(agent?.sharedGovernance?.pendingCount) || 0;
  if (pendingReviewCount > 0) {
    return pendingReviewCount;
  }

  const taskStatus = normalizeStatus(agent?.recentTaskDigest?.latestStatus);
  if (taskStatus && ["error", "failed", "blocked", "timeout", "pending_approval"].includes(taskStatus)) {
    return 1;
  }

  const subtaskStatus = normalizeStatus(agent?.recentSubtaskDigest?.latestStatus);
  if (subtaskStatus && ["error", "failed", "blocked", "timeout", "pending_approval"].includes(subtaskStatus)) {
    return 1;
  }

  return 0;
}

function buildTargetValue(agent, t) {
  const continuation = agent?.continuationState;
  if (continuation?.recommendedTargetId) {
    return truncateLabel(formatContinuationTargetLabel(continuation), 84);
  }
  if (agent?.recentSubtaskDigest?.latestTaskId) {
    return truncateLabel(`subtask:${agent.recentSubtaskDigest.latestTaskId}`, 84);
  }
  if (agent?.recentTaskDigest?.latestTaskId) {
    return truncateLabel(`task:${agent.recentTaskDigest.latestTaskId}`, 84);
  }
  if (agent?.lastConversationId || agent?.mainConversationId) {
    return truncateLabel(`conversation:${agent.lastConversationId || agent.mainConversationId}`, 84);
  }
  return tr(t, "agentPanel.workSummaryTargetEmpty", {}, "当前没有可跳转目标");
}

function buildPrimaryAction(agent) {
  const continuation = agent?.continuationState;
  if (continuation?.recommendedTargetId) {
    return buildContinuationAction(continuation);
  }

  const pendingReviewCount = Number(agent?.sharedGovernance?.pendingCount) || 0;
  if (pendingReviewCount > 0) {
    return { kind: "sharedReview" };
  }

  if (agent?.recentSubtaskDigest?.latestTaskId) {
    return {
      kind: "subtask",
      taskId: agent.recentSubtaskDigest.latestTaskId,
    };
  }

  if (agent?.recentTaskDigest?.latestTaskId) {
    return {
      kind: "task",
      taskId: agent.recentTaskDigest.latestTaskId,
    };
  }

  const conversationId = typeof agent?.lastConversationId === "string" && agent.lastConversationId.trim()
    ? agent.lastConversationId.trim()
    : typeof agent?.mainConversationId === "string" && agent.mainConversationId.trim()
      ? agent.mainConversationId.trim()
      : "";
  if (conversationId) {
    return {
      kind: "conversation",
      conversationId,
    };
  }

  return null;
}

export function buildAgentWorkSummary(agent, t) {
  const action = buildPrimaryAction(agent);
  const lines = [
    {
      key: "status",
      label: tr(t, "agentPanel.workSummaryStatusLabel", {}, "状态"),
      value: formatStatusLabel(agent, t),
    },
    {
      key: "focus",
      label: tr(t, "agentPanel.workSummaryFocusLabel", {}, "当前关注"),
      value: buildFocusValue(agent, t),
    },
    {
      key: "attention",
      label: tr(t, "agentPanel.workSummaryAttentionLabel", {}, "待处理"),
      value: buildAttentionValue(agent, t),
    },
    {
      key: "target",
      label: tr(t, "agentPanel.workSummaryTargetLabel", {}, "目标"),
      value: buildTargetValue(agent, t),
    },
  ];

  return {
    title: tr(t, "agentPanel.workSummaryTitle", {}, "工作摘要"),
    lines,
    attentionCount: countAttention(agent),
    action,
    actionable: Boolean(action),
    tooltip: lines.map((line) => `${line.label}: ${line.value}`).join("\n"),
  };
}
