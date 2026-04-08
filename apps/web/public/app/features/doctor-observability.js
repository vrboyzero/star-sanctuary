import { buildResidentDoctorNote } from "./resident-observability-summary.js";
import { buildLaunchExplainabilityLines } from "./agent-launch-explainability.js";
import { buildResidentStateBindingLines } from "./resident-state-binding-lines.js";

function tr(t, key, params, fallback) {
  return typeof t === "function" ? t(key, params ?? {}, fallback) : fallback;
}

function formatNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "0";
}

function formatTimestamp(value) {
  return typeof value === "number" && Number.isFinite(value)
    ? new Date(value).toISOString()
    : "-";
}

function joinDroppedSections(reason) {
  const labels = Array.isArray(reason?.droppedSectionLabels) ? reason.droppedSectionLabels.filter(Boolean) : [];
  if (labels.length > 0) {
    return labels.join(", ");
  }
  const ids = Array.isArray(reason?.droppedSectionIds) ? reason.droppedSectionIds.filter(Boolean) : [];
  return ids.join(", ");
}

function buildPromptObservabilityCard(payload, t) {
  const summary = payload?.promptObservability?.summary;
  if (!summary) {
    return undefined;
  }
  const launchExplainabilityLines = buildLaunchExplainabilityLines(payload?.promptObservability?.launchExplainability, t);
  const residentStateBindingLines = buildResidentStateBindingLines(payload?.promptObservability?.residentStateBinding, t);

  const scopeText = summary.scope === "run"
    ? tr(
      t,
      "settings.doctorPromptScopeRun",
      { conversationId: summary.conversationId ?? "-" },
      summary.conversationId
        ? `当前会话 ${summary.conversationId} 最近一次实际发送的 prompt`
        : "最近一次实际发送的 prompt",
    )
    : tr(
      t,
      "settings.doctorPromptScopeAgent",
      { agentId: summary.agentId },
      `当前 Agent（${summary.agentId}）的装配基线`,
    );

  const badges = [
    tr(
      t,
      "settings.doctorPromptTokens",
      { tokens: formatNumber(summary.tokenBreakdown?.systemPromptEstimatedTokens) },
      `约 ${formatNumber(summary.tokenBreakdown?.systemPromptEstimatedTokens)} tokens`,
    ),
    tr(
      t,
      "settings.doctorPromptChars",
      { chars: formatNumber(summary.promptSizes?.finalChars) },
      `${formatNumber(summary.promptSizes?.finalChars)} chars`,
    ),
    tr(
      t,
      "settings.doctorPromptSections",
      { count: formatNumber(summary.counts?.sectionCount) },
      `${formatNumber(summary.counts?.sectionCount)} 段规则`,
    ),
    tr(
      t,
      "settings.doctorPromptDeltas",
      { count: formatNumber(summary.counts?.deltaCount) },
      `${formatNumber(summary.counts?.deltaCount)} 段动态补充`,
    ),
    tr(
      t,
      "settings.doctorPromptBlocks",
      { count: formatNumber(summary.counts?.providerNativeSystemBlockCount) },
      `${formatNumber(summary.counts?.providerNativeSystemBlockCount)} 个 provider block`,
    ),
  ];

  const notes = [scopeText];
  if (summary.truncationReason?.code) {
    notes.push(tr(
      t,
      "settings.doctorPromptTruncation",
      {
        count: formatNumber(summary.truncationReason.droppedSectionCount),
        sections: joinDroppedSections(summary.truncationReason) || "-",
        maxChars: formatNumber(summary.truncationReason.maxChars),
      },
      `因长度限制，已省略 ${formatNumber(summary.truncationReason.droppedSectionCount)} 段：${joinDroppedSections(summary.truncationReason) || "-"}。当前上限 ${formatNumber(summary.truncationReason.maxChars)} chars。`,
    ));
  } else {
    notes.push(tr(
      t,
      "settings.doctorPromptStable",
      {},
      "当前 prompt 没有因为长度限制而裁剪。",
    ));
  }
  notes.push(...residentStateBindingLines);
  notes.push(...launchExplainabilityLines);

  return {
    title: tr(t, "settings.doctorPromptTitle", {}, "Prompt 摘要"),
    badges,
    notes,
    status: summary.truncationReason?.code ? "warn" : "pass",
  };
}

