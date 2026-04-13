import type { ModelProfile } from "@belldandy/agent";

import { buildProviderModelCatalog, normalizePreferredProviderIds } from "../../provider-model-catalog.js";

const GENERIC_PROVIDER_IDS = new Set(["openai-compatible", "custom"]);

type CatalogNamedModelEntry = ReturnType<typeof buildProviderModelCatalog>["models"][number];

export function buildModelProviderProtocolDiagnostics(input: {
  fallbacks: ModelProfile[];
}): string[] {
  const fallbacks = Array.isArray(input.fallbacks) ? input.fallbacks : [];
  if (fallbacks.length === 0) {
    return ["No fallback models are configured yet."];
  }

  const snapshot = buildProviderModelCatalog({ modelFallbacks: fallbacks });
  const models = snapshot.models.filter((item) => item.source === "named");
  const lines: string[] = [];

  const providerGroups = new Map<string, { providerId: string; providerLabel: string; ids: string[] }>();
  for (const item of models) {
    const existing = providerGroups.get(item.providerId) ?? {
      providerId: item.providerId,
      providerLabel: item.providerLabel,
      ids: [],
    };
    existing.ids.push(item.id);
    providerGroups.set(item.providerId, existing);
  }

  const providerSummaries = [...providerGroups.values()]
    .sort((left, right) => left.providerLabel.localeCompare(right.providerLabel, "zh-Hans-CN-u-co-pinyin"))
    .map((group) => `${group.providerLabel} (${group.ids.length})`);
  lines.push(`Fallbacks span ${providerGroups.size} provider bucket(s): ${providerSummaries.join(", ")}.`);

  const duplicateProviders = [...providerGroups.values()]
    .filter((group) => group.ids.length > 1)
    .sort((left, right) => left.providerLabel.localeCompare(right.providerLabel, "zh-Hans-CN-u-co-pinyin"));
  if (duplicateProviders.length > 0) {
    lines.push(
      `Multiple fallbacks still share the same provider bucket: ${duplicateProviders
        .map((group) => `${group.providerLabel} -> ${summarizeIds(group.ids)}`)
        .join("; ")}. This improves model variety but not cross-provider resilience.`,
    );
  }

  const genericProviders = [...providerGroups.values()]
    .filter((group) => GENERIC_PROVIDER_IDS.has(group.providerId))
    .sort((left, right) => left.providerLabel.localeCompare(right.providerLabel, "zh-Hans-CN-u-co-pinyin"));
  if (genericProviders.length > 0) {
    lines.push(
      `${countIds(genericProviders)} fallback(s) still resolve to generic provider buckets: ${genericProviders
        .map((group) => `${group.providerLabel} -> ${summarizeIds(group.ids)}`)
        .join("; ")}. Check baseUrl/protocol if you expected a named provider.`,
    );
  }

  const inheritedProtocol = fallbacks
    .filter((profile) => !normalizeOptionalString(profile.protocol))
    .map((profile) => fallbackId(profile));
  if (inheritedProtocol.length > 0) {
    lines.push(
      `${inheritedProtocol.length} fallback(s) inherit the global protocol: ${summarizeIds(inheritedProtocol)}. Mixed providers usually diagnose better with explicit protocol overrides.`,
    );
  }

  const anthropicWithWireApi = fallbacks
    .filter((profile) => normalizeOptionalString(profile.protocol) === "anthropic" && normalizeOptionalString(profile.wireApi))
    .map((profile) => fallbackId(profile));
  if (anthropicWithWireApi.length > 0) {
    lines.push(
      `${anthropicWithWireApi.length} fallback(s) set protocol=anthropic and also override wireApi: ${summarizeIds(anthropicWithWireApi)}. wireApi is ignored on anthropic protocol routes.`,
    );
  }

  const responsesFallbacks = fallbacks
    .filter((profile) => normalizeOptionalString(profile.protocol) !== "anthropic" && normalizeOptionalString(profile.wireApi) === "responses")
    .map((profile) => fallbackId(profile));
  if (responsesFallbacks.length > 0) {
    lines.push(
      `${responsesFallbacks.length} fallback(s) force wireApi=responses: ${summarizeIds(responsesFallbacks)}. Verify the provider/model supports /responses before relying on failover.`,
    );
  }

  const missingAuthRuntime = models
    .filter((item) => item.authStatus === "missing")
    .map((item) => item.id);
  if (missingAuthRuntime.length > 0) {
    lines.push(
      `${missingAuthRuntime.length} fallback(s) are missing required auth/runtime fields: ${summarizeIds(missingAuthRuntime)}. models.list will mark them as auth missing.`,
    );
  }

  const duplicateRoutes = collectDuplicateRoutes(models);
  if (duplicateRoutes.length > 0) {
    lines.push(
      `Duplicate provider/model routes detected: ${duplicateRoutes
        .map((route) => `${route.label} -> ${summarizeIds(route.ids)}`)
        .join("; ")}. Keep both only if timeout/proxy/retry settings are intentionally different.`,
    );
  }

  return lines;
}

