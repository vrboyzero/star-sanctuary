import { buildLaunchExplainabilityLines } from "./agent-launch-explainability.js";

function normalizeString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((item) => normalizeString(item)).filter(Boolean))];
}

function compactRole(value) {
  const role = normalizeString(value);
  return role === "default" || role === "coder" || role === "researcher" || role === "verifier"
    ? role
    : null;
}

function buildPlanContextKeys(plan) {
  return normalizeStringArray([
    plan?.goalId ? "goalId" : "",
    plan?.nodeId ? "nodeId" : "",
    plan?.runId ? "runId" : "",
    plan?.checkpoint?.required ? "checkpoint" : "",
  ]);
}

function buildSubAgentExplainability(subAgent, plan) {
  if (!subAgent || typeof subAgent !== "object") return null;
  const catalogDefault = subAgent.catalogDefault && typeof subAgent.catalogDefault === "object"
    ? subAgent.catalogDefault
    : null;
  const aggregationMode = subAgent.handoffToVerifier
    ? "verifier_handoff"
    : normalizeString(plan?.orchestration?.coordinationPlan?.rolePolicy?.fanInStrategy) || "main_agent_summary";
  return {
    catalogDefault,
    suggestedLaunch: {
      source: "goal_capability_plan",
      agentId: normalizeString(subAgent.agentId) || null,
      profileId: normalizeString(subAgent.agentId) || null,
      role: compactRole(subAgent.role),
      permissionMode: normalizeString(catalogDefault?.permissionMode) || null,
      allowedToolFamilies: normalizeStringArray(catalogDefault?.allowedToolFamilies),
      maxToolRiskLevel: normalizeString(catalogDefault?.maxToolRiskLevel) || null,
      policySummary: normalizeString(subAgent.reason) || null,
      handoffStyle: normalizeString(catalogDefault?.handoffStyle) || null,
    },
    delegationReason: {
      source: "goal_capability_plan",
      intentKind: "goal_execution",
      intentSummary: normalizeString(subAgent.objective) || null,
      expectedDeliverableSummary: normalizeString(subAgent.deliverable) || null,
      aggregationMode,
      contextKeys: buildPlanContextKeys(plan),
      sourceAgentIds: [],
    },
  };
}

function buildCheckpointExplainability(plan) {
  const checkpoint = plan?.checkpoint;
  if (!checkpoint || typeof checkpoint !== "object") return null;
  const reviewerRole = compactRole(checkpoint.suggestedReviewerRole);
  return {
    catalogDefault: null,
    suggestedLaunch: {
      source: "goal_checkpoint",
      agentId: normalizeString(checkpoint.suggestedReviewer) || null,
      profileId: normalizeString(checkpoint.suggestedReviewer) || null,
      role: reviewerRole,
      permissionMode: null,
      allowedToolFamilies: [],
      maxToolRiskLevel: normalizeString(plan?.riskLevel) || null,
      policySummary: normalizeString(checkpoint.suggestedNote) || null,
      handoffStyle: null,
    },
    delegationReason: {
      source: "goal_checkpoint",
      intentKind: "checkpoint",
      intentSummary: normalizeString(checkpoint.suggestedTitle)
        || normalizeString(checkpoint.reasons?.[0])
        || (checkpoint.required ? "checkpoint required" : "checkpoint optional"),
      expectedDeliverableSummary: normalizeString(checkpoint.suggestedNote) || null,
      aggregationMode: normalizeString(checkpoint.approvalMode) || null,
      contextKeys: normalizeStringArray([
        ...buildPlanContextKeys(plan),
        Array.isArray(checkpoint.requiredRequestFields) && checkpoint.requiredRequestFields.length > 0 ? "requestFields" : "",
        Array.isArray(checkpoint.requiredDecisionFields) && checkpoint.requiredDecisionFields.length > 0 ? "decisionFields" : "",
      ]),
      sourceAgentIds: [],
    },
  };
}

