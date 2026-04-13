import type { ModelConfigFile, ModelProfile } from "@belldandy/agent";
import type { CronJob } from "../../cron/index.js";
import type { WebhookConfig, WebhookRule } from "../../webhook/types.js";

export type AdvancedModule = "community" | "models" | "webhook" | "cron";
export type ModelFallbackSortMode = "id" | "displayName" | "model";
export type CronOrganizeFilterMode =
  | "all"
  | "enabled"
  | "disabled"
  | "failed"
  | "skipped"
  | "ok"
  | "silent"
  | "goal_approval_scan"
  | "system_event"
  | "missing_next_run";
export type CronOrganizeEnabledMode = "any" | "enabled" | "disabled";
export type CronOrganizeLastStatusMode = "any" | "error" | "skipped" | "ok";
export type CronOrganizePayloadKindMode = "any" | "goalApprovalScan" | "systemEvent";
export type CronOrganizeBatchCriteria = {
  enabled: CronOrganizeEnabledMode;
  lastStatus: CronOrganizeLastStatusMode;
  payloadKind: CronOrganizePayloadKindMode;
  silentOnly: boolean;
  missingNextRunOnly: boolean;
  failureDeliveryOffOnly: boolean;
  oneShotOnly: boolean;
};
export type CronOrganizeAction = "enable_multiple" | "disable_multiple" | "remove_multiple";
export type CronOrganizePresetId =
  | "disable_silent_failed"
  | "disable_missing_next_run"
  | "disable_goal_scans_without_failure_delivery"
  | "enable_disabled_goal_scans"
  | "remove_disabled_one_shot";
export type CronOrganizePresetDefinition = {
  id: CronOrganizePresetId;
  label: string;
  action: CronOrganizeAction;
  criteria: CronOrganizeBatchCriteria;
  description: string;
};

const WEBHOOK_ID_PATTERN = /^[A-Za-z0-9._-]+$/;
const HEARTBEAT_INTERVAL_PATTERN = /^(\d+)(m|h|s)?$/i;
const ACTIVE_HOURS_PATTERN = /^(.+)-(.+)$/;

export function upsertModelFallbackProfile(
  config: ModelConfigFile,
  profile: ModelProfile,
): ModelConfigFile {
  const fallbacks = [...config.fallbacks];
  const index = fallbacks.findIndex((item) => item.id === profile.id);
  if (index >= 0) {
    fallbacks[index] = { ...fallbacks[index], ...profile };
  } else {
    fallbacks.push(profile);
  }
  return { fallbacks };
}

export function removeModelFallbackProfile(
  config: ModelConfigFile,
  id: string,
): ModelConfigFile {
  return {
    fallbacks: config.fallbacks.filter((item) => item.id !== id),
  };
}

export function removeModelFallbackProfiles(
  config: ModelConfigFile,
  ids: string[],
): ModelConfigFile {
  const targets = new Set(ids.map((item) => String(item ?? "").trim()).filter(Boolean));
  return {
    fallbacks: config.fallbacks.filter((item) => !targets.has(item.id ?? "")),
  };
}

function compareNormalizedStrings(left: string | undefined, right: string | undefined): number {
  const a = String(left ?? "").trim().toLowerCase();
  const b = String(right ?? "").trim().toLowerCase();
  return a.localeCompare(b);
}

export function sortModelFallbackProfiles(
  config: ModelConfigFile,
  mode: ModelFallbackSortMode,
): ModelConfigFile {
  const fallbacks = [...config.fallbacks];
  fallbacks.sort((left, right) => {
    if (mode === "displayName") {
      return compareNormalizedStrings(left.displayName || left.id, right.displayName || right.id)
        || compareNormalizedStrings(left.id, right.id);
    }
    if (mode === "model") {
      return compareNormalizedStrings(left.model, right.model)
        || compareNormalizedStrings(left.id, right.id);
    }
    return compareNormalizedStrings(left.id, right.id);
  });
  return { fallbacks };
}

export function upsertWebhookRule(
  config: WebhookConfig,
  rule: WebhookRule,
): WebhookConfig {
  const webhooks = [...config.webhooks];
  const index = webhooks.findIndex((item) => item.id === rule.id);
  if (index >= 0) {
    webhooks[index] = { ...webhooks[index], ...rule };
  } else {
    webhooks.push(rule);
  }
  return {
    version: 1,
    webhooks,
  };
}

