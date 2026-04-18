import type { JsonObject } from "@belldandy/protocol";

import type { ToolContractFamily, ToolContractRiskLevel } from "./tool-contract.js";
import type { SpawnSubAgentOptions } from "./types.js";

export type DelegationSource =
  | "session_spawn"
  | "delegate_task"
  | "delegate_parallel"
  | "goal_subtask"
  | "goal_verifier";

export type DelegationIntentKind =
  | "ad_hoc"
  | "parallel_subtasks"
  | "goal_execution"
  | "verifier_handoff";

export type DelegationDeliverableFormat =
  | "summary"
  | "patch"
  | "research_notes"
  | "verification_report";

export type DelegationAggregationMode =
  | "single"
  | "parallel_collect"
  | "main_agent_summary"
  | "verifier_fan_in";

export type DelegationTeamMode =
  | "parallel_subtasks"
  | "parallel_patch"
  | "research_grid"
  | "verify_swarm"
  | "plan_execute_verify";

export type DelegationOwnership = {
  scopeSummary: string;
  outOfScope?: string[];
  writeScope?: string[];
};

export type DelegationAcceptance = {
  doneDefinition: string;
  verificationHints?: string[];
};

export type DelegationDeliverableContract = {
  format: DelegationDeliverableFormat;
  summary?: string;
  requiredSections?: string[];
};

export type DelegationTeamMember = {
  laneId: string;
  agentId?: string;
  role?: NonNullable<SpawnSubAgentOptions["role"]>;
  identityLabel?: string;
  authorityRelationToManager?: "self" | "superior" | "peer" | "subordinate" | "unknown";
  reportsTo?: string[];
  mayDirect?: string[];
  scopeSummary?: string;
  dependsOn?: string[];
  handoffTo?: string[];
};

export type DelegationTeamMetadata = {
  id: string;
  mode: DelegationTeamMode;
  sharedGoal?: string;
  managerAgentId?: string;
  managerIdentityLabel?: string;
  currentLaneId?: string;
  memberRoster: DelegationTeamMember[];
};

export type DelegationProtocol = {
  source: DelegationSource;
  intent: {
    kind: DelegationIntentKind;
    summary: string;
    role?: NonNullable<SpawnSubAgentOptions["role"]>;
    goalId?: string;
    nodeId?: string;
    planId?: string;
  };
  contextPolicy: {
    includeParentConversation: boolean;
    includeStructuredContext: boolean;
    contextKeys: string[];
  };
  expectedDeliverable: {
    format: DelegationDeliverableFormat;
    summary: string;
  };
  aggregationPolicy: {
    mode: DelegationAggregationMode;
    summarizeFailures: boolean;
    sourceAgentIds?: string[];
  };
  launchDefaults: {
    permissionMode?: SpawnSubAgentOptions["permissionMode"];
    allowedToolFamilies?: ToolContractFamily[];
    maxToolRiskLevel?: ToolContractRiskLevel;
  };
  ownership?: DelegationOwnership;
  acceptance?: DelegationAcceptance;
  deliverableContract?: DelegationDeliverableContract;
  team?: DelegationTeamMetadata;
};

export type BuildDelegationTeamMemberOptions = Partial<DelegationTeamMember>;

export type BuildDelegationTeamMetadataOptions = Partial<Omit<DelegationTeamMetadata, "memberRoster">> & {
  memberRoster?: BuildDelegationTeamMemberOptions[];
};

export type BuildDelegationProtocolOptions = {
  source: DelegationSource;
  instruction: string;
  role?: NonNullable<SpawnSubAgentOptions["role"]>;
  context?: JsonObject;
  goalId?: string;
  nodeId?: string;
  planId?: string;
  expectedDeliverableSummary?: string;
  aggregationMode?: DelegationAggregationMode;
  sourceAgentIds?: string[];
  permissionMode?: SpawnSubAgentOptions["permissionMode"];
  allowedToolFamilies?: ToolContractFamily[];
  maxToolRiskLevel?: ToolContractRiskLevel;
  ownership?: Partial<DelegationOwnership>;
  acceptance?: Partial<DelegationAcceptance>;
  deliverableContract?: Partial<DelegationDeliverableContract>;
  team?: BuildDelegationTeamMetadataOptions;
};

function normalizeStringArray(value: readonly string[] | undefined): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  return items.length > 0 ? [...new Set(items)] : undefined;
}

function summarizeInstruction(instruction: string): string {
  const normalized = instruction.trim().replace(/\s+/g, " ");
  if (!normalized) return "Execute delegated work.";
  return normalized.length > 140 ? `${normalized.slice(0, 137)}...` : normalized;
}

