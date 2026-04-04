function tr(t, key, params, fallback) {
  return typeof t === "function" ? t(key, params ?? {}, fallback) : fallback;
}

function formatNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "0";
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

  return lines;
}