function buildToolBehaviorCard(payload, t) {
  const observability = payload?.toolBehaviorObservability;
  if (!observability) {
    return undefined;
  }
  const residentStateBinding = observability?.visibilityContext?.residentStateBinding
    && typeof observability.visibilityContext.residentStateBinding === "object"
    ? observability.visibilityContext.residentStateBinding
    : null;
  const residentStateBindingLines = buildResidentStateBindingLines(residentStateBinding, t);
  const launchExplainabilityLines = buildLaunchExplainabilityLines(
    observability?.visibilityContext?.launchExplainability,
    t,
  );

  const disabledCount = Array.isArray(observability.experiment?.disabledContractNamesApplied)
    ? observability.experiment.disabledContractNamesApplied.length
    : 0;

  const badges = [
    tr(
      t,
      "settings.doctorToolContractsIncluded",
      { count: formatNumber(observability.counts?.includedContractCount) },
      `${formatNumber(observability.counts?.includedContractCount)} 条工具规则生效`,
    ),
    tr(
      t,
      "settings.doctorToolContractsVisible",
      { count: formatNumber(observability.counts?.visibleToolContractCount) },
      `${formatNumber(observability.counts?.visibleToolContractCount)} 条可见`,
    ),
  ];

  if (disabledCount > 0) {
    badges.push(tr(
      t,
      "settings.doctorToolContractsDisabled",
      { count: formatNumber(disabledCount) },
      `${formatNumber(disabledCount)} 条被实验开关关闭`,
    ));
  }

  const notes = [
    tr(
      t,
      "settings.doctorToolContractsHelp",
      {},
      "这些规则会告诉模型什么时候该调用工具、什么时候先别乱用。",
    ),
  ];
  if (residentStateBinding) {
    notes.push(tr(
      t,
      "settings.doctorToolContractsScopeHelp",
      {},
      "当前工具可见性与审批判断，会复用 resident 的 workspace / state scope 绑定。",
    ));
    notes.push(...residentStateBindingLines);
  }
  notes.push(...launchExplainabilityLines);

  if (Array.isArray(observability.included) && observability.included.length > 0) {
    notes.push(tr(
      t,
      "settings.doctorToolContractsList",
      { names: observability.included.join(", ") },
      `当前生效：${observability.included.join(", ")}`,
    ));
  }

  return {
    title: tr(t, "settings.doctorToolContractsTitle", {}, "工具使用规则"),
    badges,
    notes,
    status: disabledCount > 0 ? "warn" : "pass",
  };
}

function buildToolContractV2Card(payload, t) {
  const observability = payload?.toolContractV2Observability;
  if (!observability?.summary) {
    return undefined;
  }

  const summary = observability.summary;
  const badges = [
    tr(
      t,
      "settings.doctorToolContractV2Total",
      { count: formatNumber(summary.totalCount) },
      `${formatNumber(summary.totalCount)} 条 V2 契约`,
    ),
    tr(
      t,
      "settings.doctorToolContractV2HighRisk",
      { count: formatNumber(summary.highRiskCount) },
      `${formatNumber(summary.highRiskCount)} 条高风险`,
    ),
    tr(
      t,
      "settings.doctorToolContractV2Confirm",
      { count: formatNumber(summary.confirmRequiredCount) },
      `${formatNumber(summary.confirmRequiredCount)} 条需确认`,
    ),
  ];

  const notes = [];
  notes.push(tr(
    t,
    "settings.doctorToolContractV2Help",
    {},
    "这组摘要把治理契约和行为契约统一成一份可执行、可解释的工具规则视图。",
  ));
  notes.push(
    summary.missingV2Tools?.length
      ? tr(
        t,
        "settings.doctorToolContractV2Missing",
        { names: summary.missingV2Tools.join(", ") },
        `尚未补齐 V2 契约：${summary.missingV2Tools.join(", ")}`,
      )
      : tr(
        t,
        "settings.doctorToolContractV2Complete",
        {},
        "当前可见工具都已有 V2 契约摘要。",
      ),
  );

  return {
    title: tr(t, "settings.doctorToolContractV2Title", {}, "Tool Contract V2"),
    badges,
    notes,
    status: summary.missingV2Count > 0 ? "warn" : "pass",
  };
}

