import { buildLaunchExplainabilityLines } from "./agent-launch-explainability.js";
import { buildResidentStateBindingLines } from "./resident-state-binding-lines.js";

function formatNumber(value) {
  return typeof value === "number" && Number.isFinite(value) ? String(value) : "0";
}

function renderDetailCard(label, value, escapeHtml) {
  return `
    <div class="memory-detail-card">
      <span class="memory-detail-label">${escapeHtml(label)}</span>
      <div class="memory-detail-text">${escapeHtml(value || "-")}</div>
    </div>
  `;
}

function renderExplainabilityBlock(lines, escapeHtml) {
  if (!Array.isArray(lines) || lines.length === 0) return "";
  return `
    <div class="tool-settings-policy-note">
      ${lines.map((line) => `<div>${escapeHtml(line)}</div>`).join("")}
    </div>
  `;
}

function extractMessagePreview(message) {
  if (!message || typeof message !== "object") return "-";
  if (Array.isArray(message.content)) {
    const parts = message.content
      .map((part) => {
        if (!part || typeof part !== "object") return "";
        if (part.type === "text" && typeof part.text === "string") return part.text.trim();
        if (typeof part.type === "string") return `[${part.type}]`;
        return "";
      })
      .filter(Boolean);
    return parts.join(" ").trim() || "-";
  }
  return typeof message.content === "string" && message.content.trim()
    ? message.content.trim()
    : "-";
}

export function renderPromptSnapshotDetail(view, helpers) {
  const {
    escapeHtml,
    formatDateTime,
    t = (_key, _params, fallback) => fallback ?? "",
    sessionId = "",
  } = helpers;
  const snapshot = view?.snapshot;
  if (!snapshot || typeof snapshot !== "object") {
    if (!sessionId) return "";
    return `
      <section class="memory-detail-card">
        <span class="memory-detail-label">${escapeHtml(t("subtasks.detailPromptSnapshot", {}, "Prompt Snapshot"))}</span>
        <div class="memory-detail-text">${escapeHtml(t("subtasks.detailPromptSnapshotMissing", {}, "This subtask session has no persisted prompt snapshot yet."))}</div>
      </section>
    `;
  }

  const summary = snapshot.summary && typeof snapshot.summary === "object" ? snapshot.summary : {};
  const manifest = snapshot.manifest && typeof snapshot.manifest === "object" ? snapshot.manifest : {};
  const artifact = snapshot.snapshot && typeof snapshot.snapshot === "object" ? snapshot.snapshot : {};
  const residentStateBindingLines = buildResidentStateBindingLines(view?.residentStateBinding, t);
  const launchExplainabilityLines = buildLaunchExplainabilityLines(view?.launchExplainability, t);
  const messages = Array.isArray(artifact.messages) ? artifact.messages : [];
  const messagePreviews = messages.slice(0, 3).map((message, index) => ({
    index,
    role: typeof message?.role === "string" ? message.role : "unknown",
    preview: extractMessagePreview(message),
  }));

  return `
    <section class="memory-detail-card">
      <span class="memory-detail-label">${escapeHtml(t("subtasks.detailPromptSnapshot", {}, "Prompt Snapshot"))}</span>
      <div class="memory-detail-grid">
        ${renderDetailCard(t("subtasks.detailPromptSnapshotConversation", {}, "Snapshot Conversation"), manifest.conversationId || sessionId || "-", escapeHtml)}
        ${renderDetailCard(t("subtasks.detailPromptSnapshotRun", {}, "Snapshot Run"), manifest.runId || "-", escapeHtml)}
        ${renderDetailCard(t("subtasks.detailPromptSnapshotAgent", {}, "Snapshot Agent"), manifest.agentId || "-", escapeHtml)}
        ${renderDetailCard(t("subtasks.detailPromptSnapshotCreatedAt", {}, "Snapshot Created At"), formatDateTime(manifest.createdAt), escapeHtml)}
        ${renderDetailCard(t("subtasks.detailPromptSnapshotMessages", {}, "Messages"), formatNumber(summary.messageCount), escapeHtml)}
        ${renderDetailCard(t("subtasks.detailPromptSnapshotDeltas", {}, "Prompt Deltas"), formatNumber(summary.deltaCount), escapeHtml)}
        ${renderDetailCard(t("subtasks.detailPromptSnapshotBlocks", {}, "Provider Blocks"), formatNumber(summary.providerNativeSystemBlockCount), escapeHtml)}
        ${renderDetailCard(t("subtasks.detailPromptSnapshotTokens", {}, "Estimated Tokens"), formatNumber(summary.tokenBreakdown?.systemPromptEstimatedTokens), escapeHtml)}
      </div>
      ${residentStateBindingLines.length ? `
        <div class="memory-detail-text"><strong>${escapeHtml(t("subtasks.detailPromptSnapshotStateBinding", {}, "State Binding"))}</strong></div>
        ${renderExplainabilityBlock(residentStateBindingLines, escapeHtml)}
      ` : ""}
      ${launchExplainabilityLines.length ? `
        <div class="memory-detail-text"><strong>${escapeHtml(t("subtasks.detailPromptSnapshotExplainability", {}, "Launch Explainability"))}</strong></div>
        ${renderExplainabilityBlock(launchExplainabilityLines, escapeHtml)}
      ` : ""}
      <div class="memory-detail-text"><strong>${escapeHtml(t("subtasks.detailPromptSnapshotSystemPrompt", {}, "System Prompt"))}</strong></div>
      <pre class="memory-detail-pre">${escapeHtml(typeof artifact.systemPrompt === "string" ? artifact.systemPrompt : "-")}</pre>
      ${messagePreviews.length ? `
        <div class="memory-detail-text"><strong>${escapeHtml(t("subtasks.detailPromptSnapshotMessagesPreview", {}, "Message Preview"))}</strong></div>
        <div class="subtask-notification-list">
          ${messagePreviews.map((item) => `
            <div class="subtask-notification-item">
              <div class="subtask-notification-head">
                <span class="memory-badge">${escapeHtml(`#${item.index + 1} ${item.role}`)}</span>
              </div>
              <div class="memory-detail-text">${escapeHtml(item.preview)}</div>
            </div>
          `).join("")}
        </div>
      ` : ""}
    </section>
  `;
}
