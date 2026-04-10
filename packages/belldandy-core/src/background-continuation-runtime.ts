import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import {
  buildBackgroundContinuationState,
  type ContinuationStateSnapshot,
} from "./continuation-state.js";

export type BackgroundContinuationKind = "cron" | "heartbeat" | "subtask";
export type BackgroundContinuationStatus = "running" | "ran" | "skipped" | "failed";
export type BackgroundContinuationSessionTarget = "main" | "isolated";
export type BackgroundRecoveryOutcome = "succeeded" | "failed" | "throttled" | "skipped_not_eligible";

export type BackgroundContinuationRecord = {
  runId: string;
  kind: BackgroundContinuationKind;
  sourceId: string;
  label: string;
  status: BackgroundContinuationStatus;
  startedAt: number;
  updatedAt: number;
  finishedAt?: number;
  durationMs?: number;
  summary?: string;
  reason?: string;
  conversationId?: string;
  sessionTarget?: BackgroundContinuationSessionTarget;
  nextRunAtMs?: number;
  recoveredFromRunId?: string;
  recoveryAttemptCount?: number;
  latestRecoveryAttemptAt?: number;
  latestRecoveryOutcome?: BackgroundRecoveryOutcome;
  latestRecoveryRunId?: string;
  latestRecoveryReason?: string;
  latestRecoveryFingerprint?: string;
  continuationState?: ContinuationStateSnapshot;
};

type PersistedBackgroundContinuationState = {
  version: 1;
  items: BackgroundContinuationRecord[];
};

export type BackgroundContinuationRuntimeEntry = BackgroundContinuationRecord & {
  continuationState: ContinuationStateSnapshot;
};

export type BackgroundContinuationRuntimeDoctorReport = {
  totals: {
    totalRuns: number;
    runningRuns: number;
    failedRuns: number;
    skippedRuns: number;
    conversationLinkedRuns: number;
    recoverableFailedRuns: number;
    recoveryAttemptedRuns: number;
    recoverySucceededRuns: number;
  };
  kindCounts: {
    cron: number;
    heartbeat: number;
    subtask: number;
  };
  sessionTargetCounts: {
    main: number;
    isolated: number;
  };
  recentEntries: BackgroundContinuationRuntimeEntry[];
  headline: string;
};

const STATE_FILENAME = "background-continuation-runtime.json";
const STATE_VERSION = 1 as const;
const MAX_ITEMS = 40;

function cloneRecord(record: BackgroundContinuationRecord): BackgroundContinuationRecord {
  return {
    ...record,
    continuationState: record.continuationState
      ? {
        ...record.continuationState,
        checkpoints: {
          ...record.continuationState.checkpoints,
          labels: [...record.continuationState.checkpoints.labels],
        },
        progress: {
          ...record.continuationState.progress,
          recent: [...record.continuationState.progress.recent],
        },
      }
      : undefined,
  };
}

function normalizeRecoveryFields(
  input: Partial<BackgroundContinuationRecord>,
  existing?: BackgroundContinuationRecord,
): Pick<
  BackgroundContinuationRecord,
  | "recoveredFromRunId"
  | "recoveryAttemptCount"
  | "latestRecoveryAttemptAt"
  | "latestRecoveryOutcome"
  | "latestRecoveryRunId"
  | "latestRecoveryReason"
  | "latestRecoveryFingerprint"
