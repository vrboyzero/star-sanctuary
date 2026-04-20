function fallbackTranslate(t, key, fallback) {
  if (typeof t !== "function") return fallback;
  return t(key, {}, fallback);
}

export function formatSkillFreshnessStatusLabel(status, t) {
  switch (status) {
    case "needs_patch":
      return fallbackTranslate(t, "memory.skillFreshnessNeedsPatch", "需要补丁");
    case "needs_new_skill":
      return fallbackTranslate(t, "memory.skillFreshnessNeedsNewSkill", "需要新增");
    case "warn_stale":
      return fallbackTranslate(t, "memory.skillFreshnessWarnStale", "快过期");
    default:
      return fallbackTranslate(t, "memory.skillFreshnessHealthy", "稳定");
  }
}

export function getSkillFreshnessBadgeClass(status) {
  switch (status) {
    case "needs_patch":
    case "needs_new_skill":
      return "memory-badge-hybrid";
    case "warn_stale":
      return "memory-badge-private";
    default:
      return "memory-badge-shared";
  }
}

export function renderSkillFreshnessBadges(skillFreshness, options = {}) {
  if (!skillFreshness || typeof options.escapeHtml !== "function") return "";
  const { escapeHtml, t = undefined } = options;
  const badges = [
    `<span class="memory-badge ${getSkillFreshnessBadgeClass(skillFreshness.status)}">${escapeHtml(formatSkillFreshnessStatusLabel(skillFreshness.status, t))}</span>`,
  ];
  if (skillFreshness?.manualStaleMark) {
    badges.push(`<span class="memory-badge">${escapeHtml(fallbackTranslate(t, "memory.skillFreshnessManual", "人工标记"))}</span>`);
  }
  if (skillFreshness?.suggestion?.kind === "review_patch_candidate") {
    badges.push(`<span class="memory-badge">${escapeHtml(fallbackTranslate(t, "memory.skillFreshnessPatchHint", "待补丁"))}</span>`);
  }
  if (skillFreshness?.suggestion?.kind === "review_new_skill_candidate") {
    badges.push(`<span class="memory-badge">${escapeHtml(fallbackTranslate(t, "memory.skillFreshnessNewHint", "待新增"))}</span>`);
  }
  return badges.join("");
}

export function renderSkillFreshnessDetail(skillFreshness, options = {}) {
  if (!skillFreshness || typeof options.escapeHtml !== "function") return "";
  const { escapeHtml, t = undefined, maxSignals = 2, actions = null } = options;
  const signals = Array.isArray(skillFreshness?.signals) ? skillFreshness.signals.slice(0, maxSignals) : [];
  const sourceCandidateId = typeof actions?.sourceCandidateId === "string" ? actions.sourceCandidateId.trim() : "";
  const skillKey = typeof actions?.skillKey === "string" ? actions.skillKey.trim() : "";
  const taskId = typeof actions?.taskId === "string" ? actions.taskId.trim() : "";
  const candidateId = typeof actions?.candidateId === "string" ? actions.candidateId.trim() : "";
  const manualStale = Boolean(skillFreshness?.manualStaleMark);
  const staleBusy = Boolean(actions?.staleBusy);
  const patchCandidateId = skillFreshness?.suggestion?.kind === "review_patch_candidate"
    && typeof skillFreshness?.suggestion?.candidateId === "string"
    ? skillFreshness.suggestion.candidateId.trim()
    : "";
  return `
    <div class="memory-detail-card">
      <span class="memory-detail-label">${escapeHtml(fallbackTranslate(t, "memory.skillFreshnessTitle", "Skill Freshness"))}</span>
      <div class="memory-detail-badges">
        ${renderSkillFreshnessBadges(skillFreshness, { escapeHtml, t })}
      </div>
      <div class="memory-detail-text">${escapeHtml(skillFreshness.summary || "-")}</div>
      ${signals.map((item) => `<div class="memory-detail-text">${escapeHtml(item.summary || "-")}</div>`).join("")}
      ${skillFreshness?.suggestion?.summary ? `<div class="memory-detail-text">${escapeHtml(skillFreshness.suggestion.summary)}</div>` : ""}
      ${(sourceCandidateId || skillKey || patchCandidateId) ? `
        <div class="goal-detail-actions">
          ${(sourceCandidateId || skillKey) ? `
            <button
              class="memory-usage-action-btn"
              data-skill-freshness-stale-action="${manualStale ? "clear" : "mark"}"
              data-skill-freshness-source-candidate-id="${escapeHtml(sourceCandidateId)}"
              data-skill-freshness-skill-key="${escapeHtml(skillKey)}"
              data-skill-freshness-task-id="${escapeHtml(taskId)}"
              data-skill-freshness-candidate-id="${escapeHtml(candidateId)}"
              ${staleBusy ? "disabled" : ""}
            >${escapeHtml(staleBusy
              ? fallbackTranslate(t, "memory.skillFreshnessUpdating", "更新中…")
              : manualStale
                ? fallbackTranslate(t, "memory.skillFreshnessClearStale", "取消 stale")
                : fallbackTranslate(t, "memory.skillFreshnessMarkStale", "标记 stale"))}</button>
          ` : ""}
          ${patchCandidateId ? `
            <button
              class="memory-usage-action-btn"
              data-open-candidate-id="${escapeHtml(patchCandidateId)}"
            >${escapeHtml(fallbackTranslate(t, "memory.skillFreshnessOpenPatchCandidate", "打开 patch candidate"))}</button>
          ` : ""}
        </div>
      ` : ""}
    </div>
  `;
}
