import type {
  BackgroundContinuationKind,
  BackgroundContinuationRecord,
  BackgroundRecoveryOutcome,
} from "./background-continuation-runtime.js";

const DEFAULT_RECOVERY_THROTTLE_MS = 5 * 60 * 1000;
const SUBTASK_RECOVERY_MESSAGE = "Recover this failed background subtask from the latest recorded failure state. Keep the same task scope and continue with the next best action.";

export type BackgroundRecoveryAttemptResult = {
  outcome: BackgroundRecoveryOutcome;
  recoveryRunId?: string;
  reason?: string;
  fingerprint: string;
};

export type BackgroundRecoveryRuntimeOptions = {
  ledger: Pick<
    {
      listRecent: (limit?: number) => Promise<BackgroundContinuationRecord[]>;
      recordRecovery: (input: {
        runId: string;
        attemptedAt?: number;
        outcome: BackgroundRecoveryOutcome;
        reason?: string;
        recoveryRunId?: string;
        recoveredFromRunId?: string;
        fingerprint?: string;
        incrementAttemptCount?: boolean;
      }) => Promise<BackgroundContinuationRecord | null>;
    },
    "listRecent" | "recordRecovery"
  >;
  recoverHeartbeat?: () => Promise<{
    status: "ran" | "skipped" | "failed";
    runId?: string;
    reason?: string;
    message?: string;
  }>;
  recoverCron?: (jobId: string) => Promise<{
    status: "ok" | "error" | "skipped";
    runId?: string;
    reason?: string;
    summary?: string;
  } | null>;
  recoverSubtask?: (taskId: string, message: string) => Promise<{
    accepted: boolean;
    runId?: string;
    reason?: string;
  } | null>;
  throttleMs?: number;
};

export function buildBackgroundRecoveryFingerprint(record: Pick<
  BackgroundContinuationRecord,
  "kind" | "sourceId" | "status" | "reason" | "summary" | "continuationState"
>): string {
  return JSON.stringify({
    kind: String(record.kind || "").trim(),
    sourceId: String(record.sourceId || "").trim(),
    status: String(record.status || "").trim(),
    reason: String(record.reason || "").trim(),
    summary: String(record.summary || record.continuationState?.summary || "").trim(),
  });
}

function buildRecoveryScopeKey(record: Pick<BackgroundContinuationRecord, "kind" | "sourceId">): string {
  return `${String(record.kind || "").trim()}:${String(record.sourceId || "").trim()}`;
}

function findRecentRecoveryAttempt(
  records: BackgroundContinuationRecord[],
  record: BackgroundContinuationRecord,
  fingerprint: string,
  throttleMs: number,
): BackgroundContinuationRecord | null {
  const now = Date.now();
  for (const item of records) {
    if (item.kind !== record.kind || item.sourceId !== record.sourceId) continue;
    if (String(item.latestRecoveryFingerprint || "") !== fingerprint) continue;
    if (typeof item.latestRecoveryAttemptAt !== "number") continue;
    if (now - item.latestRecoveryAttemptAt > throttleMs) continue;
    return item;
  }
  return null;
}

function buildIneligibleReason(kind: BackgroundContinuationKind): string {
  switch (kind) {
    case "heartbeat":
      return "Heartbeat recovery executor is not available.";
    case "cron":
      return "Cron recovery executor is not available.";
    case "subtask":
      return "Subtask recovery executor is not available.";
    default:
      return "Background recovery executor is not available.";
  }
}

export class BackgroundRecoveryRuntime {
  private readonly throttleMs: number;
  private readonly inFlightRecoveries = new Map<string, Promise<BackgroundRecoveryAttemptResult>>();

  constructor(private readonly options: BackgroundRecoveryRuntimeOptions) {
    this.throttleMs = Number.isFinite(options.throttleMs)
      ? Math.max(1_000, Number(options.throttleMs))
      : DEFAULT_RECOVERY_THROTTLE_MS;
  }

  async maybeRecover(record: BackgroundContinuationRecord): Promise<BackgroundRecoveryAttemptResult> {
    const fingerprint = buildBackgroundRecoveryFingerprint(record);
    const scopeKey = buildRecoveryScopeKey(record);
    const inFlight = this.inFlightRecoveries.get(scopeKey);
    if (inFlight) {
      return inFlight;
    }
    const attempt = this.maybeRecoverInternal(record, fingerprint)
      .finally(() => {
        if (this.inFlightRecoveries.get(scopeKey) === attempt) {
          this.inFlightRecoveries.delete(scopeKey);
        }
      });
    this.inFlightRecoveries.set(scopeKey, attempt);
    return attempt;
  }

