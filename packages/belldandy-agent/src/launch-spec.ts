import type { BridgeSubtaskSemantics, DelegationProtocol } from "@belldandy/skills";
import type { AgentRegistry } from "./agent-registry.js";
import { resolveAgentProfileCatalogMetadata, type AgentProfileCatalogMetadata } from "./agent-profile.js";

export const DEFAULT_AGENT_LAUNCH_TIMEOUT_MS = 120_000;

export type AgentLaunchRole = "default" | "coder" | "researcher" | "verifier";

export type AgentLaunchSpec = {
  instruction: string;
  parentConversationId: string;
  agentId: string;
  profileId: string;
  background: boolean;
  timeoutMs: number;
  channel: string;
  context?: Record<string, unknown>;
  cwd?: string;
  toolSet?: string[];
  permissionMode?: string;
  isolationMode?: string;
  parentTaskId?: string;
  role?: AgentLaunchRole;
  allowedToolFamilies?: string[];
  maxToolRiskLevel?: "low" | "medium" | "high" | "critical";
  policySummary?: string;
  delegationProtocol?: DelegationProtocol;
  bridgeSubtask?: BridgeSubtaskSemantics;
};

export type AgentLaunchSpecInput = {
  instruction: string;
  parentConversationId: string;
  agentId?: string;
  profileId?: string;
  background?: boolean;
  timeoutMs?: number;
  channel?: string;
  context?: Record<string, unknown>;
  cwd?: string;
  toolSet?: string[];
  permissionMode?: string;
  isolationMode?: string;
  parentTaskId?: string;
  role?: AgentLaunchRole;
  allowedToolFamilies?: string[];
  maxToolRiskLevel?: "low" | "medium" | "high" | "critical";
  policySummary?: string;
  delegationProtocol?: DelegationProtocol;
  bridgeSubtask?: BridgeSubtaskSemantics;
};

function patchDelegationProtocolLaunchDefaults(
  protocol: DelegationProtocol | undefined,
  catalog: AgentProfileCatalogMetadata | undefined,
): DelegationProtocol | undefined {
  if (!protocol || !catalog) return protocol;

  const nextLaunchDefaults = {
    ...protocol.launchDefaults,
    permissionMode: protocol.launchDefaults.permissionMode ?? catalog.defaultPermissionMode,
    allowedToolFamilies: protocol.launchDefaults.allowedToolFamilies ?? catalog.defaultAllowedToolFamilies,
    maxToolRiskLevel: protocol.launchDefaults.maxToolRiskLevel ?? catalog.defaultMaxToolRiskLevel,
  };

  return {
    ...protocol,
    launchDefaults: nextLaunchDefaults,
  };
}

function resolveCatalogMetadata(
  agentRegistry: Pick<AgentRegistry, "getProfile"> | undefined,
  input: AgentLaunchSpecInput,
  defaults: Partial<Omit<AgentLaunchSpec, "instruction" | "parentConversationId">>,
): AgentProfileCatalogMetadata | undefined {
  const profileId = normalizeOptionalString(input.profileId)
    ?? normalizeOptionalString(input.agentId)
    ?? normalizeOptionalString(defaults.profileId)
    ?? normalizeOptionalString(defaults.agentId)
    ?? "default";
  const profile = agentRegistry?.getProfile(profileId);
  return profile ? resolveAgentProfileCatalogMetadata(profile) : undefined;
}

function normalizeOptionalString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

function normalizeToolSet(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const items = value
    .map((item) => (typeof item === "string" ? item.trim() : ""))
    .filter(Boolean);
  if (!items.length) return undefined;
  return [...new Set(items)];
}

function normalizeRole(value: unknown): AgentLaunchRole | undefined {
  if (value !== "default" && value !== "coder" && value !== "researcher" && value !== "verifier") {
    return undefined;
  }
  return value;
}

function normalizeRiskLevel(value: unknown): AgentLaunchSpec["maxToolRiskLevel"] | undefined {
  if (value !== "low" && value !== "medium" && value !== "high" && value !== "critical") {
    return undefined;
  }
  return value;
}

function normalizeContext(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const entries = Object.entries(value as Record<string, unknown>);
  if (!entries.length) return undefined;
  return Object.fromEntries(entries);
}

function normalizeBridgeSubtask(value: unknown): BridgeSubtaskSemantics | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  const kind = normalizeOptionalString(record.kind);
  if (kind !== "analyze" && kind !== "review" && kind !== "patch") {
    return undefined;
  }
  return {
    kind,
    targetId: normalizeOptionalString(record.targetId),
    action: normalizeOptionalString(record.action),
    goalId: normalizeOptionalString(record.goalId),
    goalNodeId: normalizeOptionalString(record.goalNodeId),
    summary: normalizeOptionalString(record.summary),
  };
}

