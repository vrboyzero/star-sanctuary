import crypto from "node:crypto";

import { syncDreamToObsidian } from "./dream-obsidian-sync.js";
import { buildOpenAIChatCompletionsUrl } from "./openai-url.js";
import { buildDreamPromptBundle, parseDreamModelOutput, summarizeDreamModelOutput } from "./dream-prompt.js";
import { DreamStore, toDreamInputMeta } from "./dream-store.js";
import type {
  DreamAutoRunResult,
  DreamAutoSignalGateCode,
  DreamAutoSignalSummary,
  DreamAutoTriggerState,
  DreamChangeCursor,
  DreamModelOutput,
  DreamObsidianMirrorOptions,
  DreamRecord,
  DreamRunOptions,
  DreamRunResult,
  DreamRuntimeOptions,
  DreamRuntimeState,
} from "./dream-types.js";
import { writeDreamArtifacts } from "./dream-writer.js";

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function truncateText(value: unknown, maxLength = 240): string | undefined {
  const normalized = normalizeText(value);
  if (!normalized) return undefined;
  return normalized.length > maxLength ? `${normalized.slice(0, Math.max(0, maxLength - 3))}...` : normalized;
}

function buildDreamRunId(now: Date): string {
  const datePart = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `dream-${datePart}-${crypto.randomUUID().slice(0, 8)}`;
}

function serializeError(error: unknown): string {
  if (error instanceof Error) {
    return truncateText(error.message, 240) ?? error.name;
  }
  return truncateText(String(error), 240) ?? "Unknown dream runtime error";
}

