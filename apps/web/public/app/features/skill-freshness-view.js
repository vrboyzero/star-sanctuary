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
  const { escapeHtml, t = undefined, maxSignals = 2 } = options;
  const signals = Array.isArray(skillFreshness?.signals) ? skillFreshness.signals.slice(0, maxSignals) : [];
  return `
    <div class="memory-detail-card">
      <span class="memory-detail-label">${escapeHtml(fallbackTranslate(t, "memory.skillFreshnessTitle", "Skill Freshness"))}</span>
      <div class="memory-detail-badges">
        ${renderSkillFreshnessBadges(skillFreshness, { escapeHtml, t })}
      </div>
      <div class="memory-detail-text">${escapeHtml(skillFreshness.summary || "-")}</div>
      ${signals.map((item) => `<div class="memory-detail-text">${escapeHtml(item.summary || "-")}</div>`).join("")}
      ${skillFreshness?.suggestion?.summary ? `<div class="memory-detail-text">${escapeHtml(skillFreshness.suggestion.summary)}</div>` : ""}
    </div>
  `;
}
