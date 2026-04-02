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
};

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
  };
}
