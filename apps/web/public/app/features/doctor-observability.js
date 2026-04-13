import { buildResidentDoctorNote } from "./resident-observability-summary.js";
import { buildLaunchExplainabilityLines } from "./agent-launch-explainability.js";
import { buildResidentStateBindingLines } from "./resident-state-binding-lines.js";
import { buildContinuationAction } from "./continuation-targets.js";
import { buildExternalOutboundDiagnosis } from "./external-outbound-diagnosis.js";

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

function formatKeyCountSummary(value) {
  const entries = Object.entries(value || {}).filter(([, count]) => Number.isFinite(count) && Number(count) > 0);
  if (entries.length === 0) {
    return "-";
  }
  return entries.map(([key, count]) => `${key}:${count}`).join(", ");
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

function buildMindProfileSnapshotCard(payload, t) {
  const snapshot = payload?.mindProfileSnapshot;
  const summary = snapshot?.summary;
  if (!summary) {
    return undefined;
  }

  const badges = [
    tr(
      t,
      "settings.doctorMindProfileUser",
      { status: summary.hasUserProfile ? "ready" : "missing" },
      `user ${summary.hasUserProfile ? "ready" : "missing"}`,
    ),
    tr(
      t,
      "settings.doctorMindProfileMemory",
      {
        private: formatNumber(summary.privateMemoryCount),
        shared: formatNumber(summary.sharedMemoryCount),
      },
      `private ${formatNumber(summary.privateMemoryCount)} / shared ${formatNumber(summary.sharedMemoryCount)}`,
    ),
    tr(
      t,
      "settings.doctorMindProfileDigest",
      {
        active: formatNumber(summary.activeResidentCount),
        ready: formatNumber(summary.digestReadyCount),
        updated: formatNumber(summary.digestUpdatedCount),
      },
      `active ${formatNumber(summary.activeResidentCount)} / digest ${formatNumber(summary.digestReadyCount)} ready ${formatNumber(summary.digestUpdatedCount)} updated`,
    ),
    tr(
      t,
      "settings.doctorMindProfileUsage",
      { count: formatNumber(summary.usageLinkedCount) },
      `${formatNumber(summary.usageLinkedCount)} usage-linked resident(s)`,
    ),
  ];

  const notes = [
    tr(
      t,
      "settings.doctorMindProfileHeadline",
      { headline: summary.headline },
      summary.headline,
    ),
  ];

  const profileLines = Array.isArray(snapshot?.profile?.summaryLines) ? snapshot.profile.summaryLines : [];
  notes.push(...profileLines.slice(0, 6));

  const topResidents = Array.isArray(snapshot?.conversation?.topResidents) ? snapshot.conversation.topResidents : [];
  for (const item of topResidents.slice(0, 3)) {
    notes.push(`Resident: ${item.headline}`);
  }

  const snippets = Array.isArray(snapshot?.memory?.recentMemorySnippets) ? snapshot.memory.recentMemorySnippets : [];
  for (const item of snippets.slice(0, 3)) {
    notes.push(`${item.scope === "shared" ? "Shared" : "Private"} recent: ${item.text}`);
  }

  return {
    title: tr(t, "settings.doctorMindProfileTitle", {}, "Mind / Profile Snapshot"),
    badges,
    notes,
    status: summary.available ? "pass" : "warn",
  };
}

function buildLearningReviewInputCard(payload, t) {
  const input = payload?.learningReviewInput;
  const summary = input?.summary;
  const runtime = payload?.learningReviewNudgeRuntime?.summary;
  if (!summary && !runtime) {
    return undefined;
  }

  const badges = [
    tr(
      t,
      "settings.doctorLearningReviewSignals",
      {
        memory: formatNumber(summary?.memorySignalCount),
        candidate: formatNumber(summary?.candidateSignalCount),
        review: formatNumber(summary?.reviewSignalCount),
      },
      `memory ${formatNumber(summary?.memorySignalCount)} / candidate ${formatNumber(summary?.candidateSignalCount)} / review ${formatNumber(summary?.reviewSignalCount)}`,
    ),
    tr(
      t,
      "settings.doctorLearningReviewNudges",
      { count: formatNumber(summary?.nudgeCount) },
      `${formatNumber(summary?.nudgeCount)} nudges`,
    ),
  ];
  if (runtime) {
    badges.push(
      tr(
        t,
        "settings.doctorLearningReviewRuntime",
        { state: runtime.triggered ? "triggered" : "idle" },
        `runtime ${runtime.triggered ? "triggered" : "idle"}`,
      ),
    );
    badges.push(
      tr(
        t,
        "settings.doctorLearningReviewSession",
        { kind: runtime.sessionKind || "main" },
        `session ${runtime.sessionKind || "main"}`,
      ),
    );
  }

  const notes = [];
  if (summary) {
    notes.push(tr(
      t,
      "settings.doctorLearningReviewHeadline",
      { headline: summary.headline },
      summary.headline,
    ));
  }
  if (runtime) {
    notes.push(tr(
      t,
      "settings.doctorLearningReviewRuntimeHeadline",
      { headline: runtime.headline },
      runtime.headline,
    ));
    if (Array.isArray(runtime.triggerSources) && runtime.triggerSources.length > 0) {
      notes.push(tr(
        t,
        "settings.doctorLearningReviewTriggerSources",
        { summary: runtime.triggerSources.join(", ") },
        `sources: ${runtime.triggerSources.join(", ")}`,
      ));
    }
    if (Array.isArray(runtime.signalKinds) && runtime.signalKinds.length > 0) {
      notes.push(tr(
        t,
        "settings.doctorLearningReviewSignalKinds",
        { summary: runtime.signalKinds.join(", ") },
        `signals: ${runtime.signalKinds.join(", ")}`,
      ));
    }
    if (payload?.learningReviewNudgeRuntime?.latest?.currentTurnPreview) {
      notes.push(`Latest turn: ${payload.learningReviewNudgeRuntime.latest.currentTurnPreview}`);
    }
  }

  const summaryLines = Array.isArray(input?.summaryLines) ? input.summaryLines : [];
  notes.push(...summaryLines.slice(0, 4));

  const nudges = Array.isArray(input?.nudges) ? input.nudges : [];
  for (const item of nudges.slice(0, 4)) {
    notes.push(`Nudge: ${item}`);
  }

  return {
    title: tr(t, "settings.doctorLearningReviewTitle", {}, "Learning / Review Input"),
    badges,
    notes,
    status: runtime?.available || summary?.available ? "pass" : "warn",
  };
}

function buildSkillFreshnessCard(payload, t) {
  const summary = payload?.skillFreshness?.summary;
  if (!summary) {
    return undefined;
  }

  const badges = [
    tr(
      t,
      "settings.doctorSkillFreshnessCounts",
      {
        healthy: formatNumber(summary.healthyCount),
        warn: formatNumber(summary.warnCount),
        patch: formatNumber(summary.needsPatchCount),
        fresh: formatNumber(summary.needsNewSkillCount),
      },
      `healthy ${formatNumber(summary.healthyCount)} / warn ${formatNumber(summary.warnCount)} / patch ${formatNumber(summary.needsPatchCount)} / new ${formatNumber(summary.needsNewSkillCount)}`,
    ),
  ];

  const notes = [
    tr(
      t,
      "settings.doctorSkillFreshnessHeadline",
      { headline: summary.headline || "-" },
      summary.headline || "-",
    ),
  ];
  const topItems = Array.isArray(summary.topItems) ? summary.topItems.slice(0, 4) : [];
  if (!topItems.length) {
    notes.push(tr(t, "settings.doctorSkillFreshnessEmpty", {}, "当前没有需要处理的 skill freshness 风险。"));
  }
  for (const item of topItems) {
    notes.push(tr(
      t,
      "settings.doctorSkillFreshnessTopItem",
      {
        name: item.displayName || item.skillKey || "-",
        status: item.status || "healthy",
        summary: item.summary || "-",
      },
      `${item.displayName || item.skillKey || "-"} [${item.status || "healthy"}]: ${item.summary || "-"}`,
    ));
  }

  return {
    title: tr(t, "settings.doctorSkillFreshnessTitle", {}, "Skill Freshness"),
    badges,
    notes,
    status: (Number(summary.warnCount) || 0) + (Number(summary.needsPatchCount) || 0) + (Number(summary.needsNewSkillCount) || 0) > 0
      ? "warn"
      : summary.available
        ? "pass"
        : "warn",
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
        subtask: formatNumber(runtime.kindCounts?.subtask),
      },
      `cron ${formatNumber(runtime.kindCounts?.cron)} / heartbeat ${formatNumber(runtime.kindCounts?.heartbeat)} / subtask ${formatNumber(runtime.kindCounts?.subtask)}`,
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
    tr(
      t,
      "settings.doctorBackgroundContinuationRecovery",
      {
        attempted: formatNumber(runtime.totals.recoveryAttemptedRuns),
        succeeded: formatNumber(runtime.totals.recoverySucceededRuns),
        recoverable: formatNumber(runtime.totals.recoverableFailedRuns),
      },
      `recovery ${formatNumber(runtime.totals.recoverySucceededRuns)}/${formatNumber(runtime.totals.recoveryAttemptedRuns)} / recoverable ${formatNumber(runtime.totals.recoverableFailedRuns)}`,
    ),
  ];

  const notes = [{
    text: tr(
      t,
      "settings.doctorBackgroundContinuationHeadline",
      { headline: runtime.headline || "-" },
      runtime.headline || "-",
    ),
  }];

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
      entry.latestRecoveryOutcome ? `recovery=${entry.latestRecoveryOutcome}` : "",
      entry.latestRecoveryRunId ? `recoveryRun=${entry.latestRecoveryRunId}` : "",
      entry.recoveredFromRunId ? `recoveredFrom=${entry.recoveredFromRunId}` : "",
      entry.latestRecoveryReason ? `recoveryReason=${entry.latestRecoveryReason}` : "",
      `started=${formatTimestamp(entry.startedAt)}`,
      typeof entry.finishedAt === "number" ? `finished=${formatTimestamp(entry.finishedAt)}` : "",
      typeof entry.nextRunAtMs === "number" ? `next=${formatTimestamp(entry.nextRunAtMs)}` : "",
    ].filter(Boolean);
    const text = `${entry.label || entry.sourceId}: ${parts.join(", ")}`;
    const action = continuation?.recommendedTargetId ? buildContinuationAction(continuation) : null;
    notes.push(action ? { text, action } : { text });
  }

  return {
    title: tr(t, "settings.doctorBackgroundContinuationTitle", {}, "Background Continuation Runtime"),
    badges,
    notes,
    status: Number(runtime.totals.failedRuns) > 0 ? "warn" : "pass",
  };
}