export function buildModelCatalogPickerLinkLines(input: {
  fallbacks: ModelProfile[];
  preferredProviderValue?: string;
}): string[] {
  const fallbacks = Array.isArray(input.fallbacks) ? input.fallbacks : [];
  const preferredProviderIds = normalizePreferredProviderIds(input.preferredProviderValue);
  const snapshot = buildProviderModelCatalog({
    modelFallbacks: fallbacks,
    preferredProviderIds,
  });
  const lines: string[] = [];
  const providerLabels = snapshot.providers.map((item) => item.label);
  const fallbackModels = snapshot.models.filter((item) => item.source === "named");
  const missingAuthCount = fallbackModels.filter((item) => item.authStatus === "missing").length;

  lines.push(
    snapshot.providers.length > 0
      ? `models.list / WebChat picker currently see ${snapshot.providers.length} provider bucket(s): ${providerLabels.join(", ")}.`
      : "models.list / WebChat picker currently only expose the primary model bucket.",
  );

  if (snapshot.preferredProviderIds.length > 0) {
    lines.push(
      `Preferred provider order from BELLDANDY_MODEL_PREFERRED_PROVIDERS: ${snapshot.preferredProviderIds.join(", ")}. Picker groups providers in that order first.`,
    );
  } else {
    lines.push("No preferred provider order is configured; picker will infer preference from the current default provider bucket.");
  }

  if (missingAuthCount > 0) {
    lines.push(`${missingAuthCount} fallback(s) would show auth missing in the picker until apiKey/baseUrl/model are complete.`);
  }

  lines.push("This workflow edits fallback routes only; primary model and compaction/memory-summary model settings still live outside configure models.");
  return lines;
}

function fallbackId(profile: Pick<ModelProfile, "id" | "model">): string {
  return normalizeOptionalString(profile.id) || normalizeOptionalString(profile.model) || "<missing-id>";
}

function normalizeOptionalString(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function summarizeIds(ids: string[], limit = 3): string {
  const normalized = ids.filter(Boolean);
  if (normalized.length <= limit) {
    return normalized.join(", ");
  }
  return `${normalized.slice(0, limit).join(", ")} +${normalized.length - limit} more`;
}

function countIds(groups: Array<{ ids: string[] }>): number {
  return groups.reduce((total, group) => total + group.ids.length, 0);
}

function collectDuplicateRoutes(models: CatalogNamedModelEntry[]): Array<{ label: string; ids: string[] }> {
  const groups = new Map<string, { label: string; ids: string[] }>();
  for (const item of models) {
    const routeKey = [
      item.providerId,
      normalizeOptionalString(item.model).toLowerCase(),
      normalizeOptionalString(item.protocol).toLowerCase(),
      normalizeOptionalString(item.wireApi).toLowerCase(),
    ].join("|");
    const label = `${item.providerLabel}:${item.model}`;
    const existing = groups.get(routeKey) ?? { label, ids: [] };
    existing.ids.push(item.id);
    groups.set(routeKey, existing);
  }
  return [...groups.values()]
    .filter((group) => group.ids.length > 1)
    .sort((left, right) => left.label.localeCompare(right.label, "zh-Hans-CN-u-co-pinyin"));
}