export function removeWebhookRule(
  config: WebhookConfig,
  id: string,
): WebhookConfig {
  return {
    version: 1,
    webhooks: config.webhooks.filter((item) => item.id !== id),
  };
}

export function parseBooleanEnv(
  value: string | undefined,
  fallback: boolean,
): boolean {
  if (typeof value !== "string") {
    return fallback;
  }
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") {
    return true;
  }
  if (normalized === "false") {
    return false;
  }
  return fallback;
}

export function validateHttpUrl(
  value: string,
  label: string,
): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return `${label} is required`;
  }
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return `${label} must be a valid http(s) URL`;
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return `${label} must use http or https`;
  }
  return undefined;
}

export function validateWebhookId(
  value: string,
): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return "Webhook id is required";
  }
  if (!WEBHOOK_ID_PATTERN.test(trimmed)) {
    return "Webhook id may only contain letters, numbers, dot, underscore, or dash";
  }
  return undefined;
}

export function validateHeartbeatInterval(
  value: string,
): string | undefined {
  const trimmed = value.trim().toLowerCase();
  if (!trimmed) {
    return "Heartbeat interval is required";
  }
  const match = HEARTBEAT_INTERVAL_PATTERN.exec(trimmed);
  if (!match) {
    return "Heartbeat interval must be like 30m, 1h, or 45s";
  }
  if (Number.parseInt(match[1], 10) < 1) {
    return "Heartbeat interval must be greater than 0";
  }
  return undefined;
}

function parseActiveHourTime(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  if (hours < 0 || hours > 24 || minutes < 0 || minutes > 59) return null;
  if (hours === 24 && minutes === 0) return 24 * 60;
  if (hours === 24) return null;
  return hours * 60 + minutes;
}

export function validateOptionalActiveHours(
  value: string,
  label: string,
): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  const match = ACTIVE_HOURS_PATTERN.exec(trimmed);
  if (!match) {
    return `${label} must be like 08:00-23:00`;
  }
  const start = parseActiveHourTime(match[1]);
  const end = parseActiveHourTime(match[2]);
  if (start === null || end === null) {
    return `${label} must be like 08:00-23:00`;
  }
  if (start === end) {
    return `${label} must not use the same start and end time`;
  }
  return undefined;
}

export function validateOptionalPositiveInt(
  value: string,
  label: string,
): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^\d+$/.test(trimmed)) {
    return `${label} must be a positive integer`;
  }
  if (Number.parseInt(trimmed, 10) < 1) {
    return `${label} must be greater than 0`;
  }
  return undefined;
}

export function validateOptionalNonNegativeInt(
  value: string,
  label: string,
): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  if (!/^\d+$/.test(trimmed)) {
    return `${label} must be a non-negative integer`;
  }
  return undefined;
}

export function validateOptionalUrl(
  value: string,
  label: string,
): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    new URL(trimmed);
    return undefined;
  } catch {
    return `${label} must be a valid URL`;
  }
}

export function filterCronJobsForOrganize(
  jobs: CronJob[],
  mode: CronOrganizeFilterMode,
): CronJob[] {
  switch (mode) {
    case "enabled":
      return jobs.filter((job) => job.enabled);
    case "disabled":
      return jobs.filter((job) => !job.enabled);
    case "failed":
      return jobs.filter((job) => job.state.lastStatus === "error" || Boolean(job.state.lastError?.trim()));
    case "skipped":
      return jobs.filter((job) => job.state.lastStatus === "skipped");
    case "ok":
      return jobs.filter((job) => job.state.lastStatus === "ok");
    case "silent":
      return jobs.filter((job) => job.delivery.mode === "none" && (job.failureDestination?.mode ?? "none") === "none");
    case "goal_approval_scan":
      return jobs.filter((job) => job.payload.kind === "goalApprovalScan");
    case "system_event":
      return jobs.filter((job) => job.payload.kind === "systemEvent");
    case "missing_next_run":
      return jobs.filter((job) => job.enabled && typeof job.state.nextRunAtMs !== "number");
    case "all":
    default:
      return jobs;
  }
}

