import { buildLaunchExplainabilityLines } from "./agent-launch-explainability.js";
import { buildContinuationAction, formatContinuationTargetLabel } from "./continuation-targets.js";

function tr(t, key, params, fallback) {
  return typeof t === "function" ? t(key, params ?? {}, fallback) : fallback;
}

function truncateLabel(value, max = 48) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) return "";
  return normalized.length > max ? `${normalized.slice(0, max - 3)}...` : normalized;
}

function formatReviewValue(agent, t) {
  const pendingCount = Number(agent?.sharedGovernance?.pendingCount) || 0;
  const claimedCount = Number(agent?.sharedGovernance?.claimedCount) || 0;
  if (pendingCount <= 0 && claimedCount <= 0) {
    return tr(t, "agentPanel.reviewClear", {}, "clear");
  }
  return tr(
    t,
    "agentPanel.reviewQueueCompact",
    { pending: pendingCount, claimed: claimedCount },
    `p${pendingCount}/c${claimedCount}`,
  );
}

function formatDigestBadge(agent, t) {
  const status = typeof agent?.conversationDigest?.status === "string"
    ? agent.conversationDigest.status.trim()
    : "";
  if (!status) return "";

  const label = status === "ready"
    ? tr(t, "agentPanel.digestReady", {}, "digest ready")
    : status === "updated"
      ? tr(t, "agentPanel.digestUpdated", {}, "digest update")
      : status === "idle"
        ? tr(t, "agentPanel.digestIdle", {}, "digest idle")
        : status;
  const pendingCount = Number(agent?.conversationDigest?.pendingMessageCount) || 0;
  return pendingCount > 0
    ? tr(t, "agentPanel.digestPending", { label, count: pendingCount }, `${label}/${pendingCount}`)
    : label;
}

function formatContinuationMode(agent, t) {
  const mode = typeof agent?.continuationState?.resumeMode === "string"
    ? agent.continuationState.resumeMode.trim()
    : "";
  if (!mode) return "";
  switch (mode) {
    case "resident_main":
      return tr(t, "agentPanel.continueResidentMain", {}, "main");
    case "resident_review":
      return tr(t, "agentPanel.continueResidentReview", {}, "review");
    case "resident_followup":
      return tr(t, "agentPanel.continueResidentFollowup", {}, "follow-up");
    case "resident_task_followup":
      return tr(t, "agentPanel.continueResidentTaskFollowup", {}, "task");
    default:
      return mode;
  }
}

function buildContinuationRow(agent, t) {
  const continuation = agent?.continuationState;
  if (continuation?.recommendedTargetId) {
    const modeLabel = formatContinuationMode(agent, t);
    const targetLabel = formatContinuationTargetLabel(continuation);
    const summary = truncateLabel(continuation.summary || continuation.nextAction || targetLabel, 64);
    return {
      key: "continue",
      label: tr(t, "agentPanel.summaryContinueLabel", {}, "Continue"),
      value: modeLabel
        ? tr(t, "agentPanel.summaryContinueValue", { mode: modeLabel, summary }, `${modeLabel} · ${summary}`)
        : summary,
      action: buildContinuationAction(continuation),
    };
  }

  return {
    key: "continue",
    label: tr(t, "agentPanel.summaryContinueLabel", {}, "Continue"),
    value: tr(t, "agentPanel.summaryContinueEmpty", {}, "No continuation target"),
    action: { kind: "conversation" },
  };
}

function buildTaskRow(agent, t) {
  const digest = agent?.recentTaskDigest;
  if (digest?.latestTitle) {
    return {
      key: "task",
      label: tr(t, "agentPanel.summaryTaskLabel", {}, "Long task"),
      value: digest.latestStatus
        ? tr(
          t,
          "agentPanel.summaryTaskValue",
          { title: truncateLabel(digest.latestTitle), status: digest.latestStatus },
          `${truncateLabel(digest.latestTitle)} · ${digest.latestStatus}`,
        )
        : truncateLabel(digest.latestTitle),
      action: digest.latestTaskId
        ? { kind: "task", taskId: digest.latestTaskId }
        : { kind: "tasks" },
    };
  }

  return {
    key: "task",
    label: tr(t, "agentPanel.summaryTaskLabel", {}, "Long task"),
    value: tr(t, "agentPanel.summaryTaskEmpty", {}, "No recent task"),
    action: { kind: "tasks" },
  };
}

