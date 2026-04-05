import type { Tool } from "./types.js";
import {
  getToolContract,
  type ToolContract,
  type ToolContractFamily,
  type ToolContractRiskLevel,
} from "./tool-contract.js";
import {
  getToolBehaviorContract,
  listToolBehaviorContracts,
  type ToolBehaviorContract,
} from "./tool-behavior-contract.js";
import { getToolContractV2Profile } from "./tool-contract-v2-profiles.js";

export interface ToolContractV2 {
  name: string;
  family?: ToolContractFamily;
  riskLevel?: ToolContractRiskLevel;
  needsPermission: boolean;
  isReadOnly: boolean;
  isConcurrencySafe: boolean;
  activityDescription?: string;
  outputPersistencePolicy?: ToolContract["outputPersistencePolicy"];
  channels?: readonly ToolContract["channels"][number][];
  safeScopes?: readonly ToolContract["safeScopes"][number][];
  recommendedWhen: readonly string[];
  avoidWhen: readonly string[];
  confirmWhen: readonly string[];
  preflightChecks: readonly string[];
  fallbackStrategy: readonly string[];
  expectedOutput: readonly string[];
  sideEffectSummary: readonly string[];
  userVisibleRiskNote?: string;
  hasGovernanceContract: boolean;
  hasBehaviorContract: boolean;
}

export type ToolContractV2Summary = {
  totalCount: number;
  missingV2Count: number;
  highRiskCount: number;
  confirmRequiredCount: number;
  governedTools: string[];
  missingV2Tools: string[];
};

export function getToolContractV2(input: Tool | string | ToolContract | Pick<ToolContract, "name">): ToolContractV2 | undefined {
  const name = getToolContractV2Name(input);
  const governance = resolveToolContractGovernance(input);
  const behavior = getToolBehaviorContract(name);
  const profile = getToolContractV2Profile(name);
  if (!governance && !behavior && !profile) {
    return undefined;
  }
  return mergeContracts(name, governance, behavior, profile);
}

export function listToolContractsV2(
  input?: readonly (Tool | string | ToolContract | Pick<ToolContract, "name">)[],
): ToolContractV2[] {
  if (!input || input.length === 0) {
    const names = new Set<string>(listToolBehaviorContracts().map((contract) => contract.name));
    return [...names]
      .map((name) => getToolContractV2(name))
      .filter((contract): contract is ToolContractV2 => Boolean(contract));
  }

  return [...new Map(
    input
      .map((item) => getToolContractV2(item))
      .filter((contract): contract is ToolContractV2 => Boolean(contract))
      .map((contract) => [contract.name, contract] as const),
  ).values()];
}

export function buildToolContractV2Summary(
  contracts: readonly ToolContractV2[],
  input?: {
    registeredToolNames?: readonly string[];
  },
): ToolContractV2Summary {
  const governedTools = contracts.map((contract) => contract.name).sort();
  const registeredToolNames = Array.isArray(input?.registeredToolNames)
    ? [...new Set(input.registeredToolNames.filter(Boolean))].sort()
    : governedTools;
  const governedSet = new Set(governedTools);
  const missingV2Tools = registeredToolNames.filter((name) => !governedSet.has(name));
  return {
    totalCount: contracts.length,
    missingV2Count: missingV2Tools.length,
    highRiskCount: contracts.filter((contract) => contract.riskLevel === "high" || contract.riskLevel === "critical").length,
    confirmRequiredCount: contracts.filter((contract) => contract.needsPermission || contract.confirmWhen.length > 0).length,
    governedTools,
    missingV2Tools,
  };
}

function getToolContractV2Name(input: Tool | string | ToolContract | Pick<ToolContract, "name">): string {
  if (typeof input === "string") {
    return input;
  }
  if ("definition" in input) {
    return input.definition.name;
  }
  return input.name;
}

function resolveToolContractGovernance(
  input: Tool | string | ToolContract | Pick<ToolContract, "name">,
): ToolContract | undefined {
  if (typeof input === "string") {
    return undefined;
  }
  if ("definition" in input) {
    return getToolContract(input);
  }
  if (
    "family" in input
    && "riskLevel" in input
    && "needsPermission" in input
    && "activityDescription" in input
    && "resultSchema" in input
  ) {
    return input;
  }
  return undefined;
}

