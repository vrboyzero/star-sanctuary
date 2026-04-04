import {
  estimateTokens,
  type AgentPromptDelta,
  type ProviderNativeSystemBlock,
  type SystemPromptSection,
} from "@belldandy/agent";

export type PromptTextMetrics = {
  charLength: number;
  estimatedChars: number;
  estimatedTokens: number;
};

export type PromptExperimentConfig = {
  disabledSectionIds: string[];
  sectionPriorityOverrides: Record<string, number>;
  disabledToolContractNames: string[];
};

export type PromptTokenBreakdown = {
  systemPromptEstimatedChars: number;
  systemPromptEstimatedTokens: number;
  sectionEstimatedChars: number;
  sectionEstimatedTokens: number;
  droppedSectionEstimatedChars: number;
  droppedSectionEstimatedTokens: number;
  deltaEstimatedChars: number;
  deltaEstimatedTokens: number;
  providerNativeSystemBlockEstimatedChars: number;
  providerNativeSystemBlockEstimatedTokens: number;
};

export type PromptInspectionLike = {
  scope?: "agent" | "run";
  agentId: string;
  displayName?: string;
  model?: string;
  conversationId?: string;
  runId?: string;
  createdAt?: number;
  text: string;
  totalChars: number;
  finalChars: number;
  sections?: Array<{ id: string; text: string }>;
  droppedSections?: Array<{ id: string; text: string }>;
  deltas?: Array<{ id: string; deltaType?: string; text: string }>;
  providerNativeSystemBlocks?: Array<{ id: string; blockType?: string; text: string; cacheControlEligible?: boolean }>;
  metadata?: Record<string, unknown>;
};

export type PromptObservabilitySummary = {
  scope?: "agent" | "run";
  agentId: string;
  displayName?: string;
  model?: string;
  conversationId?: string;
  runId?: string;
  createdAt?: number;
  counts: {
    sectionCount: number;
    droppedSectionCount: number;
    deltaCount: number;
    providerNativeSystemBlockCount: number;
  };
  promptSizes: {
    totalChars: number;
    finalChars: number;
  };
  tokenBreakdown: PromptTokenBreakdown;
  experiments?: Record<string, unknown>;
};

export function measurePromptText(text: string): PromptTextMetrics {
  const charLength = text.length;
  return {
    charLength,
    estimatedChars: charLength,
    estimatedTokens: estimateTokens(text),
  };
}

export function withSectionPromptMetrics(
  section: SystemPromptSection,
): SystemPromptSection & PromptTextMetrics {
  return {
    ...section,
    ...measurePromptText(section.text),
  };
}

export function withDeltaPromptMetrics(
  delta: AgentPromptDelta,
): AgentPromptDelta & PromptTextMetrics {
  return {
    ...delta,
    ...measurePromptText(delta.text),
  };
}

export function withProviderNativeSystemBlockPromptMetrics(
  block: ProviderNativeSystemBlock,
): ProviderNativeSystemBlock & PromptTextMetrics {
  return {
    ...block,
    sourceSectionIds: [...block.sourceSectionIds],
    sourceDeltaIds: [...block.sourceDeltaIds],
    ...measurePromptText(block.text),
  };
}

export function buildPromptTokenBreakdown(input: {
  systemPromptText?: string;
  sections?: Array<{ text: string }>;
  droppedSections?: Array<{ text: string }>;
  deltas?: Array<{ text: string }>;
  providerNativeSystemBlocks?: Array<{ text: string }>;
}): PromptTokenBreakdown {
  return {
    systemPromptEstimatedChars: input.systemPromptText?.length ?? 0,
    systemPromptEstimatedTokens: estimateTokens(input.systemPromptText ?? ""),
    sectionEstimatedChars: sumTextChars(input.sections),
    sectionEstimatedTokens: sumTextTokens(input.sections),
    droppedSectionEstimatedChars: sumTextChars(input.droppedSections),
    droppedSectionEstimatedTokens: sumTextTokens(input.droppedSections),
    deltaEstimatedChars: sumTextChars(input.deltas),
    deltaEstimatedTokens: sumTextTokens(input.deltas),
    providerNativeSystemBlockEstimatedChars: sumTextChars(input.providerNativeSystemBlocks),
    providerNativeSystemBlockEstimatedTokens: sumTextTokens(input.providerNativeSystemBlocks),
  };
}