function buildExternalOutboundRuntimeCard(payload, t) {
  const runtime = payload?.externalOutboundRuntime;
  if (!runtime?.totals) {
    return undefined;
  }

  const badges = [
    tr(
      t,
      "settings.doctorExternalOutboundTotal",
      {
        total: formatNumber(runtime.totals.totalRecords),
        sent: formatNumber(runtime.totals.sentCount),
        failed: formatNumber(runtime.totals.failedCount),
      },
      `${formatNumber(runtime.totals.totalRecords)} records / sent ${formatNumber(runtime.totals.sentCount)} / failed ${formatNumber(runtime.totals.failedCount)}`,
    ),
    tr(
      t,
      "settings.doctorExternalOutboundFailures",
      {
        resolve: formatNumber(runtime.failureStageCounts?.resolve),
        delivery: formatNumber(runtime.failureStageCounts?.delivery),
        confirmation: formatNumber(runtime.failureStageCounts?.confirmation),
      },
      `resolve ${formatNumber(runtime.failureStageCounts?.resolve)} / delivery ${formatNumber(runtime.failureStageCounts?.delivery)} / confirmation ${formatNumber(runtime.failureStageCounts?.confirmation)}`,
    ),
    tr(
      t,
      "settings.doctorExternalOutboundDecision",
      {
        confirmed: formatNumber(runtime.totals.confirmedCount),
        autoApproved: formatNumber(runtime.totals.autoApprovedCount),
        rejected: formatNumber(runtime.totals.rejectedCount),
      },
      `confirmed ${formatNumber(runtime.totals.confirmedCount)} / auto ${formatNumber(runtime.totals.autoApprovedCount)} / rejected ${formatNumber(runtime.totals.rejectedCount)}`,
    ),
    tr(
      t,
      "settings.doctorExternalOutboundConfirmMode",
      { mode: runtime.requireConfirmation ? "required" : "disabled" },
      runtime.requireConfirmation ? "confirm required" : "confirm disabled",
    ),
  ];

  const notes = [
    tr(
      t,
      "settings.doctorExternalOutboundHeadline",
      { headline: runtime.headline || "-" },
      runtime.headline || "-",
    ),
    tr(
      t,
      "settings.doctorExternalOutboundChannels",
      { summary: formatKeyCountSummary(runtime.channelCounts) },
      `channels ${formatKeyCountSummary(runtime.channelCounts)}`,
    ),
    tr(
      t,
      "settings.doctorExternalOutboundErrorCodes",
      { summary: formatKeyCountSummary(runtime.errorCodeCounts) },
      `error codes ${formatKeyCountSummary(runtime.errorCodeCounts)}`,
    ),
  ];

  const recentFailures = Array.isArray(runtime.recentFailures) ? runtime.recentFailures : [];
  for (const item of recentFailures.slice(0, 4)) {
    const diagnosis = buildExternalOutboundDiagnosis({
      errorCode: item?.errorCode,
      error: item?.error,
      targetSessionKey: item?.targetSessionKey,
      delivery: item?.delivery,
    }, t);
    const parts = [
      item.targetChannel || "unknown",
      diagnosis.summary,
      item.resolution ? `resolution=${item.resolution}` : "",
      item.requestedSessionKey ? `requested=${item.requestedSessionKey}` : "",
      item.targetSessionKey ? `target=${item.targetSessionKey}` : "",
      item.contentPreview ? `preview=${item.contentPreview}` : "",
      `time=${formatTimestamp(item.timestamp)}`,
    ].filter(Boolean);
    notes.push(parts.join(", "));
  }

  notes.push(tr(
    t,
    "settings.doctorExternalOutboundAuditHint",
    {},
    "详细逐条记录仍可在 记忆查看 -> 外发审计 中查看。",
  ));

  return {
    title: tr(t, "settings.doctorExternalOutboundTitle", {}, "External Outbound Runtime"),
    badges,
    notes,
    status: Number(runtime.totals.failedCount) > 0 || runtime.requireConfirmation !== true ? "warn" : "pass",
  };
}