function mergeContracts(
  name: string,
  governance?: ToolContract,
  behavior?: ToolBehaviorContract,
  profile?: ReturnType<typeof getToolContractV2Profile>,
): ToolContractV2 {
  const family = governance?.family ?? profile?.family;
  const riskLevel = governance?.riskLevel ?? profile?.riskLevel;
  const needsPermission = governance?.needsPermission ?? profile?.needsPermission ?? false;
  const isReadOnly = governance?.isReadOnly ?? profile?.isReadOnly ?? true;
  const isConcurrencySafe = governance?.isConcurrencySafe ?? profile?.isConcurrencySafe ?? false;
  const activityDescription = governance?.activityDescription ?? profile?.activityDescription;
  const outputPersistencePolicy = governance?.outputPersistencePolicy ?? profile?.outputPersistencePolicy;
  const channels = governance?.channels ?? profile?.channels;
  const safeScopes = governance?.safeScopes ?? profile?.safeScopes;

  const recommendedWhen = mergeUniqueStrings(behavior?.useWhen, profile?.recommendedWhen);
  const avoidWhen = mergeUniqueStrings(behavior?.avoidWhen, profile?.avoidWhen);
  const preflightChecks = mergeUniqueStrings(behavior?.preflightChecks, profile?.preflightChecks);
  const fallbackStrategy = mergeUniqueStrings(behavior?.fallbackStrategy, profile?.fallbackStrategy);

  const confirmWhen = mergeUniqueStrings(
    needsPermission && activityDescription
      ? [
        `当前工具需要权限确认或运行策略放行后才能执行：${activityDescription}`,
      ]
      : undefined,
    profile?.confirmWhen,
  );

  const expectedOutput = mergeUniqueStrings(
    governance?.resultSchema
      ? [governance.resultSchema.description]
      : undefined,
    profile?.expectedOutput,
  );

  const sideEffectSummary = mergeUniqueStrings(
    buildSideEffectSummary({
      isReadOnly,
      outputPersistencePolicy,
      safeScopes,
    }),
    profile?.sideEffectSummary,
  );

  return {
    name: governance?.name ?? behavior?.name ?? name,
    family,
    riskLevel,
    needsPermission,
    isReadOnly,
    isConcurrencySafe,
    activityDescription,
    outputPersistencePolicy,
    channels,
    safeScopes,
    recommendedWhen,
    avoidWhen,
    confirmWhen,
    preflightChecks,
    fallbackStrategy,
    expectedOutput,
    sideEffectSummary,
    userVisibleRiskNote: buildUserVisibleRiskNote({
      riskLevel,
      needsPermission,
      override: profile?.userVisibleRiskNote,
    }),
    hasGovernanceContract: Boolean(governance),
    hasBehaviorContract: Boolean(behavior),
  };
}

function buildSideEffectSummary(input: {
  isReadOnly: boolean;
  outputPersistencePolicy?: ToolContract["outputPersistencePolicy"];
  safeScopes?: readonly ToolContract["safeScopes"][number][];
}): string[] {
  if (!input.outputPersistencePolicy && (!input.safeScopes || input.safeScopes.length === 0) && input.isReadOnly === true) {
    return ["该工具默认属于只读行为。"];
  }
  const lines: string[] = [];
  lines.push(input.isReadOnly ? "该工具默认属于只读行为。" : "该工具可能产生写入、状态变更或副作用。");
  if (input.outputPersistencePolicy) {
    lines.push(`输出持久化策略：${input.outputPersistencePolicy}。`);
  }
  if (input.safeScopes && input.safeScopes.length > 0) {
    lines.push(`安全域：${input.safeScopes.join(", ")}。`);
  }
  return lines;
}

function buildUserVisibleRiskNote(input: {
  riskLevel?: ToolContractRiskLevel;
  needsPermission: boolean;
  override?: string;
}): string | undefined {
  if (input.override) {
    return input.override;
  }
  if (!input.riskLevel && !input.needsPermission) {
    return undefined;
  }
  if (input.riskLevel === "critical") {
    return "高危工具，执行前应明确确认影响范围、目标对象和回滚方式。";
  }
  if (input.riskLevel === "high") {
    return "高风险工具，执行前应先确认边界、目标和副作用。";
  }
  if (input.needsPermission) {
    return "该工具通常需要额外确认后再执行。";
  }
  return undefined;
}

function mergeUniqueStrings(
  ...lists: Array<readonly string[] | undefined>
): string[] {
  const seen = new Set<string>();
  const merged: string[] = [];
  for (const list of lists) {
    for (const item of list ?? []) {
      const normalized = item.trim();
      if (!normalized || seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      merged.push(normalized);
    }
  }
  return merged;
}