function buildResidentAgentsCard(payload, t) {
  const resident = payload?.residentAgents;
  if (!resident?.summary) {
    return undefined;
  }

  const summary = resident.summary;
  const badges = [
    tr(
      t,
      "settings.doctorResidentAgentsTotal",
      { count: formatNumber(summary.totalCount) },
      `${formatNumber(summary.totalCount)} 个 resident`,
    ),
    tr(
      t,
      "settings.doctorResidentAgentsActive",
      { count: formatNumber(summary.activeCount) },
      `${formatNumber(summary.activeCount)} 个活跃中`,
    ),
    tr(
      t,
      "settings.doctorResidentAgentsModes",
      {
        isolated: formatNumber(summary.memoryModeCounts?.isolated),
        shared: formatNumber(summary.memoryModeCounts?.shared),
        hybrid: formatNumber(summary.memoryModeCounts?.hybrid),
      },
      `isolated ${formatNumber(summary.memoryModeCounts?.isolated)} / shared ${formatNumber(summary.memoryModeCounts?.shared)} / hybrid ${formatNumber(summary.memoryModeCounts?.hybrid)}`,
    ),
    tr(
      t,
      "settings.doctorResidentAgentsRuntime",
      {
        running: formatNumber(summary.runningCount),
        background: formatNumber(summary.backgroundCount),
        idle: formatNumber(summary.idleCount),
        error: formatNumber(summary.errorCount),
      },
      `running ${formatNumber(summary.runningCount)} / background ${formatNumber(summary.backgroundCount)} / idle ${formatNumber(summary.idleCount)} / error ${formatNumber(summary.errorCount)}`,
    ),
    tr(
      t,
      "settings.doctorResidentAgentsDigest",
      {
        ready: formatNumber(summary.digestReadyCount),
        updated: formatNumber(summary.digestUpdatedCount),
        idle: formatNumber(summary.digestIdleCount),
        missing: formatNumber(summary.digestMissingCount),
      },
      `digest ready ${formatNumber(summary.digestReadyCount)} / updated ${formatNumber(summary.digestUpdatedCount)} / idle ${formatNumber(summary.digestIdleCount)} / missing ${formatNumber(summary.digestMissingCount)}`,
    ),
    tr(
      t,
      "settings.doctorResidentAgentsTasks",
      { count: formatNumber(summary.recentTaskLinkedCount) },
      `${formatNumber(summary.recentTaskLinkedCount)} resident(s) with recent task context`,
    ),
    tr(
      t,
      "settings.doctorResidentAgentsSubtasks",
      { count: formatNumber(summary.recentSubtaskLinkedCount) },
      `${formatNumber(summary.recentSubtaskLinkedCount)} resident(s) with recent subtask context`,
    ),
    tr(
      t,
      "settings.doctorResidentAgentsUsage",
      { count: formatNumber(summary.experienceUsageLinkedCount) },
      `${formatNumber(summary.experienceUsageLinkedCount)} resident(s) with experience usage context`,
    ),
    tr(
      t,
      "settings.doctorResidentAgentsCatalog",
      { count: formatNumber(summary.catalogAnnotatedCount) },
      `${formatNumber(summary.catalogAnnotatedCount)} resident(s) with catalog guidance`,
    ),
    tr(
      t,
      "settings.doctorResidentAgentsHandoff",
      { count: formatNumber(summary.structuredHandoffCount) },
      `${formatNumber(summary.structuredHandoffCount)} resident(s) with structured handoff`,
    ),
    tr(
      t,
      "settings.doctorResidentAgentsSkillHints",
      { count: formatNumber(summary.skillHintedCount) },
      `${formatNumber(summary.skillHintedCount)} resident(s) with skill hints`,
    ),
  ];

  const notes = [
    tr(
      t,
      "settings.doctorResidentAgentsHeadline",
      { headline: summary.headline },
      summary.headline,
    ),
  ];

  const agents = Array.isArray(resident.agents) ? resident.agents : [];
  for (const agent of agents.slice(0, 6)) {
    notes.push(buildResidentDoctorNote(agent, t));
  }

  return {
    title: tr(t, "settings.doctorResidentAgentsTitle", {}, "Resident Agents"),
    badges,
    notes,
    status: summary.totalCount > 0 ? "pass" : "warn",
  };
}