export function normalizeAgentLaunchSpec(
  input: AgentLaunchSpecInput,
  defaults: Partial<Omit<AgentLaunchSpec, "instruction" | "parentConversationId">> = {},
): AgentLaunchSpec {
  const profileId = normalizeOptionalString(input.profileId)
    ?? normalizeOptionalString(input.agentId)
    ?? normalizeOptionalString(defaults.profileId)
    ?? normalizeOptionalString(defaults.agentId)
    ?? "default";
  const agentId = normalizeOptionalString(input.agentId)
    ?? normalizeOptionalString(defaults.agentId)
    ?? profileId;
  const timeoutMs = Number.isFinite(Number(input.timeoutMs)) && Number(input.timeoutMs) > 0
    ? Number(input.timeoutMs)
    : Number.isFinite(Number(defaults.timeoutMs)) && Number(defaults.timeoutMs) > 0
      ? Number(defaults.timeoutMs)
      : DEFAULT_AGENT_LAUNCH_TIMEOUT_MS;

  return {
    instruction: String(input.instruction ?? "").trim(),
    parentConversationId: normalizeOptionalString(input.parentConversationId) ?? "system",
    agentId,
    profileId,
    background: input.background ?? defaults.background ?? true,
    timeoutMs,
    channel: normalizeOptionalString(input.channel) ?? normalizeOptionalString(defaults.channel) ?? "subtask",
    context: normalizeContext(input.context) ?? normalizeContext(defaults.context),
    cwd: normalizeOptionalString(input.cwd) ?? normalizeOptionalString(defaults.cwd),
    toolSet: normalizeToolSet(input.toolSet) ?? normalizeToolSet(defaults.toolSet),
    permissionMode: normalizeOptionalString(input.permissionMode) ?? normalizeOptionalString(defaults.permissionMode),
    isolationMode: normalizeOptionalString(input.isolationMode) ?? normalizeOptionalString(defaults.isolationMode),
    parentTaskId: normalizeOptionalString(input.parentTaskId) ?? normalizeOptionalString(defaults.parentTaskId),
    role: normalizeRole(input.role) ?? normalizeRole(defaults.role),
    allowedToolFamilies: normalizeToolSet(input.allowedToolFamilies) ?? normalizeToolSet(defaults.allowedToolFamilies),
    maxToolRiskLevel: normalizeRiskLevel(input.maxToolRiskLevel) ?? normalizeRiskLevel(defaults.maxToolRiskLevel),
    policySummary: normalizeOptionalString(input.policySummary) ?? normalizeOptionalString(defaults.policySummary),
    delegationProtocol: input.delegationProtocol ?? defaults.delegationProtocol,
    bridgeSubtask: normalizeBridgeSubtask(input.bridgeSubtask) ?? normalizeBridgeSubtask(defaults.bridgeSubtask),
  };
}

export function normalizeAgentLaunchSpecWithCatalog(
  input: AgentLaunchSpecInput,
  options: {
    agentRegistry?: Pick<AgentRegistry, "getProfile">;
    defaults?: Partial<Omit<AgentLaunchSpec, "instruction" | "parentConversationId">>;
  } = {},
): AgentLaunchSpec {
  const defaults = options.defaults ?? {};
  const catalog = resolveCatalogMetadata(options.agentRegistry, input, defaults);
  const patchedInput: AgentLaunchSpecInput = {
    ...input,
    delegationProtocol: patchDelegationProtocolLaunchDefaults(input.delegationProtocol, catalog),
  };
  const patchedDefaults: Partial<Omit<AgentLaunchSpec, "instruction" | "parentConversationId">> = {
    ...defaults,
    delegationProtocol: input.delegationProtocol
      ? defaults.delegationProtocol
      : patchDelegationProtocolLaunchDefaults(defaults.delegationProtocol, catalog),
  };

  return normalizeAgentLaunchSpec(patchedInput, {
    ...patchedDefaults,
    role: normalizeRole(patchedInput.role) ?? normalizeRole(patchedDefaults.role) ?? catalog?.defaultRole,
    permissionMode: normalizeOptionalString(patchedInput.permissionMode)
      ?? normalizeOptionalString(patchedDefaults.permissionMode)
      ?? catalog?.defaultPermissionMode,
    allowedToolFamilies: normalizeToolSet(patchedInput.allowedToolFamilies)
      ?? normalizeToolSet(patchedDefaults.allowedToolFamilies)
      ?? catalog?.defaultAllowedToolFamilies,
    maxToolRiskLevel: normalizeRiskLevel(patchedInput.maxToolRiskLevel)
      ?? normalizeRiskLevel(patchedDefaults.maxToolRiskLevel)
      ?? catalog?.defaultMaxToolRiskLevel,
  });
}
