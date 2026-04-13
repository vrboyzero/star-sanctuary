import fs from "node:fs/promises";
import path from "node:path";

import type { WebhookRule } from "../../webhook/types.js";

export type WebhookOrganizeAction =
  | "enable_multiple"
  | "disable_multiple"
  | "remove_multiple";

export type WebhookOrganizeFilterMode =
  | "all"
  | "enabled"
  | "disabled"
  | "custom_template"
  | "default_template";

export type WebhookOrganizeEnabledMode = "any" | "enabled" | "disabled";

export type WebhookOrganizeTemplateMode = "any" | "custom_template" | "default_template";

export type WebhookOrganizeCriteria = {
  enabled: WebhookOrganizeEnabledMode;
  template: WebhookOrganizeTemplateMode;
};

export type WebhookOrganizePresetId =
  | "disable_default_template_rules"
  | "enable_disabled_custom_template_rules"
  | "remove_disabled_default_template_rules";

export type WebhookOrganizePreset = {
  id: WebhookOrganizePresetId;
  label: string;
  action: WebhookOrganizeAction;
  criteria: WebhookOrganizeCriteria;
  description: string;
};

export type PersistedWebhookOrganizeCustomPreset = {
  id: string;
  label: string;
  action: WebhookOrganizeAction;
  criteria: WebhookOrganizeCriteria;
  createdAt: number;
  updatedAt: number;
};

export type PersistedWebhookOrganizeLastSelection = {
  label: string;
  webhookIds: string[];
  storedAt: number;
};

export type PersistedWebhookOrganizeLastPreview = {
  label: string;
  action: WebhookOrganizeAction;
  webhookIds: string[];
  storedAt: number;
};

export type PersistedWebhookOrganizeState = {
  version: 1;
  customPresets: PersistedWebhookOrganizeCustomPreset[];
  lastSelection?: PersistedWebhookOrganizeLastSelection;
  lastPreview?: PersistedWebhookOrganizeLastPreview;
};

const WEBHOOK_ORGANIZE_PRESETS: WebhookOrganizePreset[] = [
  {
    id: "disable_default_template_rules",
    label: "Disable enabled JSON fallback webhooks",
    action: "disable_multiple",
    criteria: {
      enabled: "enabled",
      template: "default_template",
    },
    description: "Pause enabled webhooks still using JSON.stringify(payload) fallback",
  },
  {
    id: "enable_disabled_custom_template_rules",
    label: "Enable disabled custom-template webhooks",
    action: "enable_multiple",
    criteria: {
      enabled: "disabled",
      template: "custom_template",
    },
    description: "Recover custom-template webhooks that are disabled but already have tailored prompts",
  },
  {
    id: "remove_disabled_default_template_rules",
    label: "Remove disabled JSON fallback webhooks",
    action: "remove_multiple",
    criteria: {
      enabled: "disabled",
      template: "default_template",
    },
    description: "Clean up disabled webhooks still left on the default JSON fallback prompt path",
  },
];

const STATE_VERSION = 1 as const;
const STATE_FILENAME = "webhook-organize-state.json";

export function filterWebhookRulesForOrganize(
  rules: WebhookRule[],
  mode: WebhookOrganizeFilterMode,
): WebhookRule[] {
  return filterWebhookRulesByCriteria(rules, buildCriteriaFromFilterMode(mode));
}

export function formatWebhookOrganizeFilterLabel(mode: WebhookOrganizeFilterMode): string {
  switch (mode) {
    case "enabled":
      return "enabled webhooks";
    case "disabled":
      return "disabled webhooks";
    case "custom_template":
      return "webhooks with custom templates";
    case "default_template":
      return "webhooks using JSON.stringify(payload) fallback";
    case "all":
    default:
      return "all webhooks";
  }
}