function buildSharedGovernanceCard(payload, t) {
  const sharedMemory = payload?.memoryRuntime?.sharedMemory;
  const residentSummary = payload?.residentAgents?.summary;
  if (!sharedMemory && !residentSummary) {
    return undefined;
  }

  const enabled = sharedMemory?.enabled === true;
  const available = sharedMemory?.available === true;
  const badges = [
    tr(
      t,
      "settings.doctorSharedGovernanceReaders",
      { count: formatNumber(residentSummary?.sharedReadEnabledCount) },
      `${formatNumber(residentSummary?.sharedReadEnabledCount)} 个 shared reader`,
    ),
    tr(
      t,
      "settings.doctorSharedGovernanceWriters",
      { count: formatNumber(residentSummary?.writeTargetCounts?.shared) },
      `${formatNumber(residentSummary?.writeTargetCounts?.shared)} 个 shared writer`,
    ),
    tr(
      t,
      "settings.doctorSharedGovernanceGuard",
      { status: sharedMemory?.secretGuard?.enabled === true ? "on" : "off" },
      `secret guard ${sharedMemory?.secretGuard?.enabled === true ? "on" : "off"}`,
    ),
    tr(
      t,
      "settings.doctorSharedGovernancePending",
      { count: formatNumber(residentSummary?.sharedGovernanceCounts?.pendingCount) },
      `${formatNumber(residentSummary?.sharedGovernanceCounts?.pendingCount)} pending approval(s)`,
    ),
    tr(
      t,
      "settings.doctorSharedGovernanceClaimed",
      { count: formatNumber(residentSummary?.sharedGovernanceCounts?.claimedCount) },
      `${formatNumber(residentSummary?.sharedGovernanceCounts?.claimedCount)} claimed pending item(s)`,
    ),
  ];

  const notes = [];
  notes.push(tr(
    t,
    "settings.doctorSharedGovernanceAvailability",
    { status: enabled ? (available ? "available" : "blocked") : "disabled" },
    enabled ? (available ? "shared layer 可用" : "shared layer 已启用但当前不可用") : "shared layer 未启用",
  ));
  if (sharedMemory?.secretGuard?.summary) {
    notes.push(tr(
      t,
      "settings.doctorSharedGovernanceGuardNote",
      { summary: sharedMemory.secretGuard.summary },
      `secret guard: ${sharedMemory.secretGuard.summary}`,
    ));
  }
  if (sharedMemory?.syncPolicy?.conflictPolicy?.summary) {
    notes.push(tr(
      t,
      "settings.doctorSharedGovernanceConflict",
      { summary: sharedMemory.syncPolicy.conflictPolicy.summary },
      `conflict policy: ${sharedMemory.syncPolicy.conflictPolicy.summary}`,
    ));
  }
  if (Array.isArray(sharedMemory?.reasonMessages) && sharedMemory.reasonMessages.length > 0 && !available) {
    notes.push(tr(
      t,
      "settings.doctorSharedGovernanceBlockedReasons",
      { reasons: sharedMemory.reasonMessages.join(" | ") },
      `blocked reasons: ${sharedMemory.reasonMessages.join(" | ")}`,
    ));
  }
  const residentAgents = Array.isArray(payload?.residentAgents?.agents) ? payload.residentAgents.agents : [];
  for (const agent of residentAgents.slice(0, 6)) {
    const pendingCount = Number(agent?.sharedGovernance?.pendingCount) || 0;
    const claimedCount = Number(agent?.sharedGovernance?.claimedCount) || 0;
    const approvedCount = Number(agent?.sharedGovernance?.approvedCount) || 0;
    const rejectedCount = Number(agent?.sharedGovernance?.rejectedCount) || 0;
    const revokedCount = Number(agent?.sharedGovernance?.revokedCount) || 0;
    if (pendingCount + claimedCount + approvedCount + rejectedCount + revokedCount <= 0) continue;
    notes.push(
      `${agent.displayName || agent.id}: pending=${pendingCount}, claimed=${claimedCount}, approved=${approvedCount}, rejected=${rejectedCount}, revoked=${revokedCount}`,
    );
  }

  return {
    title: tr(t, "settings.doctorSharedGovernanceTitle", {}, "Shared Governance"),
    badges,
    notes,
    status: available ? "pass" : enabled ? "warn" : "warn",
  };
}