function inferIntentKind(source: DelegationSource): DelegationIntentKind {
  switch (source) {
    case "delegate_parallel":
      return "parallel_subtasks";
    case "goal_subtask":
      return "goal_execution";
    case "goal_verifier":
      return "verifier_handoff";
    default:
      return "ad_hoc";
  }
}

function inferDeliverableFormat(
  source: DelegationSource,
  role: BuildDelegationProtocolOptions["role"],
): DelegationDeliverableFormat {
  if (source === "goal_verifier" || role === "verifier") return "verification_report";
  if (role === "coder") return "patch";
  if (role === "researcher") return "research_notes";
  return "summary";
}

function inferAggregationMode(source: DelegationSource): DelegationAggregationMode {
  switch (source) {
    case "delegate_parallel":
      return "parallel_collect";
    case "goal_subtask":
      return "main_agent_summary";
    case "goal_verifier":
      return "verifier_fan_in";
    default:
      return "single";
  }
}

export function buildDelegationProtocol(options: BuildDelegationProtocolOptions): DelegationProtocol {
  const sourceAgentIds = normalizeStringArray(options.sourceAgentIds);
  const deliverableFormat = options.deliverableContract?.format ?? inferDeliverableFormat(options.source, options.role);
  const deliverableSummary = options.expectedDeliverableSummary?.trim()
    || options.deliverableContract?.summary?.trim()
    || summarizeInstruction(options.instruction);
  const ownership = buildDelegationOwnership(options, deliverableSummary);
  const acceptance = buildDelegationAcceptance(options, deliverableSummary);
  const deliverableContract = buildDelegationDeliverableContract(options, deliverableFormat, deliverableSummary);
  const team = buildDelegationTeamMetadata(options, deliverableSummary);
  return {
    source: options.source,
    intent: {
      kind: inferIntentKind(options.source),
      summary: summarizeInstruction(options.instruction),
      role: options.role,
      goalId: options.goalId,
      nodeId: options.nodeId,
      planId: options.planId,
    },
    contextPolicy: {
      includeParentConversation: true,
      includeStructuredContext: Boolean(options.context && Object.keys(options.context).length > 0),
      contextKeys: options.context ? Object.keys(options.context).sort() : [],
    },
    expectedDeliverable: {
      format: deliverableFormat,
      summary: deliverableSummary,
    },
    aggregationPolicy: {
      mode: options.aggregationMode ?? inferAggregationMode(options.source),
      summarizeFailures: options.source !== "session_spawn",
      sourceAgentIds,
    },
    launchDefaults: {
      permissionMode: options.permissionMode,
      allowedToolFamilies: normalizeStringArray(options.allowedToolFamilies) as ToolContractFamily[] | undefined,
      maxToolRiskLevel: options.maxToolRiskLevel,
    },
    ...(ownership ? { ownership } : {}),
    ...(acceptance ? { acceptance } : {}),
    ...(deliverableContract ? { deliverableContract } : {}),
    ...(team ? { team } : {}),
  };
}

function buildDelegationOwnership(
  options: BuildDelegationProtocolOptions,
  fallbackSummary: string,
): DelegationOwnership | undefined {
  const scopeSummary = options.ownership?.scopeSummary?.trim() || "";
  const outOfScope = normalizeStringArray(options.ownership?.outOfScope);
  const writeScope = normalizeStringArray(options.ownership?.writeScope);
  if (!scopeSummary && !outOfScope && !writeScope) {
    return undefined;
  }
  return {
    scopeSummary: scopeSummary || fallbackSummary,
    ...(outOfScope ? { outOfScope } : {}),
    ...(writeScope ? { writeScope } : {}),
  };
}

function buildDelegationAcceptance(
  options: BuildDelegationProtocolOptions,
  fallbackSummary: string,
): DelegationAcceptance | undefined {
  const doneDefinition = options.acceptance?.doneDefinition?.trim() || "";
  const verificationHints = normalizeStringArray(options.acceptance?.verificationHints);
  if (!doneDefinition && !verificationHints) {
    return undefined;
  }
  return {
    doneDefinition: doneDefinition || fallbackSummary,
    ...(verificationHints ? { verificationHints } : {}),
  };
}

function buildDelegationDeliverableContract(
  options: BuildDelegationProtocolOptions,
  format: DelegationDeliverableFormat,
  summary: string,
): DelegationDeliverableContract | undefined {
  const requiredSections = normalizeStringArray(options.deliverableContract?.requiredSections);
  const contractSummary = options.deliverableContract?.summary?.trim() || "";
  if (!requiredSections && !contractSummary && !options.deliverableContract?.format) {
    return undefined;
  }
  return {
    format,
    ...(contractSummary || summary ? { summary: contractSummary || summary } : {}),
    ...(requiredSections ? { requiredSections } : {}),
  };
}