export function filterWebhookRulesByCriteria(
  rules: WebhookRule[],
  criteria: WebhookOrganizeCriteria,
): WebhookRule[] {
  return rules.filter((rule) => {
    if (criteria.enabled === "enabled" && rule.enabled === false) {
      return false;
    }
    if (criteria.enabled === "disabled" && rule.enabled !== false) {
      return false;
    }
    const hasCustomTemplate = Boolean(rule.promptTemplate?.trim());
    if (criteria.template === "custom_template" && !hasCustomTemplate) {
      return false;
    }
    if (criteria.template === "default_template" && hasCustomTemplate) {
      return false;
    }
    return true;
  });
}

export function summarizeWebhookOrganizeCriteria(criteria: WebhookOrganizeCriteria): string {
  const parts: string[] = [];
  if (criteria.enabled === "enabled") parts.push("enabled");
  if (criteria.enabled === "disabled") parts.push("disabled");
  if (criteria.template === "custom_template") parts.push("custom template");
  if (criteria.template === "default_template") parts.push("JSON.stringify(payload) fallback");
  return parts.length > 0 ? parts.join(" + ") : "all webhooks";
}

export function listWebhookOrganizePresets(): WebhookOrganizePreset[] {
  return WEBHOOK_ORGANIZE_PRESETS.map((preset) => ({
    ...preset,
    criteria: { ...preset.criteria },
  }));
}

export function getWebhookOrganizePreset(id: WebhookOrganizePresetId): WebhookOrganizePreset | undefined {
  const preset = WEBHOOK_ORGANIZE_PRESETS.find((item) => item.id === id);
  return preset
    ? {
      ...preset,
      criteria: { ...preset.criteria },
    }
    : undefined;
}

export function formatWebhookOrganizeActionLabel(action: WebhookOrganizeAction): string {
  switch (action) {
    case "enable_multiple":
      return "enable";
    case "disable_multiple":
      return "disable";
    case "remove_multiple":
      return "remove";
    default:
      return "update";
  }
}

export function buildWebhookOrganizePreviewLines(input: {
  action: WebhookOrganizeAction;
  selectionLabel: string;
  rules: WebhookRule[];
}): string[] {
  const matchedCount = input.rules.length;
  const enabledCount = input.rules.filter((rule) => rule.enabled !== false).length;
  const disabledCount = matchedCount - enabledCount;
  const customTemplateCount = input.rules.filter((rule) => Boolean(rule.promptTemplate?.trim())).length;
  const defaultTemplateCount = matchedCount - customTemplateCount;
  const agentLabels = Array.from(new Set(input.rules.map((rule) => rule.defaultAgentId?.trim() || "default")));
  const actionLabel = formatWebhookOrganizeActionLabel(input.action);
  const pastTenseLabel = input.action === "enable_multiple"
    ? "enabled"
    : input.action === "disable_multiple"
      ? "disabled"
      : "removed";
  const changeCount = input.action === "enable_multiple"
    ? disabledCount
    : input.action === "disable_multiple"
      ? enabledCount
      : matchedCount;
  const unchangedCount = input.action === "remove_multiple"
    ? 0
    : matchedCount - changeCount;
  return [
    `Selection: ${input.selectionLabel}`,
    `Action preview: ${actionLabel}`,
    `Matched webhooks: ${matchedCount}`,
    input.action === "remove_multiple"
      ? `Would remove ${changeCount} webhook(s) from webhooks.json.`
      : `Would ${actionLabel} ${changeCount} webhook(s).`,
    ...(input.action === "remove_multiple" || unchangedCount === 0 ? [] : [`Already ${pastTenseLabel}: ${unchangedCount}`]),
    `Current state mix: enabled ${enabledCount}, disabled ${disabledCount}`,
    `Template mix: custom ${customTemplateCount}, JSON fallback ${defaultTemplateCount}`,
    `Agent coverage: ${summarizeLabels(agentLabels, 3)}`,
    `Matched webhook IDs: ${summarizeLabels(input.rules.map((rule) => rule.id), 5)}`,
  ];
}