function buildDelegationCard(payload, t) {
  const observability = payload?.delegationObservability;
  const summary = observability?.summary;
  if (!summary) {
    return undefined;
  }

  const badges = [
    tr(
      t,
      "settings.doctorDelegationProtocolBacked",
      { count: formatNumber(summary.protocolBackedCount), total: formatNumber(summary.totalCount) },
      `${formatNumber(summary.protocolBackedCount)}/${formatNumber(summary.totalCount)} protocol-backed`,
    ),
    tr(
      t,
      "settings.doctorDelegationActive",
      { count: formatNumber(summary.activeCount) },
      `${formatNumber(summary.activeCount)} active`,
    ),
    tr(
      t,
      "settings.doctorDelegationCompleted",
      { count: formatNumber(summary.completedCount) },
      `${formatNumber(summary.completedCount)} completed`,
    ),
  ];

  const sourcePairs = Object.entries(summary.sourceCounts || {});
  if (sourcePairs.length > 0) {
    badges.push(tr(
      t,
      "settings.doctorDelegationSources",
      { summary: sourcePairs.map(([key, count]) => `${key}:${count}`).join(", ") },
      `sources ${sourcePairs.map(([key, count]) => `${key}:${count}`).join(", ")}`,
    ));
  }

  const aggregationPairs = Object.entries(summary.aggregationModeCounts || {});
  if (aggregationPairs.length > 0) {
    badges.push(tr(
      t,
      "settings.doctorDelegationAggregations",
      { summary: aggregationPairs.map(([key, count]) => `${key}:${count}`).join(", ") },
      `aggregation ${aggregationPairs.map(([key, count]) => `${key}:${count}`).join(", ")}`,
    ));
  }

  const notes = [
    tr(
      t,
      "settings.doctorDelegationHeadline",
      { headline: summary.headline },
      summary.headline,
    ),
  ];

  const items = Array.isArray(observability.items) ? observability.items : [];
  for (const item of items.slice(0, 6)) {
    const parts = [
      item.status ? `status=${item.status}` : "",
      item.source ? `source=${item.source}` : "",
      item.aggregationMode ? `aggregation=${item.aggregationMode}` : "",
      item.expectedDeliverableFormat ? `deliverable=${item.expectedDeliverableFormat}` : "",
      item.expectedDeliverableSummary ? `deliverable-summary=${item.expectedDeliverableSummary}` : "",
      item.intentSummary ? `intent=${item.intentSummary}` : "",
    ].filter(Boolean);
    notes.push(
      `${item.taskId}: ${parts.join(", ")}`,
    );
  }

  return {
    title: tr(t, "settings.doctorDelegationTitle", {}, "Delegation Protocol"),
    badges,
    notes,
    status: summary.activeCount > summary.protocolBackedCount ? "warn" : "pass",
  };
}