function toIsoMs(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isFutureIso(value: string | undefined, nowMs: number): boolean {
  const parsed = toIsoMs(value);
  return parsed !== null && parsed > nowMs;
}

function toIsoFromMs(value: number | undefined): string | undefined {
  if (!Number.isFinite(value)) return undefined;
  return new Date(Number(value)).toISOString();
}

function readLatestIso(values: Array<string | number | undefined>): string | undefined {
  let latestMs = Number.NaN;
  for (const value of values) {
    const parsed = typeof value === "number"
      ? value
      : typeof value === "string"
        ? Date.parse(value)
        : Number.NaN;
    if (!Number.isFinite(parsed)) continue;
    if (!Number.isFinite(latestMs) || parsed > latestMs) {
      latestMs = parsed;
    }
  }
  return Number.isFinite(latestMs) ? new Date(latestMs).toISOString() : undefined;
}

function isFreshSinceBaseline(value: string | undefined, baselineMs: number): boolean {
  const parsed = toIsoMs(value);
  return parsed !== null && parsed > baselineMs;
}

function createZeroCursor(): DreamChangeCursor {
  return {
    digestGeneration: 0,
    sessionMemoryMessageCount: 0,
    sessionMemoryToolCursor: 0,
    taskChangeSeq: 0,
    memoryChangeSeq: 0,
  };
}

function normalizeCursor(cursor: DreamChangeCursor | undefined): DreamChangeCursor {
  return {
    digestGeneration: typeof cursor?.digestGeneration === "number" && Number.isFinite(cursor.digestGeneration)
      ? Math.max(0, Math.floor(cursor.digestGeneration))
      : 0,
    sessionMemoryMessageCount: typeof cursor?.sessionMemoryMessageCount === "number" && Number.isFinite(cursor.sessionMemoryMessageCount)
      ? Math.max(0, Math.floor(cursor.sessionMemoryMessageCount))
      : 0,
    sessionMemoryToolCursor: typeof cursor?.sessionMemoryToolCursor === "number" && Number.isFinite(cursor.sessionMemoryToolCursor)
      ? Math.max(0, Math.floor(cursor.sessionMemoryToolCursor))
      : 0,
    taskChangeSeq: typeof cursor?.taskChangeSeq === "number" && Number.isFinite(cursor.taskChangeSeq)
      ? Math.max(0, Math.floor(cursor.taskChangeSeq))
      : 0,
    memoryChangeSeq: typeof cursor?.memoryChangeSeq === "number" && Number.isFinite(cursor.memoryChangeSeq)
      ? Math.max(0, Math.floor(cursor.memoryChangeSeq))
      : 0,
  };
}

function hasMeaningfulCursor(cursor: DreamChangeCursor | undefined): boolean {
  if (!cursor) return false;
  return cursor.digestGeneration > 0
    || cursor.sessionMemoryMessageCount > 0
    || cursor.sessionMemoryToolCursor > 0
    || cursor.taskChangeSeq > 0
    || cursor.memoryChangeSeq > 0;
}

function hasCursorSignal(signal: DreamAutoSignalSummary): boolean {
  return hasMeaningfulCursor(signal.currentCursor) || hasMeaningfulCursor(signal.lastDreamCursor);
}

function buildAutoSignalSummary(
  snapshot: Parameters<typeof toDreamInputMeta>[0],
  baselineAt?: string,
  lastDreamCursor?: DreamChangeCursor,
): DreamAutoSignalSummary {
  const baselineMs = toIsoMs(baselineAt) ?? Date.parse(snapshot.windowStartedAt);
  const latestWorkAt = readLatestIso(snapshot.recentWorkItems.map((item) => item.updatedAt || item.finishedAt || item.startedAt));
  const latestWorkRecapAt = readLatestIso(snapshot.recentWorkItems.map((item) => item.workRecap?.updatedAt));
  const latestResumeContextAt = readLatestIso(snapshot.recentWorkItems.map((item) => item.resumeContext?.updatedAt));
  const latestCompletedTaskAt = readLatestIso(snapshot.recentTasks
    .filter((item) => item.status === "success")
    .map((item) => item.finishedAt || item.updatedAt || item.startedAt));
  const latestDurableMemoryAt = readLatestIso(snapshot.recentDurableMemories.map((item) => item.updatedAt));
  const sessionDigestAt = toIsoFromMs(snapshot.sessionDigest?.lastDigestAt);
  const sessionMemoryAt = toIsoFromMs(snapshot.sessionMemory?.updatedAt);
  const currentCursor = normalizeCursor(snapshot.changeCursor);
  const previousCursor = normalizeCursor(lastDreamCursor);
  const digestGenerationDelta = Math.max(0, currentCursor.digestGeneration - previousCursor.digestGeneration);
  const sessionMemoryMessageDelta = Math.max(0, currentCursor.sessionMemoryMessageCount - previousCursor.sessionMemoryMessageCount);
  const sessionMemoryToolDelta = Math.max(0, currentCursor.sessionMemoryToolCursor - previousCursor.sessionMemoryToolCursor);
  const sessionMemoryRevisionDelta = (sessionMemoryMessageDelta > 0 ? 1 : 0) + (sessionMemoryToolDelta > 0 ? 1 : 0);
  const taskChangeSeqDelta = Math.max(0, currentCursor.taskChangeSeq - previousCursor.taskChangeSeq);
  const memoryChangeSeqDelta = Math.max(0, currentCursor.memoryChangeSeq - previousCursor.memoryChangeSeq);
  const changeBudget = (digestGenerationDelta * 4)
    + (sessionMemoryRevisionDelta * 3)
    + taskChangeSeqDelta
    + memoryChangeSeqDelta;
  return {
    ...(baselineAt ? { baselineAt } : {}),
    ...(snapshot.changeCursor || lastDreamCursor ? { lastDreamCursor: previousCursor, currentCursor } : {}),
    recentWorkCount: snapshot.sourceCounts.recentWorkCount,
    recentWorkRecapCount: snapshot.sourceCounts.recentWorkRecapCount,
    completedTaskCount: snapshot.recentTasks.filter((item) => item.status === "success").length,
    recentDurableMemoryCount: snapshot.sourceCounts.recentDurableMemoryCount,
    sessionDigestAvailable: snapshot.sourceCounts.sessionDigestAvailable,
    sessionMemoryAvailable: snapshot.sourceCounts.sessionMemoryAvailable,
    digestGenerationDelta,
    sessionMemoryMessageDelta,
    sessionMemoryToolDelta,
    sessionMemoryRevisionDelta,
    taskChangeSeqDelta,
    memoryChangeSeqDelta,
    changeBudget,
    ...(latestWorkAt ? { latestWorkAt } : {}),
    ...(latestWorkRecapAt ? { latestWorkRecapAt } : {}),
    ...(latestResumeContextAt ? { latestResumeContextAt } : {}),
    ...(latestCompletedTaskAt ? { latestCompletedTaskAt } : {}),
    ...(latestDurableMemoryAt ? { latestDurableMemoryAt } : {}),
    ...(sessionDigestAt ? { sessionDigestAt } : {}),
    ...(sessionMemoryAt ? { sessionMemoryAt } : {}),
    freshWorkSinceBaseline: isFreshSinceBaseline(latestWorkAt, baselineMs),
    freshWorkRecapSinceBaseline: isFreshSinceBaseline(latestWorkRecapAt, baselineMs),
    freshResumeContextSinceBaseline: isFreshSinceBaseline(latestResumeContextAt, baselineMs),
    freshCompletedTaskSinceBaseline: isFreshSinceBaseline(latestCompletedTaskAt, baselineMs),
    freshDurableMemorySinceBaseline: isFreshSinceBaseline(latestDurableMemoryAt, baselineMs),
    freshSessionDigestSinceBaseline: isFreshSinceBaseline(sessionDigestAt, baselineMs),
    freshSessionMemorySinceBaseline: isFreshSinceBaseline(sessionMemoryAt, baselineMs),
  };
}

function resolveSignalGate(signal: DreamAutoSignalSummary): { ok: boolean; reason: string; code: DreamAutoSignalGateCode } {
  if (hasCursorSignal(signal)) {
    if ((signal.digestGenerationDelta ?? 0) >= 1) {
      return { ok: true, reason: "digest_generation_advanced", code: "digest_generation" };
    }
    if ((signal.sessionMemoryRevisionDelta ?? 0) >= 1) {
      return { ok: true, reason: "session_memory_revision_advanced", code: "session_memory_revision" };
    }
    if ((signal.changeBudget ?? 0) >= 4) {
      return { ok: true, reason: "change_budget_reached", code: "change_budget" };
    }
    return {
      ok: false,
      reason: "change budget below threshold and no digest/session-memory revision advanced",
      code: "insufficient_signal",
    };
  }
  if (signal.freshWorkRecapSinceBaseline) {
    return { ok: true, reason: "work_recap_updated_since_last_dream", code: "fresh_work_recap" };
  }
  if (signal.freshSessionDigestSinceBaseline && (signal.freshWorkSinceBaseline || signal.freshResumeContextSinceBaseline || signal.freshCompletedTaskSinceBaseline)) {
    return { ok: true, reason: "session_digest_and_work_updated_since_last_dream", code: "fresh_digest_and_work" };
  }
  if (signal.freshSessionMemorySinceBaseline && (signal.freshWorkSinceBaseline || signal.freshResumeContextSinceBaseline)) {
    return { ok: true, reason: "session_memory_and_work_updated_since_last_dream", code: "fresh_session_memory_and_work" };
  }
  if (signal.freshCompletedTaskSinceBaseline) {
    return { ok: true, reason: "completed_task_updated_since_last_dream", code: "fresh_completed_task" };
  }
  if (signal.freshResumeContextSinceBaseline) {
    return { ok: true, reason: "resume_context_updated_since_last_dream", code: "fresh_resume_context" };
  }
  if (signal.freshDurableMemorySinceBaseline) {
    return { ok: true, reason: "durable_memory_updated_since_last_dream", code: "fresh_durable_memory" };
  }
  return {
    ok: false,
    reason: "requires fresh work recap, or fresh digest/session-memory plus fresh work update, or fresh completed task/resume context/durable memory since last dream",
    code: "insufficient_signal",
  };
}

function buildAutoTriggerState(input: DreamAutoTriggerState): DreamAutoTriggerState {
  return {
    ...input,
    ...(input.signal ? { signal: { ...input.signal } } : {}),
  };
}

export class DreamRuntime {
  private readonly store: DreamStore;
  private readonly agentId: string;
  private readonly enabled: boolean;
  private readonly model: string;
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly maxTokens: number;
  private readonly temperature: number;
  private readonly obsidianMirror?: DreamObsidianMirrorOptions;
  private readonly buildInputSnapshot: DreamRuntimeOptions["buildInputSnapshot"];
  private readonly logger?: DreamRuntimeOptions["logger"];
  private readonly nowProvider: () => Date;
  private activeRun: Promise<DreamRunResult> | null = null;

  constructor(options: DreamRuntimeOptions) {
    this.agentId = normalizeText(options.agentId) ?? "default";
    this.store = new DreamStore({
      stateDir: options.stateDir,
      agentId: this.agentId,
    });
    this.enabled = options.enabled ?? true;
    this.model = normalizeText(options.model) ?? "";
    this.baseUrl = (normalizeText(options.baseUrl) ?? "").replace(/\/+$/, "");
    this.apiKey = normalizeText(options.apiKey) ?? "";
    this.maxTokens = Math.max(400, Math.floor(options.maxTokens ?? 1_000));
    this.temperature = Math.max(0, Math.min(1, Number.isFinite(options.temperature) ? Number(options.temperature) : 0.3));
    this.obsidianMirror = options.obsidianMirror
      ? {
          enabled: options.obsidianMirror.enabled === true,
          vaultPath: normalizeText(options.obsidianMirror.vaultPath),
          rootDir: normalizeText(options.obsidianMirror.rootDir),
        }
      : undefined;
    this.buildInputSnapshot = options.buildInputSnapshot;
    this.logger = options.logger;
    this.nowProvider = options.now ?? (() => new Date());
  }

  get runtimeAgentId(): string {
    return this.agentId;
  }

  get modelName(): string | undefined {
    return this.model || undefined;
  }

  getAvailability(): {
    enabled: boolean;
    available: boolean;
    model?: string;
    reason?: string;
  } {
    if (!this.enabled) {
      return {
        enabled: false,
        available: false,
        model: this.model || undefined,
        reason: "dream runtime disabled",
      };
    }
    if (!this.model || !this.baseUrl || !this.apiKey) {
      return {
        enabled: true,
        available: false,
        model: this.model || undefined,
        reason: "missing model/baseUrl/apiKey",
      };
    }
    return {
      enabled: true,
      available: true,
      model: this.model,
    };
  }

  async load(): Promise<void> {
    await this.store.load();
  }

  async getState(): Promise<DreamRuntimeState> {
    await this.store.load();
    return this.store.getState();
  }

  async listHistory(limit = 10): Promise<DreamRuntimeState["recentRuns"]> {
    const state = await this.getState();
    return state.recentRuns.slice(0, Math.max(1, Math.floor(limit)));
  }

  async getDream(input: { dreamId?: string } = {}): Promise<{ record: DreamRecord; content?: string } | null> {
    const state = await this.getState();
    const record = input.dreamId
      ? state.recentRuns.find((item) => item.id === input.dreamId)
      : state.recentRuns[0];
    if (!record) return null;
    if (!record.dreamPath) {
      return { record };
    }
    try {
      const fs = await import("node:fs/promises");
      const content = await fs.readFile(record.dreamPath, "utf-8");
      return { record, content };
    } catch {
      return { record };
    }
  }

  async run(input: DreamRunOptions = {}): Promise<DreamRunResult> {
    if (this.activeRun) {
      const state = await this.getState();
      const runningRecord = state.recentRuns.find((item) => item.id === state.lastRunId);
      return {
        record: runningRecord ?? {
          id: state.lastRunId ?? "dream-running",
          agentId: this.agentId,
          status: "running",
          triggerMode: input.triggerMode ?? "manual",
          requestedAt: this.nowProvider().toISOString(),
          conversationId: input.conversationId,
          reason: input.reason,
        },
        state,
      };
    }

    const task = this.runInternal(input).finally(() => {
      this.activeRun = null;
    });
    this.activeRun = task;
    return task;
  }

  async maybeAutoRun(input: DreamRunOptions = {}): Promise<DreamAutoRunResult> {
    const triggerMode = input.triggerMode === "cron" ? "cron" : "heartbeat";
    const availability = this.getAvailability();
    const state = await this.getState();
    const now = this.nowProvider();
    const nowMs = now.getTime();
    const attemptedAt = now.toISOString();
    if (!availability.available) {
      const nextState = await this.store.recordAutoTrigger(buildAutoTriggerState({
        triggerMode,
        attemptedAt,
        executed: false,
        skipCode: "runtime_unavailable",
        skipReason: availability.reason ?? "dream runtime unavailable",
      }));
      return {
        executed: false,
        triggerMode,
        state: nextState,
        skipCode: "runtime_unavailable",
        skipReason: availability.reason ?? "dream runtime unavailable",
      };
    }
    if (this.activeRun || state.status === "running") {
      const nextState = await this.store.recordAutoTrigger(buildAutoTriggerState({
        triggerMode,
        attemptedAt,
        executed: false,
        skipCode: "already_running",
        skipReason: "dream runtime already running",
      }));
      return {
        executed: false,
        triggerMode,
        state: nextState,
        skipCode: "already_running",
        skipReason: "dream runtime already running",
      };
    }
    if (isFutureIso(state.failureBackoffUntil, nowMs)) {
      const nextState = await this.store.recordAutoTrigger(buildAutoTriggerState({
        triggerMode,
        attemptedAt,
        executed: false,
        skipCode: "failure_backoff_active",
        skipReason: `failure backoff active until ${state.failureBackoffUntil}`,
      }));
      return {
        executed: false,
        triggerMode,
        state: nextState,
        skipCode: "failure_backoff_active",
        skipReason: `failure backoff active until ${state.failureBackoffUntil}`,
      };
    }
    if (isFutureIso(state.cooldownUntil, nowMs)) {
      const nextState = await this.store.recordAutoTrigger(buildAutoTriggerState({
        triggerMode,
        attemptedAt,
        executed: false,
        skipCode: "cooldown_active",
        skipReason: `cooldown active until ${state.cooldownUntil}`,
      }));
      return {
        executed: false,
        triggerMode,
        state: nextState,
        skipCode: "cooldown_active",
        skipReason: `cooldown active until ${state.cooldownUntil}`,
      };
    }

    const snapshot = await this.buildInputSnapshot({
      agentId: this.agentId,
      conversationId: normalizeText(input.conversationId),
      now,
    });
    await this.store.updateLastInput(snapshot);
    const nextState = await this.store.getState();
    const baselineAt = state.lastDreamAt || snapshot.windowStartedAt;
    const signal = buildAutoSignalSummary(snapshot, baselineAt, state.lastDreamCursor);
    const gate = resolveSignalGate(signal);
    if (!gate.ok) {
      this.logger?.debug?.("dream auto-run skipped", {
        agentId: this.agentId,
        triggerMode,
        reason: gate.reason,
        signal,
      });
      const skippedState = await this.store.recordAutoTrigger(buildAutoTriggerState({
        triggerMode,
        attemptedAt,
        executed: false,
        skipCode: "insufficient_signal",
        signalGateCode: gate.code,
        skipReason: gate.reason,
        signal,
      }));
      return {
        executed: false,
        triggerMode,
        state: skippedState,
        skipCode: "insufficient_signal",
        skipReason: gate.reason,
        signal,
      };
    }

    const task = this.runInternal({
      ...input,
      triggerMode,
    }, {
      now,
      snapshot,
    }).finally(() => {
      this.activeRun = null;
    });
    this.activeRun = task;
    const result = await task;
    const executedState = await this.store.recordAutoTrigger(buildAutoTriggerState({
      triggerMode,
      attemptedAt,
      executed: true,
      runId: result.record.id,
      status: result.record.status,
      signalGateCode: gate.code,
      signal,
    }));
    return {
      executed: true,
      triggerMode,
      state: executedState,
      record: result.record,
      draft: result.draft,
      markdown: result.markdown,
      indexMarkdown: result.indexMarkdown,
      signal,
    };
  }

  private async runInternal(
    input: DreamRunOptions,
    prepared?: { now: Date; snapshot: Awaited<ReturnType<DreamRuntimeOptions["buildInputSnapshot"]>> },
  ): Promise<DreamRunResult> {
    await this.store.load();
    const availability = this.getAvailability();
    const requestedAtDate = prepared?.now ?? this.nowProvider();
    const requestedAt = requestedAtDate.toISOString();
    const runId = buildDreamRunId(requestedAtDate);
    const triggerMode = input.triggerMode ?? "manual";
    const conversationId = normalizeText(input.conversationId);

    await this.store.setStatus("running");

    if (!availability.available) {
      const failedRecord: DreamRecord = {
        id: runId,
        agentId: this.agentId,
        status: "failed",
        triggerMode,
        requestedAt,
        startedAt: requestedAt,
        finishedAt: requestedAt,
        durationMs: 0,
        conversationId,
        reason: input.reason,
        error: availability.reason,
        obsidianSync: {
          enabled: false,
          stage: "skipped",
        },
      };
      await this.store.recordRun(failedRecord);
      await this.store.setStatus("idle");
      const state = await this.store.getState();
      return {
        record: failedRecord,
        state,
      };
    }

    let lastDraft: DreamModelOutput | undefined;
    try {
      const snapshot = prepared?.snapshot ?? await this.buildInputSnapshot({
        agentId: this.agentId,
        conversationId,
        now: requestedAtDate,
      });
      await this.store.updateLastInput(snapshot);

      const prompt = buildDreamPromptBundle(snapshot);
      const rawOutput = await this.callModel(prompt.system, prompt.user);
      lastDraft = parseDreamModelOutput(rawOutput);

      const startedAt = requestedAtDate.toISOString();
      const finishedAt = this.nowProvider().toISOString();
      const summary = summarizeDreamModelOutput(lastDraft);
      const previewRecord: DreamRecord = {
        id: runId,
        agentId: this.agentId,
        status: "completed",
        triggerMode,
        requestedAt,
        startedAt,
        finishedAt,
        durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(requestedAt)),
        conversationId: snapshot.conversationId ?? conversationId,
        reason: input.reason,
        summary,
        input: toDreamInputMeta(snapshot),
        obsidianSync: {
          enabled: false,
          stage: "skipped",
        },
      };
      const stateBeforeWrite = await this.store.getState();
      const dreamPath = this.store.buildDreamFilePath({
        occurredAt: finishedAt,
        dreamId: runId,
      });
      const written = await writeDreamArtifacts({
        stateDir: this.store.getStateDir(),
        agentId: this.agentId,
        dreamPath,
        record: {
          ...previewRecord,
          dreamPath,
          indexPath: this.store.getDreamIndexPath(),
        },
        draft: lastDraft,
        snapshot,
        previousRuns: stateBeforeWrite.recentRuns,
      });
      const obsidianSync = await syncDreamToObsidian({
        mirror: this.obsidianMirror,
        agentId: this.agentId,
        record: {
          ...previewRecord,
          dreamPath: written.dreamPath,
          indexPath: written.indexPath,
        },
        markdown: written.markdown,
        indexMarkdown: written.indexMarkdown,
        now: this.nowProvider,
        logger: this.logger,
      });
      const completedRecord: DreamRecord = {
        ...previewRecord,
        dreamPath: written.dreamPath,
        indexPath: written.indexPath,
        obsidianSync,
      };
      await this.store.recordRun(completedRecord, {
        lastDreamCursor: snapshot.changeCursor ?? createZeroCursor(),
      });
      await this.store.setStatus("idle");
      const state = await this.store.getState();
      this.logger?.debug?.("dream run completed", {
        agentId: this.agentId,
        runId,
        conversationId: completedRecord.conversationId,
      });
      return {
        record: completedRecord,
        state,
        draft: lastDraft,
        markdown: written.markdown,
        indexMarkdown: written.indexMarkdown,
      };
    } catch (error) {
      const finishedAt = this.nowProvider().toISOString();
      const failedRecord: DreamRecord = {
        id: runId,
        agentId: this.agentId,
        status: "failed",
        triggerMode,
        requestedAt,
        startedAt: requestedAt,
        finishedAt,
        durationMs: Math.max(0, Date.parse(finishedAt) - Date.parse(requestedAt)),
        conversationId,
        reason: input.reason,
        error: serializeError(error),
        ...(lastDraft ? { summary: summarizeDreamModelOutput(lastDraft) } : {}),
        obsidianSync: {
          enabled: false,
          stage: "skipped",
        },
      };
      await this.store.recordRun(failedRecord);
      await this.store.setStatus("idle");
      const state = await this.store.getState();
      this.logger?.error?.("dream run failed", {
        agentId: this.agentId,
        runId,
        conversationId,
        error: failedRecord.error,
      });
      return {
        record: failedRecord,
        state,
        draft: lastDraft,
      };
    }
  }

  private async callModel(system: string, user: string): Promise<string> {
    const response = await fetch(buildOpenAIChatCompletionsUrl(this.baseUrl), {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        max_tokens: this.maxTokens,
        temperature: this.temperature,
      }),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new Error(`Dream LLM call failed: ${response.status} ${truncateText(text, 200) ?? ""}`.trim());
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content;
    if (!normalizeText(content)) {
      throw new Error("Dream LLM returned empty content.");
    }
    return content!;
  }
}
