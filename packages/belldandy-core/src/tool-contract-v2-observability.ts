import {
  buildToolContractV2Summary,
  type ToolContractV2,
  type ToolContractV2Summary,
} from "@belldandy/skills";

export type SerializedToolContractV2 = {
  family?: string;
  riskLevel?: string;
  needsPermission: boolean;
  isReadOnly: boolean;
  isConcurrencySafe: boolean;
  activityDescription?: string;
  recommendedWhen: string[];
  avoidWhen: string[];
  confirmWhen: string[];
  preflightChecks: string[];
  fallbackStrategy: string[];
  expectedOutput: string[];
  sideEffectSummary: string[];
  userVisibleRiskNote?: string;
  hasGovernanceContract: boolean;
  hasBehaviorContract: boolean;
};

export function buildEmptyToolContractV2Summary(): ToolContractV2Summary {
  return {
    totalCount: 0,
    missingV2Count: 0,
    highRiskCount: 0,
    confirmRequiredCount: 0,
    governedTools: [],
    missingV2Tools: [],
  };
}

export function serializeToolContractV2Contracts(
  contracts: readonly ToolContractV2[],
): Record<string, SerializedToolContractV2> {
  return Object.fromEntries(contracts.map((contract) => [
    contract.name,
    {
      family: contract.family,
      riskLevel: contract.riskLevel,
      needsPermission: contract.needsPermission,
      isReadOnly: contract.isReadOnly,
      isConcurrencySafe: contract.isConcurrencySafe,
      activityDescription: contract.activityDescription,
      recommendedWhen: [...contract.recommendedWhen],
      avoidWhen: [...contract.avoidWhen],
      confirmWhen: [...contract.confirmWhen],
      preflightChecks: [...contract.preflightChecks],
      fallbackStrategy: [...contract.fallbackStrategy],
      expectedOutput: [...contract.expectedOutput],
      sideEffectSummary: [...contract.sideEffectSummary],
      userVisibleRiskNote: contract.userVisibleRiskNote,
      hasGovernanceContract: contract.hasGovernanceContract,
      hasBehaviorContract: contract.hasBehaviorContract,
    },
  ]));
}

export function buildToolContractV2Observability(input: {
  contracts: readonly ToolContractV2[];
  registeredToolNames?: readonly string[];
}): {
  summary: ToolContractV2Summary;
  contracts: Record<string, SerializedToolContractV2>;
} {
  return {
    summary: buildToolContractV2Summary(input.contracts, {
      registeredToolNames: input.registeredToolNames,
    }),
    contracts: serializeToolContractV2Contracts(input.contracts),
  };
}