function buildCronRuntimeCard(payload, t) {
  const cronRuntime = payload?.cronRuntime;
  if (!cronRuntime?.scheduler || !cronRuntime?.totals) {
    return undefined;
  }

  const badges = [
    tr(
      t,
      "settings.doctorCronJobs",
      {
        enabled: formatNumber(cronRuntime.totals.enabledJobs),
        total: formatNumber(cronRuntime.totals.totalJobs),
      },
      `${formatNumber(cronRuntime.totals.enabledJobs)}/${formatNumber(cronRuntime.totals.totalJobs)} jobs enabled`,
    ),
    tr(
      t,
      "settings.doctorCronSessions",
      {
        main: formatNumber(cronRuntime.sessionTargetCounts?.main),
        isolated: formatNumber(cronRuntime.sessionTargetCounts?.isolated),
      },
      `main ${formatNumber(cronRuntime.sessionTargetCounts?.main)} / isolated ${formatNumber(cronRuntime.sessionTargetCounts?.isolated)}`,
    ),
    tr(
      t,
      "settings.doctorCronDelivery",
      {
        user: formatNumber(cronRuntime.deliveryModeCounts?.user),
        none: formatNumber(cronRuntime.deliveryModeCounts?.none),
      },
      `delivery user ${formatNumber(cronRuntime.deliveryModeCounts?.user)} / none ${formatNumber(cronRuntime.deliveryModeCounts?.none)}`,
    ),
    tr(
      t,
      "settings.doctorCronFailure",
      {
        user: formatNumber(cronRuntime.failureDestinationModeCounts?.user),
        none: formatNumber(cronRuntime.failureDestinationModeCounts?.none),
      },
      `failure user ${formatNumber(cronRuntime.failureDestinationModeCounts?.user)} / none ${formatNumber(cronRuntime.failureDestinationModeCounts?.none)}`,
    ),
    tr(
      t,
      "settings.doctorCronStagger",
      { count: formatNumber(cronRuntime.totals.staggeredJobs) },
      `${formatNumber(cronRuntime.totals.staggeredJobs)} staggered`,
    ),
    tr(
      t,
      "settings.doctorCronScheduler",
      {
        state: cronRuntime.scheduler.enabled
          ? (cronRuntime.scheduler.running ? "running" : "stopped")
          : "disabled",
        active: formatNumber(cronRuntime.scheduler.activeRuns),
      },
      `${cronRuntime.scheduler.enabled ? (cronRuntime.scheduler.running ? "running" : "stopped") : "disabled"} / active ${formatNumber(cronRuntime.scheduler.activeRuns)}`,
    ),
  ];

  const notes = [
    tr(
      t,
      "settings.doctorCronHeadline",
      { headline: cronRuntime.headline || "-" },
      cronRuntime.headline || "-",
    ),
  ];

  if (typeof cronRuntime.scheduler.lastTickAtMs === "number") {
    notes.push(`last tick: ${formatTimestamp(cronRuntime.scheduler.lastTickAtMs)}`);
  }
  if (Number(cronRuntime.totals.invalidNextRunJobs) > 0) {
    notes.push(tr(
      t,
      "settings.doctorCronInvalidNextRun",
      { count: formatNumber(cronRuntime.totals.invalidNextRunJobs) },
      `${formatNumber(cronRuntime.totals.invalidNextRunJobs)} enabled job(s) currently have no nextRunAtMs`,
    ));
  }

  const recentJobs = Array.isArray(cronRuntime.recentJobs) ? cronRuntime.recentJobs : [];
  for (const job of recentJobs.slice(0, 4)) {
    const parts = [
      job.scheduleSummary || "unknown schedule",
      job.enabled ? "enabled" : "disabled",
      `session=${job.sessionTarget || "-"}`,
      `delivery=${job.deliveryMode || "-"}`,
      `failure=${job.failureDestinationMode || "-"}`,
      typeof job.staggerMs === "number" ? `stagger=${job.staggerMs}` : "",
      `next=${formatTimestamp(job.nextRunAtMs)}`,
      `last=${job.lastStatus || "never"}`,
    ].filter(Boolean);
    notes.push(`${job.name || job.id}: ${parts.join(", ")}`);
  }

  const status = !cronRuntime.scheduler.enabled
    ? cronRuntime.totals.totalJobs > 0 ? "warn" : "pass"
    : cronRuntime.scheduler.running && Number(cronRuntime.totals.invalidNextRunJobs) === 0
      ? "pass"
      : "warn";

  return {
    title: tr(t, "settings.doctorCronTitle", {}, "Cron Runtime"),
    badges,
    notes,
    status,
  };
}

