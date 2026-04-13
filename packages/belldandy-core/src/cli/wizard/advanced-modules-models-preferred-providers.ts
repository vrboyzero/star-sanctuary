import type { ModelProfile } from "@belldandy/agent";

import { buildProviderModelCatalog, normalizePreferredProviderIds } from "../../provider-model-catalog.js";

export function validatePreferredProviderInput(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }
  const normalized = normalizePreferredProviderIds(trimmed);
  if (normalized.length === 0) {
    return "Enter at least one provider id, or leave blank to clear the preferred order.";
  }
  return undefined;
}

export function buildPreferredProviderConfigPreviewLines(input: {
  fallbacks: ModelProfile[];
  currentValue?: string;
  nextValue: string;
}): string[] {
  const currentPreferredProviderIds = normalizePreferredProviderIds(input.currentValue);
  const nextPreferredProviderIds = normalizePreferredProviderIds(input.nextValue);
  const currentSnapshot = buildProviderModelCatalog({
    modelFallbacks: input.fallbacks,
    preferredProviderIds: currentPreferredProviderIds,
  });
  const availableProviderIds = new Set(currentSnapshot.providers.map((item) => item.id));
  const matchedProviderIds = nextPreferredProviderIds.filter((item) => availableProviderIds.has(item));
  const unmatchedProviderIds = nextPreferredProviderIds.filter((item) => !availableProviderIds.has(item));
  const effectiveProviderGrouping = [
    ...matchedProviderIds,
    ...currentSnapshot.providers
      .map((item) => item.id)
      .filter((item) => !matchedProviderIds.includes(item)),
  ];

  const lines: string[] = [
    currentPreferredProviderIds.length > 0
      ? `Current preferred provider order: ${currentPreferredProviderIds.join(", ")}.`
      : "Current preferred provider order: not configured.",
    nextPreferredProviderIds.length > 0
      ? `Next effective provider order: ${nextPreferredProviderIds.join(", ")}.`
      : "Next effective provider order: cleared. Picker will fall back to the current default provider bucket.",
  ];

  if (currentSnapshot.providers.length > 0) {
    lines.push(`Current fallback provider buckets: ${currentSnapshot.providers.map((item) => `${item.label} (${item.id})`).join(", ")}.`);
  } else {
    lines.push("No fallback provider buckets are currently configured.");
  }

  if (matchedProviderIds.length > 0) {
    lines.push(`Matched current fallback buckets: ${matchedProviderIds.join(", ")}.`);
  }

  if (unmatchedProviderIds.length > 0) {
    lines.push(`Not currently visible from fallback buckets: ${unmatchedProviderIds.join(", ")}.`);
  }

  if (nextPreferredProviderIds.length > 0 && effectiveProviderGrouping.length > 0) {
    lines.push(`Picker provider grouping would start as: ${effectiveProviderGrouping.join(", ")}.`);
  }

  return lines;
}

export function summarizePreferredProviderConfig(rawValue: string): string {
  const normalized = normalizePreferredProviderIds(rawValue);
  return normalized.length > 0 ? normalized.join(", ") : "none";
}