  private async maybeRecoverInternal(
    record: BackgroundContinuationRecord,
    fingerprint: string,
  ): Promise<BackgroundRecoveryAttemptResult> {
    if (record.status !== "failed") {
      return this.recordSkipped(record, fingerprint, "Background recovery only handles failed runs.");
    }

    const recent = await this.options.ledger.listRecent(24);
    const recentAttempt = findRecentRecoveryAttempt(recent, record, fingerprint, this.throttleMs);
    if (recentAttempt && recentAttempt.runId !== record.runId) {
      return this.recordSkipped(
        record,
        fingerprint,
        `Recovery throttled because ${record.kind}:${record.sourceId} already retried recently.`,
        "throttled",
      );
    }
    if (
      recentAttempt
      && recentAttempt.runId === record.runId
      && typeof recentAttempt.latestRecoveryAttemptAt === "number"
    ) {
      return this.recordSkipped(
        record,
        fingerprint,
        `Recovery throttled because run ${record.runId} already retried recently.`,
        "throttled",
      );
    }

    switch (record.kind) {
      case "heartbeat":
        return this.recoverHeartbeat(record, fingerprint);
      case "cron":
        return this.recoverCron(record, fingerprint);
      case "subtask":
        return this.recoverSubtask(record, fingerprint);
      default:
        return this.recordSkipped(record, fingerprint, buildIneligibleReason(record.kind));
    }
  }

  private async recoverHeartbeat(
    record: BackgroundContinuationRecord,
    fingerprint: string,
  ): Promise<BackgroundRecoveryAttemptResult> {
    if (!this.options.recoverHeartbeat) {
      return this.recordSkipped(record, fingerprint, buildIneligibleReason("heartbeat"));
    }
    try {
      const result = await this.options.recoverHeartbeat();
      return this.finalizeAttempt(record, fingerprint, {
        outcome: result.status === "ran" ? "succeeded" : result.status === "failed" ? "failed" : "skipped_not_eligible",
        recoveryRunId: result.runId,
        reason: result.reason || result.message,
      });
    } catch (error) {
      return this.finalizeAttempt(record, fingerprint, {
        outcome: "failed",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async recoverCron(
    record: BackgroundContinuationRecord,
    fingerprint: string,
  ): Promise<BackgroundRecoveryAttemptResult> {
    if (!this.options.recoverCron) {
      return this.recordSkipped(record, fingerprint, buildIneligibleReason("cron"));
    }
    try {
      const result = await this.options.recoverCron(record.sourceId);
      if (!result) {
        return this.recordSkipped(record, fingerprint, "Cron recovery returned no executable job.");
      }
      return this.finalizeAttempt(record, fingerprint, {
        outcome: result.status === "ok" ? "succeeded" : result.status === "error" ? "failed" : "skipped_not_eligible",
        recoveryRunId: result.runId,
        reason: result.reason || result.summary,
      });
    } catch (error) {
      return this.finalizeAttempt(record, fingerprint, {
        outcome: "failed",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async recoverSubtask(
    record: BackgroundContinuationRecord,
    fingerprint: string,
  ): Promise<BackgroundRecoveryAttemptResult> {
    if (!this.options.recoverSubtask) {
      return this.recordSkipped(record, fingerprint, buildIneligibleReason("subtask"));
    }
    try {
      const result = await this.options.recoverSubtask(record.sourceId, SUBTASK_RECOVERY_MESSAGE);
      if (!result?.accepted) {
        return this.recordSkipped(record, fingerprint, result?.reason || "Subtask recovery was not accepted.");
      }
      return this.finalizeAttempt(record, fingerprint, {
        outcome: "succeeded",
        recoveryRunId: result.runId,
        reason: result.reason || "Subtask recovery accepted.",
      });
    } catch (error) {
      return this.finalizeAttempt(record, fingerprint, {
        outcome: "failed",
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async recordSkipped(
    record: BackgroundContinuationRecord,
    fingerprint: string,
    reason: string,
    outcome: BackgroundRecoveryOutcome = "skipped_not_eligible",
  ): Promise<BackgroundRecoveryAttemptResult> {
    await this.options.ledger.recordRecovery({
      runId: record.runId,
      outcome,
      reason,
      fingerprint,
      incrementAttemptCount: false,
    });
    return {
      outcome,
      reason,
      fingerprint,
    };
  }

  private async finalizeAttempt(
    record: BackgroundContinuationRecord,
    fingerprint: string,
    result: {
      outcome: BackgroundRecoveryOutcome;
      recoveryRunId?: string;
      reason?: string;
    },
  ): Promise<BackgroundRecoveryAttemptResult> {
    await this.options.ledger.recordRecovery({
      runId: record.runId,
      outcome: result.outcome,
      reason: result.reason,
      recoveryRunId: result.recoveryRunId,
      fingerprint,
    });
    if (result.recoveryRunId && result.recoveryRunId !== record.runId) {
      await this.options.ledger.recordRecovery({
        runId: result.recoveryRunId,
        outcome: result.outcome,
        reason: result.reason ? `Recovered from ${record.runId}: ${result.reason}` : `Recovered from ${record.runId}.`,
        recoveredFromRunId: record.runId,
        fingerprint,
        incrementAttemptCount: false,
      });
    }
    return {
      outcome: result.outcome,
      recoveryRunId: result.recoveryRunId,
      reason: result.reason,
      fingerprint,
    };
  }
}