function buildBackgroundContinuationRuntimeCard(payload, t) {
  const runtime = payload?.backgroundContinuationRuntime;
  if (!runtime?.totals || !Array.isArray(runtime?.recentEntries)) {
    return undefined;
  }

  const badges = [
    tr(
      t,
      "settings.doctorBackgroundContinuationRuns",
      {
        total: formatNumber(runtime.totals.totalRuns),
        running: formatNumber(runtime.totals.runningRuns),
      },
      `${formatNumber(runtime.totals.totalRuns)} runs / running ${formatNumber(runtime.totals.runningRuns)}`,
    ),
    tr(
      t,
      "settings.doctorBackgroundContinuationKinds",
      {
        cron: formatNumber(runtime.kindCounts?.cron),
        heartbeat: formatNumber(runtime.kindCounts?.heartbeat),
      },
      `cron ${formatNumber(runtime.kindCounts?.cron)} / heartbeat ${formatNumber(runtime.kindCounts?.heartbeat)}`,
    ),
    tr(
      t,
      "settings.doctorBackgroundContinuationSessions",
      {
        main: formatNumber(runtime.sessionTargetCounts?.main),
        isolated: formatNumber(runtime.sessionTargetCounts?.isolated),
      },
      `main ${formatNumber(runtime.sessionTargetCounts?.main)} / isolated ${formatNumber(runtime.sessionTargetCounts?.isolated)}`,
    ),
    tr(
      t,
      "settings.doctorBackgroundContinuationStatus",
      {
        failed: formatNumber(runtime.totals.failedRuns),
        skipped: formatNumber(runtime.totals.skippedRuns),
        linked: formatNumber(runtime.totals.conversationLinkedRuns),
      },
      `failed ${formatNumber(runtime.totals.failedRuns)} / skipped ${formatNumber(runtime.totals.skippedRuns)} / linked ${formatNumber(runtime.totals.conversationLinkedRuns)}`,
    ),
  ];

  const notes = [
    tr(
      t,
      "settings.doctorBackgroundContinuationHeadline",
      { headline: runtime.headline || "-" },
      runtime.headline || "-",
    ),
  ];

  for (const entry of runtime.recentEntries.slice(0, 6)) {
    const continuation = entry?.continuationState;
    const targetId = typeof continuation?.recommendedTargetId === "string"
      ? continuation.recommendedTargetId.trim()
      : "";
    const targetType = typeof continuation?.targetType === "string"
      ? continuation.targetType.trim()
      : "";
    const parts = [
      entry.status || "unknown",
      entry.kind || "background",
      entry.sessionTarget ? `session=${entry.sessionTarget}` : "",
      targetId ? `target=${targetType || "conversation"}:${targetId}` : "",
      entry.summary ? `summary=${entry.summary}` : "",
      entry.reason ? `reason=${entry.reason}` : "",
      `started=${formatTimestamp(entry.startedAt)}`,
      typeof entry.finishedAt === "number" ? `finished=${formatTimestamp(entry.finishedAt)}` : "",
      typeof entry.nextRunAtMs === "number" ? `next=${formatTimestamp(entry.nextRunAtMs)}` : "",
    ].filter(Boolean);
    notes.push(`${entry.label || entry.sourceId}: ${parts.join(", ")}`);
  }

  return {
    title: tr(t, "settings.doctorBackgroundContinuationTitle", {}, "Background Continuation Runtime"),
    badges,
    notes,
    status: Number(runtime.totals.failedRuns) > 0 ? "warn" : "pass",
  };
}

function createDoctorCard(card) {
  const panel = document.createElement("div");
  panel.style.width = "100%";
  panel.style.padding = "10px 12px";
  panel.style.border = "1px solid var(--border-color, rgba(127,127,127,0.2))";
  panel.style.borderRadius = "10px";
  panel.style.background = "var(--bg-secondary, rgba(127,127,127,0.06))";
  panel.style.display = "flex";
  panel.style.flexDirection = "column";
  panel.style.gap = "8px";

  const title = document.createElement("div");
  title.style.fontWeight = "600";
  title.textContent = card.title;
  panel.appendChild(title);

  const badgesRow = document.createElement("div");
  badgesRow.style.display = "flex";
  badgesRow.style.flexWrap = "wrap";
  badgesRow.style.gap = "8px";
  for (const text of card.badges) {
    const badge = document.createElement("span");
    badge.className = `badge ${card.status === "warn" ? "warn" : "pass"}`;
    badge.textContent = text;
    badgesRow.appendChild(badge);
  }
  panel.appendChild(badgesRow);

  const notes = document.createElement("div");
  notes.style.display = "flex";
  notes.style.flexDirection = "column";
  notes.style.gap = "4px";
  notes.style.fontSize = "0.92em";
  for (const line of card.notes) {
    const note = document.createElement("div");
    note.textContent = line;
    notes.appendChild(note);
  }
  panel.appendChild(notes);

  return panel;
}