function buildDeploymentBackendsCard(payload, t) {
  const runtime = payload?.deploymentBackends;
  if (!runtime?.summary || !Array.isArray(runtime?.items)) {
    return undefined;
  }

  const selectedLabel = runtime.summary.selectedProfileId || "-";
  const badges = [
    tr(
      t,
      "settings.doctorDeploymentBackendsProfiles",
      {
        enabled: formatNumber(runtime.summary.enabledCount),
        total: formatNumber(runtime.summary.profileCount),
      },
      `${formatNumber(runtime.summary.enabledCount)}/${formatNumber(runtime.summary.profileCount)} profiles enabled`,
    ),
    tr(
      t,
      "settings.doctorDeploymentBackendsKinds",
      {
        local: formatNumber(runtime.summary.backendCounts?.local),
        docker: formatNumber(runtime.summary.backendCounts?.docker),
        ssh: formatNumber(runtime.summary.backendCounts?.ssh),
      },
      `local ${formatNumber(runtime.summary.backendCounts?.local)} / docker ${formatNumber(runtime.summary.backendCounts?.docker)} / ssh ${formatNumber(runtime.summary.backendCounts?.ssh)}`,
    ),
    tr(
      t,
      "settings.doctorDeploymentBackendsSelected",
      {
        profile: selectedLabel,
        backend: runtime.summary.selectedBackend || "-",
      },
      `selected ${selectedLabel} (${runtime.summary.selectedBackend || "-"})`,
    ),
    tr(
      t,
      "settings.doctorDeploymentBackendsWarnings",
      { count: formatNumber(runtime.summary.warningCount) },
      `${formatNumber(runtime.summary.warningCount)} warning profiles`,
    ),
  ];

  const notes = [
    tr(
      t,
      "settings.doctorDeploymentBackendsHeadline",
      { headline: runtime.headline || "-" },
      runtime.headline || "-",
    ),
    `config: ${runtime.configPath || "-"}`,
  ];

  if (runtime.summary.selectedProfileId && runtime.summary.selectedResolved === false) {
    notes.push(`selected profile not found: ${runtime.summary.selectedProfileId}`);
  }

  for (const item of runtime.items.slice(0, 6)) {
    notes.push(`${item.label}: ${item.message}`);
  }

  return {
    title: tr(t, "settings.doctorDeploymentBackendsTitle", {}, "Deployment Backends"),
    badges,
    notes,
    status: runtime.summary.warningCount > 0 || runtime.summary.selectedResolved === false ? "warn" : "pass",
  };
}