function buildDelegationTeamMetadata(
  options: BuildDelegationProtocolOptions,
  fallbackSummary: string,
): DelegationTeamMetadata | undefined {
  const teamId = options.team?.id?.trim() || "";
  const mode = normalizeDelegationTeamMode(options.team?.mode);
  const sharedGoal = options.team?.sharedGoal?.trim() || "";
  const managerAgentId = options.team?.managerAgentId?.trim() || "";
  const managerIdentityLabel = typeof options.team?.managerIdentityLabel === "string"
    ? options.team.managerIdentityLabel.trim()
    : "";
  const currentLaneId = options.team?.currentLaneId?.trim() || "";
  const memberRoster = buildDelegationTeamRoster(options.team?.memberRoster);

  if (!teamId && !mode && !sharedGoal && !managerAgentId && !managerIdentityLabel && !currentLaneId && !memberRoster) {
    return undefined;
  }

  if (!teamId || !mode || !memberRoster || memberRoster.length === 0) {
    return undefined;
  }

  const normalizedCurrentLaneId = memberRoster.some((member) => member.laneId === currentLaneId)
    ? currentLaneId
    : undefined;

  return {
    id: teamId,
    mode,
    ...(sharedGoal || fallbackSummary ? { sharedGoal: sharedGoal || fallbackSummary } : {}),
    ...(managerAgentId ? { managerAgentId } : {}),
    ...(managerIdentityLabel ? { managerIdentityLabel } : {}),
    ...(normalizedCurrentLaneId ? { currentLaneId: normalizedCurrentLaneId } : {}),
    memberRoster,
  };
}

function buildDelegationTeamRoster(
  roster: BuildDelegationTeamMemberOptions[] | undefined,
): DelegationTeamMember[] | undefined {
  if (!Array.isArray(roster)) {
    return undefined;
  }

  const normalized = roster
    .map((member) => {
      const laneId = typeof member?.laneId === "string" ? member.laneId.trim() : "";
      if (!laneId) {
        return undefined;
      }
      const agentId = typeof member.agentId === "string" ? member.agentId.trim() : "";
      const role = normalizeDelegationRole(member.role);
      const identityLabel = typeof member.identityLabel === "string" ? member.identityLabel.trim() : "";
      const authorityRelationToManager = normalizeDelegationAuthorityRelation(member.authorityRelationToManager);
      const reportsTo = normalizeStringArray(member.reportsTo);
      const mayDirect = normalizeStringArray(member.mayDirect);
      const scopeSummary = typeof member.scopeSummary === "string" ? member.scopeSummary.trim() : "";
      const dependsOn = normalizeStringArray(member.dependsOn);
      const handoffTo = normalizeStringArray(member.handoffTo);
      return {
        laneId,
        ...(agentId ? { agentId } : {}),
        ...(role ? { role } : {}),
        ...(identityLabel ? { identityLabel } : {}),
        ...(authorityRelationToManager ? { authorityRelationToManager } : {}),
        ...(reportsTo ? { reportsTo } : {}),
        ...(mayDirect ? { mayDirect } : {}),
        ...(scopeSummary ? { scopeSummary } : {}),
        ...(dependsOn ? { dependsOn } : {}),
        ...(handoffTo ? { handoffTo } : {}),
      } satisfies DelegationTeamMember;
    })
    .filter(Boolean) as DelegationTeamMember[];

  if (normalized.length === 0) {
    return undefined;
  }

  const deduped = new Map<string, DelegationTeamMember>();
  for (const member of normalized) {
    if (!deduped.has(member.laneId)) {
      deduped.set(member.laneId, member);
    }
  }
  return [...deduped.values()];
}

function normalizeDelegationTeamMode(
  value: unknown,
): DelegationTeamMode | undefined {
  switch (value) {
    case "parallel_subtasks":
    case "parallel_patch":
    case "research_grid":
    case "verify_swarm":
    case "plan_execute_verify":
      return value;
    default:
      return undefined;
  }
}

function normalizeDelegationRole(
  value: unknown,
): DelegationTeamMember["role"] | undefined {
  switch (value) {
    case "default":
    case "coder":
    case "researcher":
    case "verifier":
      return value;
    default:
      return undefined;
  }
}

function normalizeDelegationAuthorityRelation(
  value: unknown,
): DelegationTeamMember["authorityRelationToManager"] | undefined {
  const normalized = typeof value === "string" ? value.trim() : value;
  switch (normalized) {
    case "self":
    case "superior":
    case "peer":
    case "subordinate":
    case "unknown":
      return normalized;
    default:
      return undefined;
  }
}
