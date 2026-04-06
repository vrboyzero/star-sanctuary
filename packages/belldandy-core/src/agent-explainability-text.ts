import type { AgentLaunchExplainability } from "./agent-launch-explainability.js";
import type { ResidentStateBindingView } from "./resident-state-binding.js";

function normalizeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => normalizeString(item)).filter(Boolean))];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function compactJoin(parts: string[]): string {
  return parts.filter(Boolean).join(", ");
}

function formatCatalogDefault(value: unknown): string {
  if (!isRecord(value)) return "";
  const allowedFamilies = normalizeStringArray(value.allowedToolFamilies);
  const skills = normalizeStringArray(value.skills);
  const whenToUse = normalizeStringArray(value.whenToUse);
  const parts = [
    normalizeString(value.role) ? `role=${normalizeString(value.role)}` : "",
    normalizeString(value.permissionMode) ? `permission=${normalizeString(value.permissionMode)}` : "",
    allowedFamilies.length ? `families=${allowedFamilies.join("+")}` : "",
    normalizeString(value.maxToolRiskLevel) ? `risk=${normalizeString(value.maxToolRiskLevel)}` : "",
    normalizeString(value.handoffStyle) ? `handoff=${normalizeString(value.handoffStyle)}` : "",
    skills.length ? `skills=${skills.slice(0, 2).join("+")}${skills.length > 2 ? `+${skills.length - 2}` : ""}` : "",
    whenToUse.length ? `when=${whenToUse[0]}${whenToUse.length > 1 ? `+${whenToUse.length - 1}` : ""}` : "",
  ];
  return parts.some(Boolean) ? `catalog default: ${compactJoin(parts)}` : "";
}

function formatEffectiveLaunch(value: unknown): string {
  if (!isRecord(value)) return "";
  const allowedFamilies = normalizeStringArray(value.allowedToolFamilies);
  const parts = [
    normalizeString(value.source) ? `source=${normalizeString(value.source)}` : "",
    normalizeString(value.agentId) ? `agent=${normalizeString(value.agentId)}` : "",
    normalizeString(value.profileId) ? `profile=${normalizeString(value.profileId)}` : "",
    normalizeString(value.role) ? `role=${normalizeString(value.role)}` : "",
    normalizeString(value.permissionMode) ? `permission=${normalizeString(value.permissionMode)}` : "",
    allowedFamilies.length ? `families=${allowedFamilies.join("+")}` : "",
    normalizeString(value.maxToolRiskLevel) ? `risk=${normalizeString(value.maxToolRiskLevel)}` : "",
    normalizeString(value.handoffStyle) ? `handoff=${normalizeString(value.handoffStyle)}` : "",
    normalizeString(value.policySummary) ? `policy=${normalizeString(value.policySummary)}` : "",
  ];
  return parts.some(Boolean) ? `effective launch: ${compactJoin(parts)}` : "";
}

function formatSuggestedLaunch(value: unknown): string {
  if (!isRecord(value)) return "";
  const allowedFamilies = normalizeStringArray(value.allowedToolFamilies);
  const parts = [
    normalizeString(value.source) ? `source=${normalizeString(value.source)}` : "",
    normalizeString(value.agentId) ? `agent=${normalizeString(value.agentId)}` : "",
    normalizeString(value.profileId) ? `profile=${normalizeString(value.profileId)}` : "",
    normalizeString(value.role) ? `role=${normalizeString(value.role)}` : "",
    normalizeString(value.permissionMode) ? `permission=${normalizeString(value.permissionMode)}` : "",
    allowedFamilies.length ? `families=${allowedFamilies.join("+")}` : "",
    normalizeString(value.maxToolRiskLevel) ? `risk=${normalizeString(value.maxToolRiskLevel)}` : "",
    normalizeString(value.handoffStyle) ? `handoff=${normalizeString(value.handoffStyle)}` : "",
    normalizeString(value.policySummary) ? `policy=${normalizeString(value.policySummary)}` : "",
  ];
  return parts.some(Boolean) ? `suggested launch: ${compactJoin(parts)}` : "";
}

function formatDelegationReason(value: unknown): string {
  if (!isRecord(value)) return "";
  const contextKeys = normalizeStringArray(value.contextKeys);
  const sourceAgentIds = normalizeStringArray(value.sourceAgentIds);
  const parts = [
    normalizeString(value.source) ? `source=${normalizeString(value.source)}` : "",
    normalizeString(value.intentKind) ? `intent=${normalizeString(value.intentKind)}` : "",
    normalizeString(value.intentSummary) ? `summary=${normalizeString(value.intentSummary)}` : "",
    normalizeString(value.expectedDeliverableSummary)
      ? `deliverable=${normalizeString(value.expectedDeliverableSummary)}`
      : "",
    normalizeString(value.aggregationMode) ? `aggregation=${normalizeString(value.aggregationMode)}` : "",
    contextKeys.length ? `context=${contextKeys.join("+")}` : "",
    sourceAgentIds.length ? `from=${sourceAgentIds.join("+")}` : "",
  ];
  return parts.some(Boolean) ? `delegation reason: ${compactJoin(parts)}` : "";
}

export function renderAgentLaunchExplainabilityLines(
  value: AgentLaunchExplainability | Record<string, unknown> | null | undefined,
): string[] {
  if (!isRecord(value)) return [];
  return [
    formatCatalogDefault(value.catalogDefault),
    formatSuggestedLaunch(value.suggestedLaunch),
    formatEffectiveLaunch(value.effectiveLaunch),
    formatDelegationReason(value.delegationReason),
  ].filter(Boolean);
}

export function renderResidentStateBindingLines(
  value: ResidentStateBindingView | Record<string, unknown> | null | undefined,
): string[] {
  if (!isRecord(value)) return [];

  const workspaceScopeSummary = normalizeString(value.workspaceScopeSummary) || normalizeString(value.summary);
  const stateScopeSummary = normalizeString(value.stateScopeSummary) || normalizeString(value.summary);
  const lines: string[] = [];

  if (workspaceScopeSummary) {
    lines.push(`workspace scope: ${workspaceScopeSummary}`);
  }
  if (stateScopeSummary && stateScopeSummary !== workspaceScopeSummary) {
    lines.push(`state scope: ${stateScopeSummary}`);
  }

  return lines;
}