> {
  return {
    ...(input.recoveredFromRunId || existing?.recoveredFromRunId
      ? { recoveredFromRunId: String(input.recoveredFromRunId || existing?.recoveredFromRunId).trim() }
      : {}),
    ...(typeof input.recoveryAttemptCount === "number" && Number.isFinite(input.recoveryAttemptCount)
      ? { recoveryAttemptCount: input.recoveryAttemptCount }
      : typeof existing?.recoveryAttemptCount === "number"
        ? { recoveryAttemptCount: existing.recoveryAttemptCount }
        : {}),
    ...(typeof input.latestRecoveryAttemptAt === "number" && Number.isFinite(input.latestRecoveryAttemptAt)
      ? { latestRecoveryAttemptAt: input.latestRecoveryAttemptAt }
      : typeof existing?.latestRecoveryAttemptAt === "number"
        ? { latestRecoveryAttemptAt: existing.latestRecoveryAttemptAt }
        : {}),
    ...(input.latestRecoveryOutcome || existing?.latestRecoveryOutcome
      ? { latestRecoveryOutcome: (input.latestRecoveryOutcome || existing?.latestRecoveryOutcome) as BackgroundRecoveryOutcome }
      : {}),
    ...(input.latestRecoveryRunId || existing?.latestRecoveryRunId
      ? { latestRecoveryRunId: String(input.latestRecoveryRunId || existing?.latestRecoveryRunId).trim() }
      : {}),
    ...(trimText(input.latestRecoveryReason ?? existing?.latestRecoveryReason)
      ? { latestRecoveryReason: trimText(input.latestRecoveryReason ?? existing?.latestRecoveryReason) }
      : {}),
    ...(trimText(input.latestRecoveryFingerprint ?? existing?.latestRecoveryFingerprint)
      ? { latestRecoveryFingerprint: trimText(input.latestRecoveryFingerprint ?? existing?.latestRecoveryFingerprint) }
      : {}),
  };
}

function trimText(value: string | undefined, maxLength = 240): string | undefined {
  const normalized = String(value ?? "").trim().replace(/\s+/g, " ");
  if (!normalized) return undefined;
  return normalized.length > maxLength ? `${normalized.slice(0, maxLength - 3)}...` : normalized;
}

