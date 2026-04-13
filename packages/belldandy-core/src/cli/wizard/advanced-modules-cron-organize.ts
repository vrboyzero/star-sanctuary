import fs from "node:fs/promises";
import path from "node:path";

import type { CronJob } from "../../cron/index.js";
import type {
  CronOrganizeAction,
  CronOrganizeBatchCriteria,
} from "./advanced-modules-shared.js";
import {
  filterCronJobsByCriteria,
  listCronOrganizePresets,
} from "./advanced-modules-shared.js";

export type PersistedCronOrganizeCustomPreset = {
  id: string;
  label: string;
  action: CronOrganizeAction;
  criteria: CronOrganizeBatchCriteria;
  createdAt: number;
  updatedAt: number;
};

export type PersistedCronOrganizeLastSelection = {
  label: string;
  jobIds: string[];
  storedAt: number;
};

export type PersistedCronOrganizeLastPreview = {
  label: string;
  action: CronOrganizeAction;
  jobIds: string[];
  storedAt: number;
};

export type PersistedCronOrganizeState = {
  version: 1;
  customPresets: PersistedCronOrganizeCustomPreset[];
  lastSelection?: PersistedCronOrganizeLastSelection;
  lastPreview?: PersistedCronOrganizeLastPreview;
};

export type CronOrganizeRecommendation = {
  id: string;
  label: string;
  action: CronOrganizeAction;
  description: string;
  matchCount: number;
  historySummary: string;
  sampleSummary: string;
};

export type CronOrganizePreview = {
  matchedCount: number;
  changeCount: number;
  unchangedCount: number;
  enabledCount: number;
  disabledCount: number;
  silentCount: number;
  oneShotCount: number;
  missingNextRunCount: number;
  recentFailureCount: number;
};

const STATE_VERSION = 1 as const;
const STATE_FILENAME = "cron-organize-state.json";

export function getCronOrganizeStatePath(stateDir: string): string {
  return path.join(stateDir, STATE_FILENAME);
}

export async function loadCronOrganizeState(stateDir: string): Promise<PersistedCronOrganizeState> {
  const filePath = getCronOrganizeStatePath(stateDir);
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<PersistedCronOrganizeState> | null;
    return normalizeCronOrganizeState(parsed);
  } catch {
    return {
      version: STATE_VERSION,
      customPresets: [],
    };
  }
}