function buildRuntimeResilienceCard(payload, t) {
  const runtime = payload?.runtimeResilience;
  if (!runtime?.routing?.primary || !runtime?.summary) {
    return undefined;
  }

  const latest = runtime.latest;
  const diagnostics = resolveRuntimeResilienceDiagnostics(payload, runtime);
  const badges = [
    tr(
      t,
      "settings.doctorRuntimeResiliencePrimary",
      { route: `${runtime.routing.primary.provider}/${runtime.routing.primary.model}` },
      `primary ${runtime.routing.primary.provider}/${runtime.routing.primary.model}`,
    ),
    tr(
      t,
      "settings.doctorRuntimeResilienceFallbacks",
      { count: formatNumber(runtime.routing.fallbacks?.length) },
      `${formatNumber(runtime.routing.fallbacks?.length)} fallbacks`,
    ),
    tr(
      t,
      "settings.doctorRuntimeResilienceAlert",
      { level: diagnostics.alertLevel, code: diagnostics.alertCode },
      `alert ${diagnostics.alertLevel}/${diagnostics.alertCode}`,
    ),
  ];
  if (latest) {
    badges.push(tr(
      t,
      "settings.doctorRuntimeResilienceLatest",
      { status: latest.finalStatus || "idle" },
      `latest ${latest.finalStatus || "idle"}`,
    ));
    badges.push(tr(
      t,
      "settings.doctorRuntimeResilienceSignals",
      {
        retry: formatNumber(latest.stepCounts?.sameProfileRetries),
        switch: formatNumber(latest.stepCounts?.crossProfileFallbacks),
        cooldown: formatNumber(latest.stepCounts?.cooldownSkips),
      },
      `retry ${formatNumber(latest.stepCounts?.sameProfileRetries)} / switch ${formatNumber(latest.stepCounts?.crossProfileFallbacks)} / cooldown ${formatNumber(latest.stepCounts?.cooldownSkips)}`,
    ));
  }

  const notes = [
    tr(
      t,
      "settings.doctorRuntimeResilienceAlertMessage",
      { message: diagnostics.alertMessage },
      diagnostics.alertMessage,
    ),
    tr(
      t,
      "settings.doctorRuntimeResilienceHeadline",
      { headline: runtime.summary.headline || "-" },
      runtime.summary.headline || "-",
    ),
  ];
  if (runtime.routing.compaction?.configured) {
    notes.push(tr(
      t,
      "settings.doctorRuntimeResilienceCompaction",
      {
        route: runtime.routing.compaction.route
          ? `${runtime.routing.compaction.route.provider}/${runtime.routing.compaction.route.model}`
          : "-",
      },
      `compaction route ${runtime.routing.compaction.route ? `${runtime.routing.compaction.route.provider}/${runtime.routing.compaction.route.model}` : "-"}`,
    ));
  }
  if (latest?.headline) {
    notes.push(latest.headline);
  }
  if (diagnostics.overallReasonSummary) {
    notes.push(tr(
      t,
      "settings.doctorRuntimeResilienceOverallReasons",
      { summary: diagnostics.overallReasonSummary },
      `reasons: ${diagnostics.overallReasonSummary}`,
    ));
  }
  if (diagnostics.dominantReason) {
    notes.push(tr(
      t,
      "settings.doctorRuntimeResilienceReasonFocus",
      { reason: diagnostics.dominantReason },
      `reason focus: ${diagnostics.dominantReason}`,
    ));
  }
  if (diagnostics.reasonClusterSummary) {
    notes.push(tr(
      t,
      "settings.doctorRuntimeResilienceReasonCluster",
      { summary: diagnostics.reasonClusterSummary },
      `reason cluster: ${diagnostics.reasonClusterSummary}`,
    ));
  }
  if (diagnostics.latestSignal) {
    notes.push(tr(
      t,
      "settings.doctorRuntimeResilienceLatestSignal",
      { summary: diagnostics.latestSignal },
      `latest signal: ${diagnostics.latestSignal}`,
    ));
  }
  if (diagnostics.latestRouteBehavior) {
    notes.push(tr(
      t,
      "settings.doctorRuntimeResilienceRouteBehavior",
      { summary: diagnostics.latestRouteBehavior },
      `route: ${diagnostics.latestRouteBehavior}`,
    ));
  }
  notes.push(tr(
    t,
    "settings.doctorRuntimeResilienceTotals",
    {
      summary: diagnostics.totalsSummary,
    },
    `totals: ${diagnostics.totalsSummary}`,
  ));
  if (diagnostics.latestReasonSummary) {
    notes.push(tr(
      t,
      "settings.doctorRuntimeResilienceLatestReasons",
      { summary: diagnostics.latestReasonSummary },
      `latest reasons: ${diagnostics.latestReasonSummary}`,
    ));
  }
  if (diagnostics.recoveryHint) {
    notes.push(tr(
      t,
      "settings.doctorRuntimeResilienceRecoveryHint",
      { hint: diagnostics.recoveryHint },
      `recovery hint: ${diagnostics.recoveryHint}`,
    ));
  }
  if (diagnostics.mixedSignalHint) {
    notes.push(tr(
      t,
      "settings.doctorRuntimeResilienceMixedSignal",
      { hint: diagnostics.mixedSignalHint },
      `mixed signal: ${diagnostics.mixedSignalHint}`,
    ));
  }

  return {
    title: tr(t, "settings.doctorRuntimeResilienceTitle", {}, "Runtime Resilience"),
    badges,
    notes,
    status: diagnostics.alertLevel,
  };
}