export function buildPromptObservabilitySummary(
  inspection: PromptInspectionLike,
): PromptObservabilitySummary {
  const metadata = isRecord(inspection.metadata) ? inspection.metadata : undefined;
  const tokenBreakdown = readPromptTokenBreakdownFromMetadata(metadata) ?? buildPromptTokenBreakdown({
    systemPromptText: inspection.text,
    sections: inspection.sections,
    droppedSections: inspection.droppedSections,
    deltas: inspection.deltas,
    providerNativeSystemBlocks: inspection.providerNativeSystemBlocks,
  });

  return {
    scope: inspection.scope,
    agentId: inspection.agentId,
    ...(inspection.displayName ? { displayName: inspection.displayName } : {}),
    ...(inspection.model ? { model: inspection.model } : {}),
    ...(inspection.conversationId ? { conversationId: inspection.conversationId } : {}),
    ...(inspection.runId ? { runId: inspection.runId } : {}),
    ...(typeof inspection.createdAt === "number" ? { createdAt: inspection.createdAt } : {}),
    counts: {
      sectionCount: inspection.sections?.length ?? 0,
      droppedSectionCount: inspection.droppedSections?.length ?? 0,
      deltaCount: inspection.deltas?.length ?? 0,
      providerNativeSystemBlockCount: inspection.providerNativeSystemBlocks?.length ?? 0,
    },
    promptSizes: {
      totalChars: inspection.totalChars,
      finalChars: inspection.finalChars,
    },
    tokenBreakdown,
    ...(metadata?.promptExperiments && isRecord(metadata.promptExperiments)
      ? { experiments: metadata.promptExperiments }
      : {}),
  };
}

export function parsePromptExperimentConfig(input: {
  disabledSectionIdsRaw?: string;
  sectionPriorityOverridesRaw?: string;
  disabledToolContractNamesRaw?: string;
}): PromptExperimentConfig | undefined {
  const disabledSectionIds = normalizeCsv(input.disabledSectionIdsRaw);
  const sectionPriorityOverrides = normalizePriorityOverrideMap(input.sectionPriorityOverridesRaw);
  const disabledToolContractNames = normalizeCsv(input.disabledToolContractNamesRaw);
  if (
    disabledSectionIds.length === 0
    && Object.keys(sectionPriorityOverrides).length === 0
    && disabledToolContractNames.length === 0
  ) {
    return undefined;
  }
  return {
    disabledSectionIds,
    sectionPriorityOverrides,
    disabledToolContractNames,
  };
}

export function applyPromptExperimentsToSections(
  sections: SystemPromptSection[],
  config?: PromptExperimentConfig,
): {
  sections: SystemPromptSection[];
  droppedSections: SystemPromptSection[];
  disabledSectionIdsApplied: string[];
  sectionPriorityOverridesApplied: Record<string, number>;
} {
  const sectionsWithOverrides = applySectionPriorityOverrides(
    sections,
    config?.sectionPriorityOverrides,
  );
  const orderedSections = sortSectionsByPriority(sectionsWithOverrides);
  const sectionPriorityOverridesApplied = orderedSections.reduce<Record<string, number>>((result, section) => {
    if (config?.sectionPriorityOverrides && Object.prototype.hasOwnProperty.call(config.sectionPriorityOverrides, section.id)) {
      result[section.id] = section.priority;
    }
    return result;
  }, {});

  if (!config || config.disabledSectionIds.length === 0) {
    return {
      sections: orderedSections,
      droppedSections: [],
      disabledSectionIdsApplied: [],
      sectionPriorityOverridesApplied,
    };
  }

  const disabledIds = new Set(config.disabledSectionIds);
  const keptSections: SystemPromptSection[] = [];
  const droppedSections: SystemPromptSection[] = [];

  for (const section of orderedSections) {
    if (disabledIds.has(section.id)) {
      droppedSections.push(section);
      continue;
    }
    keptSections.push(section);
  }

  return {
    sections: keptSections,
    droppedSections,
    disabledSectionIdsApplied: config.disabledSectionIds.filter((id) => droppedSections.some((section) => section.id === id)),
    sectionPriorityOverridesApplied,
  };
}