async function atomicWriteJson(filePath: string, content: PersistedBackgroundContinuationState): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const tmpPath = `${filePath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tmpPath, JSON.stringify(content, null, 2), "utf-8");
  await fs.rename(tmpPath, filePath);
}

function toRuntimeEntry(record: BackgroundContinuationRecord): BackgroundContinuationRuntimeEntry {
  const continuationState = record.continuationState
    ? cloneRecord(record).continuationState as ContinuationStateSnapshot
    : buildBackgroundContinuationState({
      scope: record.kind === "subtask" ? "heartbeat" : record.kind,
      targetId: record.sourceId,
      targetLabel: record.label,
      status: record.status,
      summary: record.summary,
      reason: record.reason,
      conversationId: record.conversationId,
      sessionTarget: record.sessionTarget,
      nextRunAtMs: record.nextRunAtMs,
      startedAt: record.startedAt,
      finishedAt: record.finishedAt,
    });
  return {
    ...record,
    continuationState,
  };
}

export class BackgroundContinuationLedger {
  private readonly filePath: string;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(stateDir: string) {
    this.filePath = path.join(stateDir, STATE_FILENAME);
  }

  async startRun(input: {
    runId?: string;
    kind: BackgroundContinuationKind;
    sourceId: string;
    label: string;
    conversationId?: string;
    sessionTarget?: BackgroundContinuationSessionTarget;
    summary?: string;
    startedAt?: number;
    updatedAt?: number;
    continuationState?: ContinuationStateSnapshot;
  }): Promise<BackgroundContinuationRecord> {
    const startedAt = Number.isFinite(input.startedAt) ? Number(input.startedAt) : Date.now();
    const updatedAt = Number.isFinite(input.updatedAt)
      ? Math.max(startedAt, Number(input.updatedAt))
      : startedAt;
    const record: BackgroundContinuationRecord = {
      runId: String(input.runId || crypto.randomUUID()),
      kind: input.kind,
      sourceId: String(input.sourceId || input.kind).trim() || input.kind,
      label: String(input.label || input.sourceId || input.kind).trim() || input.kind,
      status: "running",
      startedAt,
      updatedAt,
      ...(input.conversationId ? { conversationId: String(input.conversationId).trim() } : {}),
      ...(input.sessionTarget ? { sessionTarget: input.sessionTarget } : {}),
      ...(trimText(input.summary) ? { summary: trimText(input.summary) } : {}),
      ...(input.continuationState ? { continuationState: input.continuationState } : {}),
    };
    let output!: BackgroundContinuationRecord;
    await this.mutate((state) => {
      const existing = state.items.find((item) => item.runId === record.runId);
      const merged = {
        ...record,
        ...normalizeRecoveryFields(record, existing),
      };
      upsertRecord(state.items, merged);
      state.items = sortAndTrimRecords(state.items);
      output = cloneRecord(merged);
      return merged;
    });
    return output;
  }

  async finishRun(input: {
    runId: string;
    kind: BackgroundContinuationKind;
    sourceId: string;
    label: string;
    status: Exclude<BackgroundContinuationStatus, "running">;
    summary?: string;
    reason?: string;
    conversationId?: string;
    sessionTarget?: BackgroundContinuationSessionTarget;
    startedAt?: number;
    finishedAt?: number;
    nextRunAtMs?: number;
    continuationState?: ContinuationStateSnapshot;
  }): Promise<BackgroundContinuationRecord> {
    const finishedAt = Number.isFinite(input.finishedAt) ? Number(input.finishedAt) : Date.now();
    let output!: BackgroundContinuationRecord;
    await this.mutate((state) => {
      const existing = state.items.find((item) => item.runId === input.runId);
      const startedAt = Number.isFinite(input.startedAt)
        ? Number(input.startedAt)
        : existing?.startedAt ?? finishedAt;
      const record: BackgroundContinuationRecord = {
        runId: input.runId,
        kind: input.kind,
        sourceId: String(input.sourceId || existing?.sourceId || input.kind).trim() || input.kind,
        label: String(input.label || existing?.label || input.sourceId || input.kind).trim() || input.kind,
        status: input.status,
        startedAt,
        updatedAt: finishedAt,
        finishedAt,
        durationMs: Math.max(0, finishedAt - startedAt),
        ...(trimText(input.summary ?? existing?.summary) ? { summary: trimText(input.summary ?? existing?.summary) } : {}),
        ...(trimText(input.reason ?? existing?.reason) ? { reason: trimText(input.reason ?? existing?.reason) } : {}),
        ...(input.conversationId || existing?.conversationId ? { conversationId: String(input.conversationId || existing?.conversationId).trim() } : {}),
        ...(input.sessionTarget || existing?.sessionTarget ? { sessionTarget: (input.sessionTarget || existing?.sessionTarget) } : {}),
        ...(typeof input.nextRunAtMs === "number" && Number.isFinite(input.nextRunAtMs)
          ? { nextRunAtMs: input.nextRunAtMs }
          : typeof existing?.nextRunAtMs === "number"
            ? { nextRunAtMs: existing.nextRunAtMs }
            : {}),
        ...(input.continuationState || existing?.continuationState
          ? { continuationState: input.continuationState || existing?.continuationState }
          : {}),
        ...normalizeRecoveryFields(input, existing),
      };
      upsertRecord(state.items, record);
      state.items = sortAndTrimRecords(state.items);
      output = cloneRecord(record);
    });
    return output;
  }

  async recordRecovery(input: {
    runId: string;
    attemptedAt?: number;
    outcome: BackgroundRecoveryOutcome;
    reason?: string;
    recoveryRunId?: string;
    recoveredFromRunId?: string;
    fingerprint?: string;
    incrementAttemptCount?: boolean;
  }): Promise<BackgroundContinuationRecord | null> {
    let output: BackgroundContinuationRecord | null = null;
    const attemptedAt = Number.isFinite(input.attemptedAt) ? Number(input.attemptedAt) : Date.now();
    await this.mutate((state) => {
      const existing = state.items.find((item) => item.runId === input.runId);
      if (!existing) return null;
      const record: BackgroundContinuationRecord = {
        ...existing,
        updatedAt: Math.max(existing.updatedAt || 0, attemptedAt),
        ...normalizeRecoveryFields({
          recoveredFromRunId: input.recoveredFromRunId,
          recoveryAttemptCount: (existing.recoveryAttemptCount ?? 0) + (input.incrementAttemptCount === false ? 0 : 1),
          latestRecoveryAttemptAt: attemptedAt,
          latestRecoveryOutcome: input.outcome,
          latestRecoveryRunId: input.recoveryRunId,
          latestRecoveryReason: input.reason,
          latestRecoveryFingerprint: input.fingerprint,
        }, existing),
      };
      upsertRecord(state.items, record);
      state.items = sortAndTrimRecords(state.items);
      output = cloneRecord(record);
      return output;
    });
    return output;
  }

  async listRecent(limit = 8): Promise<BackgroundContinuationRecord[]> {
    const state = await this.readState();
    return sortAndTrimRecords(state.items)
      .slice(0, Math.max(1, limit))
      .map((item) => cloneRecord(item));
  }

  private async readState(): Promise<PersistedBackgroundContinuationState> {
    await this.writeQueue.catch(() => undefined);
    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as PersistedBackgroundContinuationState;
      if (parsed?.version === STATE_VERSION && Array.isArray(parsed.items)) {
        return {
          version: STATE_VERSION,
          items: parsed.items
            .filter((item): item is BackgroundContinuationRecord => Boolean(item && typeof item === "object"))
            .map((item) => ({
              ...item,
              summary: trimText(item.summary),
              reason: trimText(item.reason),
              ...normalizeRecoveryFields(item),
              continuationState: normalizeContinuationStateSnapshot(item.continuationState),
            })),
        };
      }
    } catch {
      // ignore missing or invalid state
    }
    return { version: STATE_VERSION, items: [] };
  }

  private async mutate<T>(fn: (state: PersistedBackgroundContinuationState) => T | Promise<T>): Promise<T> {
    const next = this.writeQueue.then(async () => {
      const state = await this.readStateUnsafe();
      const result = await fn(state);
      await atomicWriteJson(this.filePath, state);
      return result;
    });
    this.writeQueue = next.then(() => undefined, () => undefined);
    return next;
  }

  private async readStateUnsafe(): Promise<PersistedBackgroundContinuationState> {
    try {
      const raw = await fs.readFile(this.filePath, "utf-8");
      const parsed = JSON.parse(raw) as PersistedBackgroundContinuationState;
      if (parsed?.version === STATE_VERSION && Array.isArray(parsed.items)) {
        return {
          version: STATE_VERSION,
          items: parsed.items
            .filter((item): item is BackgroundContinuationRecord => Boolean(item && typeof item === "object"))
            .map((item) => ({
              ...item,
              summary: trimText(item.summary),
              reason: trimText(item.reason),
              ...normalizeRecoveryFields(item),
              continuationState: normalizeContinuationStateSnapshot(item.continuationState),
            })),
        };
      }
    } catch {
      // ignore missing or invalid state
    }
    return { version: STATE_VERSION, items: [] };
  }
}

function normalizeContinuationStateSnapshot(value: unknown): ContinuationStateSnapshot | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Record<string, unknown>;
  const progress = item.progress && typeof item.progress === "object"
    ? item.progress as Record<string, unknown>
    : {};
  const checkpoints = item.checkpoints && typeof item.checkpoints === "object"
    ? item.checkpoints as Record<string, unknown>
    : {};
  const scope = typeof item.scope === "string" ? item.scope.trim() : "";
  const targetId = typeof item.targetId === "string" ? item.targetId.trim() : "";
  const resumeMode = typeof item.resumeMode === "string" ? item.resumeMode.trim() : "";
  const summary = typeof item.summary === "string" ? item.summary.trim() : "";
  const nextAction = typeof item.nextAction === "string" ? item.nextAction.trim() : "";
  if (
    (scope !== "subtask" && scope !== "goal" && scope !== "conversation" && scope !== "resident" && scope !== "background")
    || !targetId
    || !resumeMode
    || !summary
    || !nextAction
  ) {
    return undefined;
  }
  return {
    version: 1,
    scope,
    targetId,
    recommendedTargetId: typeof item.recommendedTargetId === "string" ? item.recommendedTargetId.trim() || undefined : undefined,
    targetType: item.targetType === "conversation" || item.targetType === "session" || item.targetType === "node" || item.targetType === "goal"
      ? item.targetType
      : undefined,
    resumeMode,
    summary,
    nextAction,
    checkpoints: {
      openCount: Number.isFinite(Number(checkpoints.openCount)) ? Number(checkpoints.openCount) : 0,
      blockerCount: Number.isFinite(Number(checkpoints.blockerCount)) ? Number(checkpoints.blockerCount) : 0,
      labels: Array.isArray(checkpoints.labels)
        ? checkpoints.labels.map((label) => typeof label === "string" ? label.trim() : "").filter(Boolean)
        : [],
    },
    progress: {
      current: typeof progress.current === "string" ? progress.current.trim() || undefined : undefined,
      recent: Array.isArray(progress.recent)
        ? progress.recent.map((label) => typeof label === "string" ? label.trim() : "").filter(Boolean)
        : [],
    },
  };
}

function upsertRecord(items: BackgroundContinuationRecord[], record: BackgroundContinuationRecord): void {
  const index = items.findIndex((item) => item.runId === record.runId);
  if (index >= 0) {
    items[index] = cloneRecord(record);
    return;
  }
  items.push(cloneRecord(record));
}

function sortAndTrimRecords(items: BackgroundContinuationRecord[]): BackgroundContinuationRecord[] {
  return [...items]
    .sort((left, right) => {
      const rightTs = right.finishedAt ?? right.updatedAt ?? right.startedAt ?? 0;
      const leftTs = left.finishedAt ?? left.updatedAt ?? left.startedAt ?? 0;
      return rightTs - leftTs;
    })
    .slice(0, MAX_ITEMS);
}

export async function buildBackgroundContinuationRuntimeDoctorReport(input: {
  ledger: Pick<BackgroundContinuationLedger, "listRecent">;
  recentLimit?: number;
}): Promise<BackgroundContinuationRuntimeDoctorReport> {
  const records = await input.ledger.listRecent(MAX_ITEMS);
  const recentRecords = records.slice(0, Math.max(1, input.recentLimit ?? 8));
  const totals = {
    totalRuns: records.length,
    runningRuns: records.filter((item) => item.status === "running").length,
    failedRuns: records.filter((item) => item.status === "failed").length,
    skippedRuns: records.filter((item) => item.status === "skipped").length,
    conversationLinkedRuns: records.filter((item) => Boolean(item.conversationId || item.continuationState?.recommendedTargetId)).length,
    recoverableFailedRuns: records.filter((item) => item.status === "failed" && item.latestRecoveryOutcome !== "succeeded").length,
    recoveryAttemptedRuns: records.filter((item) => typeof item.latestRecoveryAttemptAt === "number").length,
    recoverySucceededRuns: records.filter((item) => item.latestRecoveryOutcome === "succeeded").length,
  };
  const kindCounts = records.reduce(
    (acc, item) => {
      acc[item.kind] += 1;
      return acc;
    },
    { cron: 0, heartbeat: 0, subtask: 0 },
  );
  const sessionTargetCounts = records.reduce(
    (acc, item) => {
      if (item.sessionTarget) {
        acc[item.sessionTarget] += 1;
      }
      return acc;
    },
    { main: 0, isolated: 0 },
  );
  const headline = [
    `runs=${totals.totalRuns}`,
    `running=${totals.runningRuns}`,
    `failed=${totals.failedRuns}`,
    `skipped=${totals.skippedRuns}`,
    `recoverable=${totals.recoverableFailedRuns}`,
    `recovery=${totals.recoverySucceededRuns}/${totals.recoveryAttemptedRuns}`,
    `cron=${kindCounts.cron}`,
    `heartbeat=${kindCounts.heartbeat}`,
    `subtask=${kindCounts.subtask}`,
    `linked=${totals.conversationLinkedRuns}`,
    `main=${sessionTargetCounts.main}`,
    `isolated=${sessionTargetCounts.isolated}`,
  ].join("; ");

  return {
    totals,
    kindCounts,
    sessionTargetCounts,
    recentEntries: recentRecords.map((item) => toRuntimeEntry(item)),
    headline,
  };
}