function resolveRuntimeResilienceDiagnostics(payload, runtime) {
  const launchView = payload?.promptObservability?.launchExplainability?.runtimeResilience;
  if (
    payload?.runtimeResilienceDiagnostics?.alertLevel
    && payload?.runtimeResilienceDiagnostics?.alertCode
    && payload?.runtimeResilienceDiagnostics?.alertMessage
  ) {
    return payload.runtimeResilienceDiagnostics;
  }
  if (
    launchView?.alertLevel
    && launchView?.alertCode
    && launchView?.alertMessage
    && launchView?.totalsSummary
  ) {
    return {
      alertLevel: launchView.alertLevel,
      alertCode: launchView.alertCode,
      alertMessage: launchView.alertMessage,
      dominantReason: launchView.dominantReason || null,
      reasonClusterSummary: launchView.reasonClusterSummary || null,
      mixedSignalHint: launchView.mixedSignalHint || null,
      recoveryHint: launchView.recoveryHint || null,
      latestSignal: launchView.latestSignal || null,
      latestRouteBehavior: launchView.latestRouteBehavior || null,
      latestReasonSummary: launchView.latestReasonSummary || null,
      overallReasonSummary: launchView.overallReasonSummary || null,
      totalsSummary: launchView.totalsSummary,
    };
  }
  return buildLegacyRuntimeResilienceDiagnostics(runtime);
}