export function renderDoctorObservabilityCards(container, payload, t) {
  if (!container) {
    return;
  }
  const cards = [
    buildPromptObservabilityCard(payload, t),
    buildToolBehaviorCard(payload, t),
    buildToolContractV2Card(payload, t),
    buildResidentAgentsCard(payload, t),
    buildSharedGovernanceCard(payload, t),
    buildDelegationCard(payload, t),
    buildCronRuntimeCard(payload, t),
    buildBackgroundContinuationRuntimeCard(payload, t),
  ].filter(Boolean);

  for (const card of cards) {
    container.appendChild(createDoctorCard(card));
  }
}

export function buildDoctorChatSummary(payload, t) {
  const lines = [];
  const promptCard = buildPromptObservabilityCard(payload, t);
  if (promptCard) {
    lines.push(``);
    lines.push(`${promptCard.title}:`);
    lines.push(...promptCard.badges.map((badge) => `- ${badge}`));
    lines.push(...promptCard.notes.map((note) => `- ${note}`));
  }

  const toolCard = buildToolBehaviorCard(payload, t);
  if (toolCard) {
    lines.push(``);
    lines.push(`${toolCard.title}:`);
    lines.push(...toolCard.badges.map((badge) => `- ${badge}`));
    lines.push(...toolCard.notes.map((note) => `- ${note}`));
  }

  const toolContractV2Card = buildToolContractV2Card(payload, t);
  if (toolContractV2Card) {
    lines.push(``);
    lines.push(`${toolContractV2Card.title}:`);
    lines.push(...toolContractV2Card.badges.map((badge) => `- ${badge}`));
    lines.push(...toolContractV2Card.notes.map((note) => `- ${note}`));
  }

  const residentAgentsCard = buildResidentAgentsCard(payload, t);
  if (residentAgentsCard) {
    lines.push(``);
    lines.push(`${residentAgentsCard.title}:`);
    lines.push(...residentAgentsCard.badges.map((badge) => `- ${badge}`));
    lines.push(...residentAgentsCard.notes.map((note) => `- ${note}`));
  }

  const sharedGovernanceCard = buildSharedGovernanceCard(payload, t);
  if (sharedGovernanceCard) {
    lines.push(``);
    lines.push(`${sharedGovernanceCard.title}:`);
    lines.push(...sharedGovernanceCard.badges.map((badge) => `- ${badge}`));
    lines.push(...sharedGovernanceCard.notes.map((note) => `- ${note}`));
  }

  const delegationCard = buildDelegationCard(payload, t);
  if (delegationCard) {
    lines.push(``);
    lines.push(`${delegationCard.title}:`);
    lines.push(...delegationCard.badges.map((badge) => `- ${badge}`));
    lines.push(...delegationCard.notes.map((note) => `- ${note}`));
  }

  const cronCard = buildCronRuntimeCard(payload, t);
  if (cronCard) {
    lines.push(``);
    lines.push(`${cronCard.title}:`);
    lines.push(...cronCard.badges.map((badge) => `- ${badge}`));
    lines.push(...cronCard.notes.map((note) => `- ${note}`));
  }

  const backgroundContinuationCard = buildBackgroundContinuationRuntimeCard(payload, t);
  if (backgroundContinuationCard) {
    lines.push(``);
    lines.push(`${backgroundContinuationCard.title}:`);
    lines.push(...backgroundContinuationCard.badges.map((badge) => `- ${badge}`));
    lines.push(...backgroundContinuationCard.notes.map((note) => `- ${note}`));
  }

  return lines;
}
