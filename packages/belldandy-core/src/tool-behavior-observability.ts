import {
  buildToolBehaviorContractSummary,
  listToolBehaviorContracts,
  type ToolBehaviorContract,
} from "@belldandy/skills";

export type ToolBehaviorContractPayload = {
  useWhen: string[];
  avoidWhen: string[];
  preflightChecks: string[];
  fallbackStrategy: string[];
};

export type ToolBehaviorObservability = {
  counts: {
    includedContractCount: number;
  };
  included: string[];
  summary?: string;
  contracts: Record<string, ToolBehaviorContractPayload>;
  experiment?: {
    disabledContractNamesConfigured: string[];
    disabledContractNamesApplied: string[];
  };
};

export function buildToolBehaviorObservability(input?: {
  contracts?: readonly string[] | readonly Pick<ToolBehaviorContract, "name">[];
  disabledContractNamesConfigured?: readonly string[];
  disabledContractNamesApplied?: readonly string[];
}): ToolBehaviorObservability {
  const behaviorContracts = listToolBehaviorContracts(input?.contracts);
  const included = behaviorContracts.map((contract) => contract.name);
  const disabledContractNamesConfigured = normalizeNames(input?.disabledContractNamesConfigured);
  const disabledContractNamesApplied = normalizeNames(
    input?.disabledContractNamesApplied
      ?? disabledContractNamesConfigured.filter((name) => allKnownToolBehaviorContractNames.has(name)),
  );
  if (behaviorContracts.length === 0) {
    return {
      counts: {
        includedContractCount: 0,
      },
      included: [],
      contracts: {},
      ...(disabledContractNamesConfigured.length > 0 || disabledContractNamesApplied.length > 0
        ? {
          experiment: {
            disabledContractNamesConfigured,
            disabledContractNamesApplied,
          },
        }
        : {}),
    };
  }

  return {
    counts: {
      includedContractCount: included.length,
    },
    included,
    summary: buildToolBehaviorContractSummary(behaviorContracts),
    contracts: Object.fromEntries(behaviorContracts.map((contract) => [
      contract.name,
      serializeToolBehaviorContract(contract),
    ])),
    ...(disabledContractNamesConfigured.length > 0 || disabledContractNamesApplied.length > 0
      ? {
        experiment: {
          disabledContractNamesConfigured,
          disabledContractNamesApplied,
        },
      }
      : {}),
  };
}

export function readConfiguredPromptExperimentToolContracts(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  return normalizeNames((env.BELLDANDY_PROMPT_EXPERIMENT_DISABLE_TOOL_CONTRACTS ?? "").split(","));
}

function serializeToolBehaviorContract(
  contract: ToolBehaviorContract,
): ToolBehaviorContractPayload {
  return {
    useWhen: [...contract.useWhen],
    avoidWhen: [...contract.avoidWhen],
    preflightChecks: [...contract.preflightChecks],
    fallbackStrategy: [...contract.fallbackStrategy],
  };
}

const allKnownToolBehaviorContractNames = new Set(
  listToolBehaviorContracts().map((contract) => contract.name),
);

function normalizeNames(values?: readonly string[] | string[]): string[] {
  if (!values || values.length === 0) {
    return [];
  }
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const value of values) {
    const trimmed = value.trim();
    if (!trimmed || seen.has(trimmed)) {
      continue;
    }
    seen.add(trimmed);
    normalized.push(trimmed);
  }
  return normalized;
}
