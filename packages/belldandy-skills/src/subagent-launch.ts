import type { JsonObject } from "@belldandy/protocol";
import type { ToolContractFamily, ToolContractRiskLevel } from "./tool-contract.js";
import type { SpawnSubAgentOptions, ToolContext } from "./types.js";

type BuildSubAgentLaunchSpecOptions = {
  instruction: string;
  agentId?: string;
  profileId?: string;
  background?: boolean;
  timeoutMs?: number;
  channel: string;
  context?: JsonObject;
  cwd?: string;
  toolSet?: string[];
  permissionMode?: string;
  isolationMode?: string;
  parentTaskId?: string;
  role?: "default" | "coder" | "researcher" | "verifier";
  policySummary?: string;
};

function cloneJsonObject(value: JsonObject | undefined): JsonObject | undefined {
  if (!value) return undefined;
  return { ...value };
}

function cloneStringArray(value: string[] | undefined): string[] | undefined {
  return value ? [...value] : undefined;
}

const ROLE_TOOL_FAMILIES: Partial<Record<
  NonNullable<BuildSubAgentLaunchSpecOptions["role"]>,
  ToolContractFamily[]
>> = {
  coder: ["workspace-read", "workspace-write", "patch", "command-exec", "memory", "goal-governance"],
  researcher: ["network-read", "workspace-read", "browser", "memory", "goal-governance"],
  verifier: ["workspace-read", "command-exec", "browser", "memory", "goal-governance"],
};

const ROLE_PERMISSION_MODE: Partial<Record<
  NonNullable<BuildSubAgentLaunchSpecOptions["role"]>,
  NonNullable<SpawnSubAgentOptions["permissionMode"]>
>> = {
  researcher: "plan",
  coder: "confirm",
  verifier: "confirm",
};

const ROLE_MAX_RISK_LEVEL: Partial<Record<
  NonNullable<BuildSubAgentLaunchSpecOptions["role"]>,
  ToolContractRiskLevel
>> = {
  researcher: "medium",
  coder: "high",
  verifier: "high",
};

export function buildSubAgentLaunchSpec(
  context: ToolContext,
  options: BuildSubAgentLaunchSpecOptions,
): SpawnSubAgentOptions {
  const inherited = context.launchSpec;
  const role = options.role;
  const inheritedAllowedToolFamilies = Array.isArray(inherited?.allowedToolFamilies) && inherited.allowedToolFamilies.length > 0
    ? inherited.allowedToolFamilies
    : undefined;
  const roleAllowedToolFamilies = role ? ROLE_TOOL_FAMILIES[role] : undefined;
  return {
    instruction: options.instruction,
    agentId: options.agentId,
    profileId: options.profileId,
    background: options.background ?? inherited?.background,
    timeoutMs: options.timeoutMs ?? inherited?.timeoutMs,
    channel: options.channel,
    context: cloneJsonObject(options.context),
    cwd: options.cwd ?? context.defaultCwd ?? inherited?.cwd,
    toolSet: cloneStringArray(options.toolSet ?? inherited?.toolSet),
    permissionMode: options.permissionMode ?? inherited?.permissionMode ?? (role ? ROLE_PERMISSION_MODE[role] : undefined),
    isolationMode: options.isolationMode ?? inherited?.isolationMode,
    parentTaskId: options.parentTaskId ?? inherited?.parentTaskId,
    parentConversationId: context.conversationId,
    role,
    allowedToolFamilies: cloneStringArray(roleAllowedToolFamilies ?? inheritedAllowedToolFamilies),
    maxToolRiskLevel: inherited?.maxToolRiskLevel ?? (role ? ROLE_MAX_RISK_LEVEL[role] : undefined),
    policySummary: options.policySummary ?? inherited?.policySummary,
  };
}