function buildSubtaskRow(agent, t) {
  const digest = agent?.recentSubtaskDigest;
  if (digest?.latestTaskId) {
    const parts = [
      truncateLabel(digest.latestSummary || digest.latestTaskId),
      digest.latestStatus || "",
      digest.latestAgentId || "",
    ].filter(Boolean);
    return {
      key: "subtask",
      label: tr(t, "agentPanel.summarySubtaskLabel", {}, "Subtask"),
      value: parts.join(" · "),
      action: { kind: "subtask", taskId: digest.latestTaskId },
    };
  }

  return {
    key: "subtask",
    label: tr(t, "agentPanel.summarySubtaskLabel", {}, "Subtask"),
    value: tr(t, "agentPanel.summarySubtaskEmpty", {}, "No recent subtask"),
    action: { kind: "subtasks" },
  };
}

function buildReviewRow(agent, t) {
  return {
    key: "review",
    label: tr(t, "agentPanel.summaryReviewLabel", {}, "Review"),
    value: formatReviewValue(agent, t),
    action: { kind: "sharedReview" },
  };
}

function buildUsageRow(agent, t) {
  const digest = agent?.experienceUsageDigest;
  if (digest?.usageCount > 0) {
    return {
      key: "usage",
      label: tr(t, "agentPanel.summaryUsageLabel", {}, "Usage"),
      value: tr(
        t,
        "agentPanel.summaryUsageValue",
        {
          methods: digest.methodCount || 0,
          skills: digest.skillCount || 0,
          asset: truncateLabel(digest.latestAssetKey || ""),
        },
        `m${digest.methodCount || 0}/s${digest.skillCount || 0} · ${truncateLabel(digest.latestAssetKey || "")}`,
      ),
      action: digest.latestTaskId
        ? { kind: "task", taskId: digest.latestTaskId }
        : { kind: "tasks" },
    };
  }

  return {
    key: "usage",
    label: tr(t, "agentPanel.summaryUsageLabel", {}, "Usage"),
    value: tr(t, "agentPanel.summaryUsageEmpty", {}, "No recent reuse"),
    action: { kind: "tasks" },
  };
}

export function buildResidentPanelSummary(agent, t) {
  const rows = [
    buildContinuationRow(agent, t),
    buildTaskRow(agent, t),
    buildSubtaskRow(agent, t),
    buildReviewRow(agent, t),
    buildUsageRow(agent, t),
  ];

  const badges = [];
  if (agent?.memoryMode) {
    badges.push(agent.memoryMode);
  }

  const digestBadge = formatDigestBadge(agent, t);
  if (digestBadge) {
    badges.push(digestBadge);
  }

  const continuationMode = formatContinuationMode(agent, t);
  if (continuationMode) {
    badges.push(continuationMode);
  }

  if (agent?.workspaceBinding === "custom") {
    badges.push(tr(t, "agentPanel.workspaceCustomCompact", {}, "custom"));
  }

  return { badges, rows };
}

export function buildResidentDoctorNote(agent, t) {
  const digest = agent?.conversationDigest;
  const digestLabel = digest
    ? `digest=${digest.status}${Number(digest.pendingMessageCount) > 0 ? `/${Number(digest.pendingMessageCount) || 0}` : ""}`
    : "";
  const summary = buildResidentPanelSummary(agent, t);
  const launchExplainabilityLines = buildLaunchExplainabilityLines(agent?.launchExplainability, t);
  const rowSegments = summary.rows.map((row) => {
    switch (row.key) {
      case "task":
        return `task=${row.value}`;
      case "subtask":
        return `subtask=${row.value}`;
      case "review":
        return `review=${row.value}`;
      case "usage":
        return `usage=${row.value}`;
      default:
        return row.value;
    }
  }).filter(Boolean);

  return [
    `${agent?.displayName || agent?.id}: ${agent?.memoryMode || "-"}`,
    `write=${agent?.memoryPolicy?.writeTarget || "-"}`,
    `read=${Array.isArray(agent?.memoryPolicy?.readTargets) ? agent.memoryPolicy.readTargets.join("+") : "-"}`,
    `session=${agent?.sessionNamespace || "-"}`,
    ...launchExplainabilityLines,
    agent?.status ? `status=${agent.status}` : "",
    digestLabel,
    ...rowSegments,
  ].filter(Boolean).join(", ");
}