function sumTextChars(items?: Array<{ text: string }>): number {
  return items?.reduce((sum, item) => sum + item.text.length, 0) ?? 0;
}

function sumTextTokens(items?: Array<{ text: string }>): number {
  return items?.reduce((sum, item) => sum + estimateTokens(item.text), 0) ?? 0;
}

function normalizeCsv(raw?: string): string[] {
  if (!raw) {
    return [];
  }
  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizePriorityOverrideMap(raw?: string): Record<string, number> {
  if (!raw) {
    return {};
  }

  const result: Record<string, number> = {};
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) {
      continue;
    }
    const separatorIndex = trimmed.indexOf(":");
    if (separatorIndex <= 0) {
      continue;
    }
    const id = trimmed.slice(0, separatorIndex).trim();
    const value = Number(trimmed.slice(separatorIndex + 1).trim());
    if (!id || !Number.isFinite(value)) {
      continue;
    }
    result[id] = Math.trunc(value);
  }

  return result;
}

function applySectionPriorityOverrides(
  sections: SystemPromptSection[],
  overrides?: Record<string, number>,
): SystemPromptSection[] {
  if (!overrides || Object.keys(overrides).length === 0) {
    return [...sections];
  }

  return sections.map((section) => ({
    ...section,
    priority: Object.prototype.hasOwnProperty.call(overrides, section.id)
      ? overrides[section.id]!
      : section.priority,
  }));
}

function sortSectionsByPriority(
  sections: SystemPromptSection[],
): SystemPromptSection[] {
  return sections
    .map((section, index) => ({ section, index }))
    .sort((left, right) => {
      const priorityDiff = left.section.priority - right.section.priority;
      if (priorityDiff !== 0) {
        return priorityDiff;
      }
      return left.index - right.index;
    })
    .map((entry) => entry.section);
}

function readPromptTokenBreakdownFromMetadata(
  metadata?: Record<string, unknown>,
): PromptTokenBreakdown | undefined {
  const rawValue = metadata?.tokenBreakdown ?? metadata?.promptTokenBreakdown;
  if (!isRecord(rawValue)) {
    return undefined;
  }
  const value = rawValue as Record<string, unknown>;
  const breakdown: PromptTokenBreakdown = {
    systemPromptEstimatedChars: readNonNegativeNumber(value.systemPromptEstimatedChars),
    systemPromptEstimatedTokens: readNonNegativeNumber(value.systemPromptEstimatedTokens),
    sectionEstimatedChars: readNonNegativeNumber(value.sectionEstimatedChars),
    sectionEstimatedTokens: readNonNegativeNumber(value.sectionEstimatedTokens),
    droppedSectionEstimatedChars: readNonNegativeNumber(value.droppedSectionEstimatedChars),
    droppedSectionEstimatedTokens: readNonNegativeNumber(value.droppedSectionEstimatedTokens),
    deltaEstimatedChars: readNonNegativeNumber(value.deltaEstimatedChars),
    deltaEstimatedTokens: readNonNegativeNumber(value.deltaEstimatedTokens),
    providerNativeSystemBlockEstimatedChars: readNonNegativeNumber(value.providerNativeSystemBlockEstimatedChars),
    providerNativeSystemBlockEstimatedTokens: readNonNegativeNumber(value.providerNativeSystemBlockEstimatedTokens),
  };
  return breakdown;
}

function readNonNegativeNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