function buildVerifierExplainability(plan) {
  const verifierHandoff = plan?.orchestration?.verifierHandoff;
  if (!verifierHandoff || typeof verifierHandoff !== "object") return null;
  const verifierSubAgent = Array.isArray(plan?.subAgents)
    ? plan.subAgents.find((item) => compactRole(item?.role) === "verifier" || normalizeString(item?.agentId) === normalizeString(verifierHandoff.verifierAgentId))
    : null;
  const catalogDefault = verifierSubAgent?.catalogDefault && typeof verifierSubAgent.catalogDefault === "object"
    ? verifierSubAgent.catalogDefault
    : null;
  return {
    catalogDefault,
    suggestedLaunch: {
      source: "goal_verifier_handoff",
      agentId: normalizeString(verifierHandoff.verifierAgentId) || normalizeString(verifierSubAgent?.agentId) || null,
      profileId: normalizeString(verifierHandoff.verifierAgentId) || normalizeString(verifierSubAgent?.agentId) || null,
      role: "verifier",
      permissionMode: normalizeString(catalogDefault?.permissionMode) || null,
      allowedToolFamilies: normalizeStringArray(catalogDefault?.allowedToolFamilies),
      maxToolRiskLevel: normalizeString(catalogDefault?.maxToolRiskLevel) || normalizeString(plan?.riskLevel) || null,
      policySummary: normalizeString(verifierHandoff.summary) || normalizeString(verifierSubAgent?.reason) || null,
      handoffStyle: normalizeString(catalogDefault?.handoffStyle) || null,
    },
    delegationReason: {
      source: "goal_verifier_handoff",
      intentKind: "verifier_handoff",
      intentSummary: normalizeString(verifierSubAgent?.objective) || normalizeString(verifierHandoff.summary) || null,
      expectedDeliverableSummary: normalizeString(verifierSubAgent?.deliverable)
        || normalizeString(plan?.orchestration?.verifierResult?.summary)
        || null,
      aggregationMode: "verifier_handoff",
      contextKeys: buildPlanContextKeys(plan),
      sourceAgentIds: normalizeStringArray(verifierHandoff.sourceAgentIds),
    },
  };
}

export function buildGoalSubAgentExplainabilityEntries(plan, t) {
  const subAgents = Array.isArray(plan?.subAgents) ? plan.subAgents : [];
  return subAgents.map((subAgent) => {
    const label = normalizeString(subAgent.agentId) || "subAgent";
    const lines = buildLaunchExplainabilityLines(buildSubAgentExplainability(subAgent, plan), t);
    return { label, lines };
  }).filter((item) => item.lines.length > 0);
}

export function buildGoalDelegationResultExplainabilityEntry(plan, result, t) {
  const subAgent = Array.isArray(plan?.subAgents)
    ? plan.subAgents.find((item) => normalizeString(item?.agentId) === normalizeString(result?.agentId))
    : null;
  if (!subAgent) return null;
  const lines = buildLaunchExplainabilityLines(buildSubAgentExplainability(subAgent, plan), t);
  if (lines.length <= 0) return null;
  return {
    label: normalizeString(result?.agentId) || normalizeString(subAgent.agentId) || "subAgent",
    lines,
  };
}

export function buildGoalVerifierExplainabilityEntry(plan, t) {
  const lines = buildLaunchExplainabilityLines(buildVerifierExplainability(plan), t);
  if (lines.length <= 0) return null;
  return {
    label: normalizeString(plan?.orchestration?.verifierHandoff?.verifierAgentId) || "verifier",
    lines,
  };
}

export function buildGoalCheckpointExplainabilityEntry(plan, t) {
  const lines = buildLaunchExplainabilityLines(buildCheckpointExplainability(plan), t);
  if (lines.length <= 0) return null;
  return {
    label: "checkpoint",
    lines,
  };
}