export function buildWebhookOrganizeSelectionLabel(input: {
  title: string;
  ruleIds: string[];
}): string {
  return `${input.title}: ${summarizeLabels(input.ruleIds, 5)}`;
}

export function buildWebhookOrganizeStrategySaveLines(input: {
  mode: "saved" | "updated";
  label: string;
  action: WebhookOrganizeAction;
  criteria: WebhookOrganizeCriteria;
  rules: WebhookRule[];
  statePath: string;
}): string[] {
  const matchedCount = input.rules.length;
  const enabledCount = input.rules.filter((rule) => rule.enabled !== false).length;
  const disabledCount = matchedCount - enabledCount;
  const customTemplateCount = input.rules.filter((rule) => Boolean(rule.promptTemplate?.trim())).length;
  const defaultTemplateCount = matchedCount - customTemplateCount;
  const agentLabels = Array.from(new Set(input.rules.map((rule) => rule.defaultAgentId?.trim() || "default")));
  const missingPlaceholderRules = input.rules.filter((rule) => {
    const template = rule.promptTemplate?.trim();
    if (!template) return false;
    return extractWebhookTemplatePlaceholders(template).length === 0;
  });
  const nestedPlaceholderRules = input.rules.filter((rule) => {
    const template = rule.promptTemplate?.trim();
    if (!template) return false;
    return findUnsupportedWebhookPlaceholderKeys(extractWebhookTemplatePlaceholders(template)).length > 0;
  });
  const risks: string[] = [];
  if (input.action === "remove_multiple" && enabledCount > 0) {
    risks.push(`Removal strategy currently matches ${enabledCount} enabled webhook(s).`);
  }
  if (input.action === "enable_multiple" && defaultTemplateCount > 0) {
    risks.push(`${defaultTemplateCount} matched webhook(s) still use JSON.stringify(payload) fallback.`);
  }
  if (missingPlaceholderRules.length > 0) {
    risks.push(`${missingPlaceholderRules.length} matched custom-template webhook(s) have no {{placeholders}}.`);
  }
  if (nestedPlaceholderRules.length > 0) {
    risks.push(`${nestedPlaceholderRules.length} matched webhook(s) use unsupported nested placeholders.`);
  }
  return [
    `${input.mode === "updated" ? "Updated" : "Saved"} strategy: ${input.label}`,
    `Action: ${formatWebhookOrganizeActionLabel(input.action)}`,
    `Criteria: ${summarizeWebhookOrganizeCriteria(input.criteria)}`,
    `Matched now: ${matchedCount} webhook(s)`,
    `Current state mix: enabled ${enabledCount}, disabled ${disabledCount}`,
    `Template mix: custom ${customTemplateCount}, JSON fallback ${defaultTemplateCount}`,
    `Agent coverage: ${summarizeLabels(agentLabels, 3)}`,
    `Matched webhook IDs: ${summarizeLabels(input.rules.map((rule) => rule.id), 5)}`,
    ...risks.map((risk) => `Risk: ${risk}`),
    `Stored in: ${input.statePath}`,
  ];
}

export function slugifyWebhookOrganizePresetLabel(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "preset";
}

export function getWebhookOrganizeStatePath(stateDir: string): string {
  return path.join(stateDir, STATE_FILENAME);
}

export async function loadWebhookOrganizeState(stateDir: string): Promise<PersistedWebhookOrganizeState> {
  const filePath = getWebhookOrganizeStatePath(stateDir);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<PersistedWebhookOrganizeState> | null;
    return normalizeWebhookOrganizeState(parsed);
  } catch {
    return { version: STATE_VERSION, customPresets: [] };
  }
}