function buildLegacyRuntimeResilienceDiagnostics(runtime) {
  const latest = runtime?.latest;
  const observedRuns = Number(runtime?.totals?.observedRuns) || 0;
  const degradedRuns = Number(runtime?.totals?.degradedRuns) || 0;
  const failedRuns = Number(runtime?.totals?.failedRuns) || 0;
  const updatedAt = Number(runtime?.updatedAt) || 0;
  const ageMs = Math.max(0, Date.now() - updatedAt);
  const staleAfterMs = 6 * 60 * 60 * 1000;
  const failureRate = observedRuns > 0 ? failedRuns / observedRuns : 0;
  const degradeRate = observedRuns > 0 ? degradedRuns / observedRuns : 0;
  const summary = buildLegacyRuntimeResilienceSummary(runtime, latest);
  const reasonSignal = buildLegacyRuntimeResilienceReasonSignal(summary);

  if (!latest || observedRuns <= 0) {
    return {
      ...summary,
      alertLevel: "warn",
      alertCode: "no_signal",
      alertMessage: "No runtime resilience signal has been observed yet.",
      dominantReason: null,
      reasonClusterSummary: null,
      mixedSignalHint: null,
      recoveryHint: "Run one real chat/tool request first so runtime resilience can capture a signal.",
      latestSignal: null,
      latestRouteBehavior: null,
    };
  }
  if (ageMs >= staleAfterMs) {
    return {
      ...summary,
      alertLevel: "warn",
      alertCode: "stale",
      alertMessage: `Latest runtime resilience signal is stale (${formatRuntimeAge(ageMs)} old).`,
      dominantReason: reasonSignal.dominantReason,
      reasonClusterSummary: reasonSignal.reasonClusterSummary,
      mixedSignalHint: null,
      recoveryHint: "Exercise the runtime again before trusting this signal; current diagnostics are too old.",
    };
  }
  if (failedRuns >= 2 && failureRate >= 0.5) {
    return {
      ...summary,
      alertLevel: "fail",
      alertCode: "repeated_failure",
      alertMessage: `Repeated runtime failures observed (${failedRuns}/${observedRuns} runs failed).`,
      dominantReason: reasonSignal.dominantReason,
      reasonClusterSummary: reasonSignal.reasonClusterSummary,
      mixedSignalHint: buildLegacyRuntimeResilienceMixedSignalHint("repeated_failure", reasonSignal.clusterReasons),
      recoveryHint: buildLegacyRuntimeResilienceRecoveryHint("repeated_failure", reasonSignal.clusterReasons),
    };
  }
  if (latest.finalStatus !== "success") {
    return {
      ...summary,
      alertLevel: "warn",
      alertCode: "recent_failure",
      alertMessage: `Latest runtime ended as ${latest.finalStatus || "unknown"}.`,
      dominantReason: reasonSignal.dominantReason,
      reasonClusterSummary: reasonSignal.reasonClusterSummary,
      mixedSignalHint: buildLegacyRuntimeResilienceMixedSignalHint("recent_failure", reasonSignal.clusterReasons),
      recoveryHint: buildLegacyRuntimeResilienceRecoveryHint("recent_failure", reasonSignal.clusterReasons),
    };
  }
  if (degradedRuns >= 3 && degradeRate >= 0.5) {
    return {
      ...summary,
      alertLevel: "warn",
      alertCode: "repeated_degrade",
      alertMessage: `Repeated runtime degrade observed (${degradedRuns}/${observedRuns} runs degraded).`,
      dominantReason: reasonSignal.dominantReason,
      reasonClusterSummary: reasonSignal.reasonClusterSummary,
      mixedSignalHint: buildLegacyRuntimeResilienceMixedSignalHint("repeated_degrade", reasonSignal.clusterReasons),
      recoveryHint: buildLegacyRuntimeResilienceRecoveryHint("repeated_degrade", reasonSignal.clusterReasons),
    };
  }
  if (latest.degraded) {
    return {
      ...summary,
      alertLevel: "warn",
      alertCode: "recent_degrade",
      alertMessage: "Latest runtime required retry/fallback to recover.",
      dominantReason: reasonSignal.dominantReason,
      reasonClusterSummary: reasonSignal.reasonClusterSummary,
      mixedSignalHint: buildLegacyRuntimeResilienceMixedSignalHint("recent_degrade", reasonSignal.clusterReasons),
      recoveryHint: buildLegacyRuntimeResilienceRecoveryHint("recent_degrade", reasonSignal.clusterReasons),
    };
  }
  return {
    ...summary,
    alertLevel: "pass",
    alertCode: "healthy",
    alertMessage: "Runtime resilience looks healthy.",
    dominantReason: reasonSignal.dominantReason,
    reasonClusterSummary: reasonSignal.reasonClusterSummary,
    mixedSignalHint: null,
    recoveryHint: null,
  };
}

function buildLegacyRuntimeResilienceSummary(runtime, latest) {
  return {
    latestSignal: buildRuntimeResilienceSignalSummary(latest),
    latestRouteBehavior: buildRuntimeResilienceRouteBehavior(runtime, latest),
    latestReasonSummary: formatKeyCountSummary(latest?.reasonCounts),
    overallReasonSummary: formatKeyCountSummary(runtime?.reasonCounts),
    totalsSummary: buildRuntimeResilienceTotalsSummary(runtime),
  };
}

function buildLegacyRuntimeResilienceReasonSignal(summary) {
  const entries = buildLegacyReasonEntries(summary.latestReasonSummary || summary.overallReasonSummary || "");
  if (entries.length === 0) {
    return {
      dominantReason: null,
      reasonClusterSummary: null,
      clusterReasons: [],
    };
  }
  const primary = entries[0];
  const cluster = [primary];
  for (const entry of entries.slice(1, 3)) {
    if (entry.count >= Math.max(1, Math.ceil(primary.count * 0.5))) {
      cluster.push(entry);
    }
  }
  return {
    dominantReason: cluster[0]?.reason ?? null,
    reasonClusterSummary: cluster.length <= 1
      ? cluster[0]?.reason ?? null
      : cluster.map((entry) => entry.reason).join(" + "),
    clusterReasons: cluster.map((entry) => entry.reason),
  };
}

function buildLegacyReasonEntries(summary) {
  return String(summary)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => {
      const [reason, count] = item.split("=");
      return {
        reason: reason?.trim() || "",
        count: Number(count) || 0,
      };
    })
    .filter((entry) => entry.reason && entry.count > 0);
}

function buildLegacyRuntimeResilienceRecoveryHint(alertCode, clusterReasons) {
  if (alertCode === "healthy") {
    return null;
  }
  const dominantReason = clusterReasons[0] || null;
  switch (dominantReason) {
    case "rate_limit":
      return "Rate limits dominate; lower concurrency or move quota-sensitive traffic to a preferred fallback/provider.";
    case "timeout":
      return "Timeouts dominate; check baseUrl/proxy latency and raise requestTimeoutMs for the affected profiles if needed.";
    case "server_error":
      return "5xx instability dominates; keep fallback ready and verify provider health before trusting the primary route.";
    case "auth":
      return "Auth failures dominate; verify API keys, token scopes, and profile selection for primary/fallback routes.";
    case "billing":
      return "Billing/quota failures dominate; verify provider balance or quota before retrying this route.";
    case "format":
      return "Request format mismatches dominate; verify protocol, wireApi, and model pairing instead of retrying.";
    case "unknown":
      return "Unclassified failures dominate; inspect the latest provider error payload before widening retries.";
    default:
      return alertCode === "recent_failure" || alertCode === "repeated_failure"
        ? "Recent runtime failures need manual inspection; review the latest provider response before retrying."
        : "Repeated degrade suggests this route is unstable; review provider health and fallback ordering.";
  }
}

