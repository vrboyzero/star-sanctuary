import {
  type BackgroundContinuationLedger,
  type BackgroundContinuationStatus,
} from "./background-continuation-runtime.js";
import { buildSubTaskContinuationState } from "./continuation-state.js";
import type { SubTaskChangeEvent, SubTaskRecord } from "./task-runtime.js";

function mapSubTaskLedgerStatus(record: SubTaskRecord): Exclude<BackgroundContinuationStatus, "running"> {
  switch (record.status) {
    case "done":
      return "ran";
    case "error":
    case "timeout":
      return "failed";
    default:
      return "skipped";
  }
}

function buildSharedLedgerSubTaskContinuationState(record: SubTaskRecord) {
  const base = buildSubTaskContinuationState(record);
  return {
    ...base,
    summary: record.outputPreview || record.error || record.summary || record.instruction || base.summary,
    progress: {
      current: record.status,
      recent: base.progress.recent.slice(0, 3),
    },
  };
}

function buildSubTaskLedgerSignature(record: SubTaskRecord): string {
  return JSON.stringify({
    status: record.status,
    sessionId: record.sessionId || "",
    archivedAt: record.archivedAt || 0,
    finishedAt: record.finishedAt || 0,
    stopRequestedAt: record.stopRequestedAt || 0,
    stopReason: record.stopReason || "",
    summary: record.summary || "",
    error: record.error || "",
    outputPreview: record.outputPreview || "",
    steering: record.steering.map((item) => `${item.id}:${item.status}`).join("|"),
    resume: record.resume.map((item) => `${item.id}:${item.status}`).join("|"),
    notifications: record.notifications.slice(-3).map((item) => `${item.kind}:${item.message}`).join("|"),
  });
}

export function createSubTaskBackgroundContinuationLedgerHandler(input: {
  ledger: Pick<BackgroundContinuationLedger, "startRun" | "finishRun">;
  logger?: {
    warn?: (message: string, data?: unknown) => void;
  };
}): (event: SubTaskChangeEvent) => void {
  const signatures = new Map<string, string>();

  return (event) => {
    const record = event.item;
    const nextSignature = buildSubTaskLedgerSignature(record);
    if (signatures.get(record.id) === nextSignature) {
      return;
    }
    signatures.set(record.id, nextSignature);

    const continuationState = buildSharedLedgerSubTaskContinuationState(record);
    const summary = record.outputPreview || record.error || record.summary || record.instruction;
    const reason = record.error || record.stopReason || undefined;
    const ledgerInput = {
      runId: `subtask:${record.id}`,
      kind: "subtask" as const,
      sourceId: record.id,
      label: record.summary || record.instruction || record.id,
      summary,
      reason,
      conversationId: record.parentConversationId || undefined,
      startedAt: record.createdAt,
      updatedAt: record.updatedAt,
      continuationState,
    };

    if (record.status === "pending" || record.status === "running") {
      void input.ledger.startRun(ledgerInput).catch((error) => {
        input.logger?.warn?.("Failed to sync subtask shared ledger entry.", {
          taskId: record.id,
          error,
        });
      });
      return;
    }

    void input.ledger.finishRun({
      ...ledgerInput,
      status: mapSubTaskLedgerStatus(record),
      finishedAt: record.finishedAt || record.updatedAt || Date.now(),
    }).catch((error) => {
      input.logger?.warn?.("Failed to finalize subtask shared ledger entry.", {
        taskId: record.id,
        error,
      });
    });
  };
}