export async function saveWebhookOrganizeState(
  stateDir: string,
  state: PersistedWebhookOrganizeState,
): Promise<void> {
  const filePath = getWebhookOrganizeStatePath(stateDir);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(normalizeWebhookOrganizeState(state), null, 2)}\n`, "utf-8");
}

export function storeWebhookOrganizeLastPreview(
  state: PersistedWebhookOrganizeState,
  input: {
    label: string;
    action: WebhookOrganizeAction;
    webhookIds: string[];
  },
): PersistedWebhookOrganizeState {
  const label = input.label.trim();
  const webhookIds = input.webhookIds.map((item) => item.trim()).filter(Boolean);
  if (!label || webhookIds.length === 0) {
    return state;
  }
  return {
    ...state,
    lastPreview: {
      label,
      action: input.action,
      webhookIds,
      storedAt: Date.now(),
    },
  };
}

export function storeWebhookOrganizeLastSelection(
  state: PersistedWebhookOrganizeState,
  input: {
    label: string;
    webhookIds: string[];
  },
): PersistedWebhookOrganizeState {
  const label = input.label.trim();
  const webhookIds = input.webhookIds.map((item) => item.trim()).filter(Boolean);
  if (!label || webhookIds.length === 0) {
    return state;
  }
  return {
    ...state,
    lastSelection: {
      label,
      webhookIds,
      storedAt: Date.now(),
    },
  };
}

export function upsertWebhookOrganizeCustomPreset(
  state: PersistedWebhookOrganizeState,
  input: {
    id: string;
    label: string;
    action: WebhookOrganizeAction;
    criteria: WebhookOrganizeCriteria;
  },
): PersistedWebhookOrganizeState {
  const id = input.id.trim();
  const label = input.label.trim();
  if (!id || !label) {
    return state;
  }
  const now = Date.now();
  const existing = state.customPresets.find((item) => item.id === id);
  const nextPreset: PersistedWebhookOrganizeCustomPreset = {
    id,
    label,
    action: input.action,
    criteria: { ...input.criteria },
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  return {
    ...state,
    customPresets: [
      ...state.customPresets.filter((item) => item.id !== id),
      nextPreset,
    ].sort((left, right) => left.label.localeCompare(right.label)),
  };
}

export function renameWebhookOrganizeCustomPreset(
  state: PersistedWebhookOrganizeState,
  presetId: string,
  label: string,
): PersistedWebhookOrganizeState {
  const trimmed = label.trim();
  if (!trimmed) return state;
  const now = Date.now();
  return {
    ...state,
    customPresets: state.customPresets.map((item) => {
      if (item.id !== presetId) return item;
      return {
        ...item,
        label: trimmed,
        updatedAt: now,
      };
    }).sort((left, right) => left.label.localeCompare(right.label)),
  };
}

export function removeWebhookOrganizeCustomPreset(
  state: PersistedWebhookOrganizeState,
  presetId: string,
): PersistedWebhookOrganizeState {
  return {
    ...state,
    customPresets: state.customPresets.filter((item) => item.id !== presetId),
  };
}

export function clearWebhookOrganizeCustomPresets(
  state: PersistedWebhookOrganizeState,
): PersistedWebhookOrganizeState {
  return {
    ...state,
    customPresets: [],
  };
}

export function buildWebhookOrganizeCriteriaFromFilterMode(
  mode: WebhookOrganizeFilterMode,
): WebhookOrganizeCriteria {
  return buildCriteriaFromFilterMode(mode);
}

function buildCriteriaFromFilterMode(mode: WebhookOrganizeFilterMode): WebhookOrganizeCriteria {
  switch (mode) {
    case "enabled":
      return { enabled: "enabled", template: "any" };
    case "disabled":
      return { enabled: "disabled", template: "any" };
    case "custom_template":
      return { enabled: "any", template: "custom_template" };
    case "default_template":
      return { enabled: "any", template: "default_template" };
    case "all":
    default:
      return { enabled: "any", template: "any" };
  }
}

function normalizeWebhookOrganizeState(
  value: Partial<PersistedWebhookOrganizeState> | null | undefined,
): PersistedWebhookOrganizeState {
  const customPresets = Array.isArray(value?.customPresets)
    ? value.customPresets
      .map((item) => normalizeCustomPreset(item))
      .filter((item): item is PersistedWebhookOrganizeCustomPreset => Boolean(item))
    : [];
  const lastSelection = normalizeLastSelection(value?.lastSelection);
  const lastPreview = normalizeLastPreview(value?.lastPreview);
  return {
    version: STATE_VERSION,
    customPresets,
    ...(lastSelection ? { lastSelection } : {}),
    ...(lastPreview ? { lastPreview } : {}),
  };
}

function normalizeCustomPreset(value: unknown): PersistedWebhookOrganizeCustomPreset | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const id = typeof item.id === "string" ? item.id.trim() : "";
  const label = typeof item.label === "string" ? item.label.trim() : "";
  const action = item.action === "enable_multiple" || item.action === "disable_multiple" || item.action === "remove_multiple"
    ? item.action
    : null;
  const criteria = item.criteria && typeof item.criteria === "object"
    ? normalizeCriteria(item.criteria as Record<string, unknown>)
    : null;
  const createdAt = typeof item.createdAt === "number" && Number.isFinite(item.createdAt) ? item.createdAt : Date.now();
  const updatedAt = typeof item.updatedAt === "number" && Number.isFinite(item.updatedAt) ? item.updatedAt : createdAt;
  if (!id || !label || !action || !criteria) return null;
  return {
    id,
    label,
    action,
    criteria,
    createdAt,
    updatedAt,
  };
}

function normalizeLastSelection(value: unknown): PersistedWebhookOrganizeLastSelection | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  const label = typeof item.label === "string" ? item.label.trim() : "";
  const webhookIds = Array.isArray(item.webhookIds)
    ? item.webhookIds.map((entry) => typeof entry === "string" ? entry.trim() : "").filter(Boolean)
    : [];
  const storedAt = typeof item.storedAt === "number" && Number.isFinite(item.storedAt) ? item.storedAt : Date.now();
  if (!label || webhookIds.length === 0) return undefined;
  return { label, webhookIds, storedAt };
}

function normalizeLastPreview(value: unknown): PersistedWebhookOrganizeLastPreview | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  const label = typeof item.label === "string" ? item.label.trim() : "";
  const action = item.action === "enable_multiple" || item.action === "disable_multiple" || item.action === "remove_multiple"
    ? item.action
    : undefined;
  const webhookIds = Array.isArray(item.webhookIds)
    ? item.webhookIds.map((entry) => typeof entry === "string" ? entry.trim() : "").filter(Boolean)
    : [];
  const storedAt = typeof item.storedAt === "number" && Number.isFinite(item.storedAt) ? item.storedAt : Date.now();
  if (!label || !action || webhookIds.length === 0) return undefined;
  return { label, action, webhookIds, storedAt };
}

function normalizeCriteria(value: Record<string, unknown>): WebhookOrganizeCriteria | null {
  const enabled = value.enabled === "enabled" || value.enabled === "disabled" || value.enabled === "any"
    ? value.enabled
    : null;
  const template = value.template === "custom_template" || value.template === "default_template" || value.template === "any"
    ? value.template
    : null;
  if (!enabled || !template) {
    return null;
  }
  return { enabled, template };
}

function extractWebhookTemplatePlaceholders(template: string): string[] {
  const values = Array.from(template.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g))
    .map((match) => String(match[1] ?? "").trim())
    .filter(Boolean);
  return Array.from(new Set(values));
}

function findUnsupportedWebhookPlaceholderKeys(placeholders: string[]): string[] {
  return placeholders.filter((key) => key.includes(".") || key.includes("[") || key.includes("]"));
}

function summarizeLabels(values: string[], limit: number): string {
  if (values.length === 0) {
    return "none";
  }
  if (values.length <= limit) {
    return values.join(", ");
  }
  return `${values.slice(0, limit).join(", ")} +${values.length - limit} more`;
}