export async function saveCronOrganizeState(
  stateDir: string,
  state: PersistedCronOrganizeState,
): Promise<void> {
  const filePath = getCronOrganizeStatePath(stateDir);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(normalizeCronOrganizeState(state), null, 2)}\n`, "utf-8");
}

function normalizeCronOrganizeState(value: Partial<PersistedCronOrganizeState> | null | undefined): PersistedCronOrganizeState {
  const customPresets = Array.isArray(value?.customPresets)
    ? value.customPresets
      .map((item) => normalizeCustomPreset(item))
      .filter((item): item is PersistedCronOrganizeCustomPreset => Boolean(item))
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

function normalizeCustomPreset(value: unknown): PersistedCronOrganizeCustomPreset | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const id = typeof item.id === "string" ? item.id.trim() : "";
  const label = typeof item.label === "string" ? item.label.trim() : "";
  const action = item.action === "enable_multiple" || item.action === "disable_multiple" || item.action === "remove_multiple"
    ? item.action
    : null;
  const criteria = item.criteria && typeof item.criteria === "object"
    ? item.criteria as CronOrganizeBatchCriteria
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

function normalizeLastSelection(value: unknown): PersistedCronOrganizeLastSelection | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  const label = typeof item.label === "string" ? item.label.trim() : "";
  const jobIds = Array.isArray(item.jobIds)
    ? item.jobIds.map((entry) => typeof entry === "string" ? entry.trim() : "").filter(Boolean)
    : [];
  const storedAt = typeof item.storedAt === "number" && Number.isFinite(item.storedAt) ? item.storedAt : Date.now();
  if (!label || jobIds.length === 0) return undefined;
  return { label, jobIds, storedAt };
}

function normalizeLastPreview(value: unknown): PersistedCronOrganizeLastPreview | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  const label = typeof item.label === "string" ? item.label.trim() : "";
  const action = item.action === "enable_multiple" || item.action === "disable_multiple" || item.action === "remove_multiple"
    ? item.action
    : undefined;
  const jobIds = Array.isArray(item.jobIds)
    ? item.jobIds.map((entry) => typeof entry === "string" ? entry.trim() : "").filter(Boolean)
    : [];
  const storedAt = typeof item.storedAt === "number" && Number.isFinite(item.storedAt) ? item.storedAt : Date.now();
  if (!label || !action || jobIds.length === 0) return undefined;
  return { label, action, jobIds, storedAt };
}

export function renameCronOrganizeCustomPreset(
  state: PersistedCronOrganizeState,
  presetId: string,
  label: string,
): PersistedCronOrganizeState {
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

export function removeCronOrganizeCustomPreset(
  state: PersistedCronOrganizeState,
  presetId: string,
): PersistedCronOrganizeState {
  return {
    ...state,
    customPresets: state.customPresets.filter((item) => item.id !== presetId),
  };
}

export function clearCronOrganizeCustomPresets(
  state: PersistedCronOrganizeState,
): PersistedCronOrganizeState {
  return {
    ...state,
    customPresets: [],
  };
}

export function buildCronOrganizeRecommendations(jobs: CronJob[]): CronOrganizeRecommendation[] {
  return listCronOrganizePresets()
    .map((preset) => {
      const matchedJobs = filterCronJobsByCriteria(jobs, preset.criteria);
      return {
        id: preset.id,
        label: preset.label,
        action: preset.action,
        description: preset.description,
        matchCount: matchedJobs.length,
        historySummary: buildRecommendationHistorySummary(matchedJobs),
        sampleSummary: summarizeLabels(matchedJobs.map((job) => job.name), 3),
        historyScore: buildRecommendationHistoryScore(matchedJobs),
      };
    })
    .filter((item) => item.matchCount > 0)
    .sort((left, right) => right.historyScore - left.historyScore || right.matchCount - left.matchCount || left.label.localeCompare(right.label))
    .map(({ historyScore: _historyScore, ...item }) => item);
}

export function buildCronOrganizePreview(input: {
  action: CronOrganizeAction;
  jobs: CronJob[];
}): CronOrganizePreview {
  const matchedCount = input.jobs.length;
  const enabledCount = input.jobs.filter((job) => job.enabled).length;
  const disabledCount = matchedCount - enabledCount;
  const silentCount = input.jobs.filter((job) => job.delivery.mode === "none" && (job.failureDestination?.mode ?? "none") === "none").length;
  const oneShotCount = input.jobs.filter((job) => job.schedule.kind === "at").length;
  const missingNextRunCount = input.jobs.filter((job) => job.enabled && typeof job.state.nextRunAtMs !== "number").length;
  const recentFailureCount = input.jobs.filter((job) => job.state.lastStatus === "error" || Boolean(job.state.lastError?.trim())).length;
  const changeCount = input.action === "enable_multiple"
    ? disabledCount
    : input.action === "disable_multiple"
      ? enabledCount
      : matchedCount;
  const unchangedCount = input.action === "remove_multiple"
    ? 0
    : matchedCount - changeCount;
  return {
    matchedCount,
    changeCount,
    unchangedCount,
    enabledCount,
    disabledCount,
    silentCount,
    oneShotCount,
    missingNextRunCount,
    recentFailureCount,
  };
}

export function buildCronOrganizePreviewLines(input: {
  action: CronOrganizeAction;
  selectionLabel: string;
  jobs: CronJob[];
}): string[] {
  const preview = buildCronOrganizePreview(input);
  const actionLabel = input.action === "enable_multiple"
    ? "enable"
    : input.action === "disable_multiple"
      ? "disable"
      : "remove";
  const impactLine = input.action === "remove_multiple"
    ? `Would remove ${preview.changeCount} job(s) from cron-jobs.json.`
    : `Would ${actionLabel} ${preview.changeCount} job(s).`;
  return [
    `Selection: ${input.selectionLabel}`,
    `Action preview: ${actionLabel}`,
    `Matched jobs: ${preview.matchedCount}`,
    impactLine,
    ...(input.action === "remove_multiple" || preview.unchangedCount === 0
      ? []
      : [`Already ${actionLabel}d: ${preview.unchangedCount}`]),
    `Current state mix: enabled ${preview.enabledCount}, disabled ${preview.disabledCount}`,
    ...(preview.recentFailureCount > 0 ? [`Recent failures in selection: ${preview.recentFailureCount}`] : []),
    ...(preview.missingNextRunCount > 0 ? [`Enabled jobs missing next run: ${preview.missingNextRunCount}`] : []),
    ...(preview.silentCount > 0 ? [`Silent jobs in selection: ${preview.silentCount}`] : []),
    ...(preview.oneShotCount > 0 ? [`One-shot jobs in selection: ${preview.oneShotCount}`] : []),
    `Matched job names: ${summarizeLabels(input.jobs.map((job) => job.name), 5)}`,
  ];
}

function summarizeLabels(values: string[], limit: number): string {
  if (values.length <= limit) {
    return values.join(", ");
  }
  return `${values.slice(0, limit).join(", ")} +${values.length - limit} more`;
}

function buildRecommendationHistorySummary(jobs: CronJob[]): string {
  if (jobs.length === 0) {
    return "no runtime history";
  }
  const failureCount = jobs.filter((job) => job.state.lastStatus === "error" || Boolean(job.state.lastError?.trim())).length;
  const skippedCount = jobs.filter((job) => job.state.lastStatus === "skipped").length;
  const neverRunCount = jobs.filter((job) => typeof job.state.lastRunAtMs !== "number").length;
  const slowCount = jobs.filter((job) => typeof job.state.lastDurationMs === "number" && job.state.lastDurationMs >= 30_000).length;
  const silentFailureCount = jobs.filter((job) => (
    (job.state.lastStatus === "error" || Boolean(job.state.lastError?.trim()))
    && (job.failureDestination?.mode ?? "none") === "none"
  )).length;
  const missingNextRunCount = jobs.filter((job) => job.enabled && typeof job.state.nextRunAtMs !== "number").length;
  const parts: string[] = [];
  if (failureCount > 0) parts.push(`failures ${failureCount}`);
  if (silentFailureCount > 0) parts.push(`silent failures ${silentFailureCount}`);
  if (skippedCount > 0) parts.push(`skips ${skippedCount}`);
  if (missingNextRunCount > 0) parts.push(`missing next run ${missingNextRunCount}`);
  if (neverRunCount > 0) parts.push(`never ran ${neverRunCount}`);
  if (slowCount > 0) parts.push(`slow runs ${slowCount}`);
  return parts.length > 0 ? parts.join(", ") : "history looks quiet";
}

function buildRecommendationHistoryScore(jobs: CronJob[]): number {
  return jobs.reduce((score, job) => {
    let nextScore = score;
    if (job.state.lastStatus === "error" || Boolean(job.state.lastError?.trim())) nextScore += 5;
    if ((job.failureDestination?.mode ?? "none") === "none"
      && (job.state.lastStatus === "error" || Boolean(job.state.lastError?.trim()))) nextScore += 3;
    if (job.state.lastStatus === "skipped") nextScore += 2;
    if (job.enabled && typeof job.state.nextRunAtMs !== "number") nextScore += 2;
    if (typeof job.state.lastRunAtMs !== "number") nextScore += 1;
    if (typeof job.state.lastDurationMs === "number" && job.state.lastDurationMs >= 30_000) nextScore += 1;
    return nextScore;
  }, 0);
}

export function storeCronOrganizeLastPreview(
  state: PersistedCronOrganizeState,
  input: {
    label: string;
    action: CronOrganizeAction;
    jobIds: string[];
  },
): PersistedCronOrganizeState {
  const label = input.label.trim();
  const jobIds = input.jobIds.map((item) => item.trim()).filter(Boolean);
  if (!label || jobIds.length === 0) {
    return state;
  }
  return {
    ...state,
    lastPreview: {
      label,
      action: input.action,
      jobIds,
      storedAt: Date.now(),
    },
  };
}

export function storeCronOrganizeLastSelection(
  state: PersistedCronOrganizeState,
  input: {
    label: string;
    jobIds: string[];
  },
): PersistedCronOrganizeState {
  const label = input.label.trim();
  const jobIds = input.jobIds.map((item) => item.trim()).filter(Boolean);
  if (!label || jobIds.length === 0) {
    return state;
  }
  return {
    ...state,
    lastSelection: {
      label,
      jobIds,
      storedAt: Date.now(),
    },
  };
}
