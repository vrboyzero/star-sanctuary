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