function buildLegacyRuntimeResilienceMixedSignalHint(alertCode, clusterReasons) {
  if (alertCode === "healthy" || clusterReasons.length < 2) {
    return null;
  }
  const key = [...clusterReasons.slice(0, 2)].sort().join("+");
  switch (key) {
    case "rate_limit+timeout":
      return "Mixed rate-limit + timeout signals suggest both quota pressure and latency; reduce burstiness and check network/proxy latency together.";
    case "rate_limit+server_error":
      return "Mixed rate-limit + 5xx signals suggest provider saturation; shift traffic to fallback routes and reduce bursty retry patterns.";
    case "server_error+timeout":
      return "Mixed 5xx + timeout signals suggest upstream instability; verify provider health and network latency before widening retries.";
    case "auth+billing":
      return "Mixed auth + billing signals suggest the route may be both under-scoped and out of quota; verify keys, scopes, and provider balance together.";
    default:
      return `Mixed signals (${clusterReasons.slice(0, 2).join(" + ")}) detected; inspect the latest provider errors before tuning retry/fallback policy.`;
  }
}

function buildRuntimeResilienceSignalSummary(latest) {
  if (!latest?.source && !latest?.phase && !latest?.agentId && !latest?.conversationId) {
    return null;
  }
  return [
    latest?.source && latest?.phase ? `${latest.source}/${latest.phase}` : latest?.source || latest?.phase || "",
    latest?.agentId ? `agent=${latest.agentId}` : "",
    latest?.conversationId ? `conv=${latest.conversationId}` : "",
  ].filter(Boolean).join(" | ");
}

function buildRuntimeResilienceRouteBehavior(runtime, latest) {
  if (!latest) return null;
  const primaryRoute = `${runtime?.routing?.primary?.profileId || "-"}/${runtime?.routing?.primary?.model || "-"}`;
  const finalRoute = latest.finalProfileId
    ? `${latest.finalProfileId}/${latest.finalModel || "-"}`
    : "";
  if (latest.degraded && finalRoute && latest.finalProfileId !== runtime?.routing?.primary?.profileId) {
    return `switched ${primaryRoute} -> ${finalRoute}`;
  }
  if (latest.degraded && finalRoute) {
    return `stayed on ${finalRoute} after retry`;
  }
  if (latest.finalStatus !== "success" && finalRoute) {
    return `stopped on ${finalRoute}`;
  }
  if (latest.finalStatus !== "success") {
    return `ended without a usable route after ${primaryRoute}`;
  }
  if (finalRoute) {
    return `stayed on ${finalRoute}`;
  }
  return null;
}

function buildRuntimeResilienceTotalsSummary(runtime) {
  return `observed=${formatNumber(runtime?.totals?.observedRuns)}, degraded=${formatNumber(runtime?.totals?.degradedRuns)}, failed=${formatNumber(runtime?.totals?.failedRuns)}, retry=${formatNumber(runtime?.totals?.sameProfileRetries)}, switch=${formatNumber(runtime?.totals?.crossProfileFallbacks)}, cooldown=${formatNumber(runtime?.totals?.cooldownSkips)}`;
}

function formatRuntimeAge(ageMs) {
  const minutes = Math.floor(ageMs / 60000);
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function createDoctorCard(card, handlers = {}) {
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
    const noteText = typeof line === "string" ? line : line?.text || "";
    const action = line && typeof line === "object" ? line.action : null;
    if (action && typeof handlers.onOpenContinuationAction === "function") {
      const note = document.createElement("button");
      note.type = "button";
      note.className = "button goal-inline-action-secondary";
      note.style.textAlign = "left";
      note.textContent = noteText;
      note.addEventListener("click", () => {
        void handlers.onOpenContinuationAction(action);
      });
      notes.appendChild(note);
      continue;
    }
    const note = document.createElement("div");
    note.textContent = noteText;
    notes.appendChild(note);
  }
  panel.appendChild(notes);

  return panel;
}

export function renderDoctorObservabilityCards(container, payload, t, handlers = {}) {
  if (!container) {
    return;
  }
  const cards = [
    buildPromptObservabilityCard(payload, t),
    buildToolBehaviorCard(payload, t),
    buildToolContractV2Card(payload, t),
    buildResidentAgentsCard(payload, t),
    buildMindProfileSnapshotCard(payload, t),
    buildLearningReviewInputCard(payload, t),
    buildSkillFreshnessCard(payload, t),
    buildSharedGovernanceCard(payload, t),
    buildDelegationCard(payload, t),
    buildCronRuntimeCard(payload, t),
    buildBackgroundContinuationRuntimeCard(payload, t),
    buildExternalOutboundRuntimeCard(payload, t),
    buildDeploymentBackendsCard(payload, t),
    buildRuntimeResilienceCard(payload, t),
  ].filter(Boolean);

  for (const card of cards) {
    container.appendChild(createDoctorCard(card, handlers));
  }
}