export function filterCronJobsByCriteria(
  jobs: CronJob[],
  criteria: CronOrganizeBatchCriteria,
): CronJob[] {
  return jobs.filter((job) => {
    if (criteria.enabled === "enabled" && !job.enabled) return false;
    if (criteria.enabled === "disabled" && job.enabled) return false;
    if (criteria.lastStatus !== "any") {
      const target = criteria.lastStatus === "error" ? "error" : criteria.lastStatus;
      if ((job.state.lastStatus ?? "") !== target) return false;
      if (criteria.lastStatus === "error" && !job.state.lastError?.trim() && job.state.lastStatus !== "error") return false;
    }
    if (criteria.payloadKind !== "any" && job.payload.kind !== criteria.payloadKind) return false;
    if (criteria.silentOnly && !(job.delivery.mode === "none" && (job.failureDestination?.mode ?? "none") === "none")) return false;
    if (criteria.missingNextRunOnly && !(job.enabled && typeof job.state.nextRunAtMs !== "number")) return false;
    if (criteria.failureDeliveryOffOnly && (job.failureDestination?.mode ?? "none") !== "none") return false;
    if (criteria.oneShotOnly && job.schedule.kind !== "at") return false;
    return true;
  });
}

const CRON_ORGANIZE_PRESETS: CronOrganizePresetDefinition[] = [
  {
    id: "disable_silent_failed",
    label: "Disable silent failed jobs",
    action: "disable_multiple",
    criteria: {
      enabled: "enabled",
      lastStatus: "error",
      payloadKind: "any",
      silentOnly: true,
      missingNextRunOnly: false,
      failureDeliveryOffOnly: false,
      oneShotOnly: false,
    },
    description: "Stop retry churn from enabled jobs that are already failing silently.",
  },
  {
    id: "disable_missing_next_run",
    label: "Disable jobs missing next run",
    action: "disable_multiple",
    criteria: {
      enabled: "enabled",
      lastStatus: "any",
      payloadKind: "any",
      silentOnly: false,
      missingNextRunOnly: true,
      failureDeliveryOffOnly: false,
      oneShotOnly: false,
    },
    description: "Freeze enabled jobs whose schedule currently cannot compute a next run.",
  },
  {
    id: "disable_goal_scans_without_failure_delivery",
    label: "Disable silent goal scans",
    action: "disable_multiple",
    criteria: {
      enabled: "enabled",
      lastStatus: "any",
      payloadKind: "goalApprovalScan",
      silentOnly: false,
      missingNextRunOnly: false,
      failureDeliveryOffOnly: true,
      oneShotOnly: false,
    },
    description: "Pause goal approval scans that still have no failure delivery configured.",
  },
  {
    id: "enable_disabled_goal_scans",
    label: "Enable disabled goal scans",
    action: "enable_multiple",
    criteria: {
      enabled: "disabled",
      lastStatus: "any",
      payloadKind: "goalApprovalScan",
      silentOnly: false,
      missingNextRunOnly: false,
      failureDeliveryOffOnly: false,
      oneShotOnly: false,
    },
    description: "Bring previously disabled goal approval scans back into rotation.",
  },
  {
    id: "remove_disabled_one_shot",
    label: "Remove disabled one-shot jobs",
    action: "remove_multiple",
    criteria: {
      enabled: "disabled",
      lastStatus: "any",
      payloadKind: "any",
      silentOnly: false,
      missingNextRunOnly: false,
      failureDeliveryOffOnly: false,
      oneShotOnly: true,
    },
    description: "Clean up disabled at/onetime jobs that no longer need to stay in the store.",
  },
];

export function listCronOrganizePresets(): CronOrganizePresetDefinition[] {
  return CRON_ORGANIZE_PRESETS.map((item) => ({
    ...item,
    criteria: { ...item.criteria },
  }));
}

export function getCronOrganizePreset(id: CronOrganizePresetId): CronOrganizePresetDefinition | undefined {
  const preset = CRON_ORGANIZE_PRESETS.find((item) => item.id === id);
  if (!preset) return undefined;
  return {
    ...preset,
    criteria: { ...preset.criteria },
  };
}