export function buildDoctorChatSummary(payload, t) {
  const formatNote = (note) => typeof note === "string" ? note : note?.text || "";
  const lines = [];
  const promptCard = buildPromptObservabilityCard(payload, t);
  if (promptCard) {
    lines.push(``);
    lines.push(`${promptCard.title}:`);
    lines.push(...promptCard.badges.map((badge) => `- ${badge}`));
    lines.push(...promptCard.notes.map((note) => `- ${formatNote(note)}`));
  }

  const toolCard = buildToolBehaviorCard(payload, t);
  if (toolCard) {
    lines.push(``);
    lines.push(`${toolCard.title}:`);
    lines.push(...toolCard.badges.map((badge) => `- ${badge}`));
    lines.push(...toolCard.notes.map((note) => `- ${formatNote(note)}`));
  }

  const toolContractV2Card = buildToolContractV2Card(payload, t);
  if (toolContractV2Card) {
    lines.push(``);
    lines.push(`${toolContractV2Card.title}:`);
    lines.push(...toolContractV2Card.badges.map((badge) => `- ${badge}`));
    lines.push(...toolContractV2Card.notes.map((note) => `- ${formatNote(note)}`));
  }

  const residentAgentsCard = buildResidentAgentsCard(payload, t);
  if (residentAgentsCard) {
    lines.push(``);
    lines.push(`${residentAgentsCard.title}:`);
    lines.push(...residentAgentsCard.badges.map((badge) => `- ${badge}`));
    lines.push(...residentAgentsCard.notes.map((note) => `- ${formatNote(note)}`));
  }

  const mindProfileSnapshotCard = buildMindProfileSnapshotCard(payload, t);
  if (mindProfileSnapshotCard) {
    lines.push(``);
    lines.push(`${mindProfileSnapshotCard.title}:`);
    lines.push(...mindProfileSnapshotCard.badges.map((badge) => `- ${badge}`));
    lines.push(...mindProfileSnapshotCard.notes.map((note) => `- ${formatNote(note)}`));
  }

  const learningReviewInputCard = buildLearningReviewInputCard(payload, t);
  if (learningReviewInputCard) {
    lines.push(``);
    lines.push(`${learningReviewInputCard.title}:`);
    lines.push(...learningReviewInputCard.badges.map((badge) => `- ${badge}`));
    lines.push(...learningReviewInputCard.notes.map((note) => `- ${formatNote(note)}`));
  }

  const skillFreshnessCard = buildSkillFreshnessCard(payload, t);
  if (skillFreshnessCard) {
    lines.push(``);
    lines.push(`${skillFreshnessCard.title}:`);
    lines.push(...skillFreshnessCard.badges.map((badge) => `- ${badge}`));
    lines.push(...skillFreshnessCard.notes.map((note) => `- ${formatNote(note)}`));
  }

  const sharedGovernanceCard = buildSharedGovernanceCard(payload, t);
  if (sharedGovernanceCard) {
    lines.push(``);
    lines.push(`${sharedGovernanceCard.title}:`);
    lines.push(...sharedGovernanceCard.badges.map((badge) => `- ${badge}`));
    lines.push(...sharedGovernanceCard.notes.map((note) => `- ${formatNote(note)}`));
  }

  const delegationCard = buildDelegationCard(payload, t);
  if (delegationCard) {
    lines.push(``);
    lines.push(`${delegationCard.title}:`);
    lines.push(...delegationCard.badges.map((badge) => `- ${badge}`));
    lines.push(...delegationCard.notes.map((note) => `- ${formatNote(note)}`));
  }

  const cronCard = buildCronRuntimeCard(payload, t);
  if (cronCard) {
    lines.push(``);
    lines.push(`${cronCard.title}:`);
    lines.push(...cronCard.badges.map((badge) => `- ${badge}`));
    lines.push(...cronCard.notes.map((note) => `- ${formatNote(note)}`));
  }

  const backgroundContinuationCard = buildBackgroundContinuationRuntimeCard(payload, t);
  if (backgroundContinuationCard) {
    lines.push(``);
    lines.push(`${backgroundContinuationCard.title}:`);
    lines.push(...backgroundContinuationCard.badges.map((badge) => `- ${badge}`));
    lines.push(...backgroundContinuationCard.notes.map((note) => `- ${formatNote(note)}`));
  }

  const externalOutboundCard = buildExternalOutboundRuntimeCard(payload, t);
  if (externalOutboundCard) {
    lines.push(``);
    lines.push(`${externalOutboundCard.title}:`);
    lines.push(...externalOutboundCard.badges.map((badge) => `- ${badge}`));
    lines.push(...externalOutboundCard.notes.map((note) => `- ${formatNote(note)}`));
  }

  const deploymentBackendsCard = buildDeploymentBackendsCard(payload, t);
  if (deploymentBackendsCard) {
    lines.push(``);
    lines.push(`${deploymentBackendsCard.title}:`);
    lines.push(...deploymentBackendsCard.badges.map((badge) => `- ${badge}`));
    lines.push(...deploymentBackendsCard.notes.map((note) => `- ${formatNote(note)}`));
  }

  const runtimeResilienceCard = buildRuntimeResilienceCard(payload, t);
  if (runtimeResilienceCard) {
    lines.push(``);
    lines.push(`${runtimeResilienceCard.title}:`);
    lines.push(...runtimeResilienceCard.badges.map((badge) => `- ${badge}`));
    lines.push(...runtimeResilienceCard.notes.map((note) => `- ${formatNote(note)}`));
  }

  return lines;
}
