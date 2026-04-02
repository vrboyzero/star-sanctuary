import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

export type MemoryUsageConsumer =
  | "session_digest_refresh"
  | "durable_extraction_request"
  | "durable_extraction_run";

export type MemoryUsageOutcome =
  | "completed"
  | "skipped"
  | "blocked"
  | "queued"
  | "started"
  | "failed";

export type MemoryUsageEvent = {
  consumer: MemoryUsageConsumer;
  outcome: MemoryUsageOutcome;
  timestamp: number;
  conversationId?: string;
  source?: string;
  quantity?: number;
  metadata?: Record<string, unknown>;
};

type MemoryUsageAccountingState = {
  version: 1;
  events: MemoryUsageEvent[];
};

type MemoryUsageEventFilter = {
  consumer: MemoryUsageConsumer;
  outcomes?: MemoryUsageOutcome[];
  since?: number;
};

type MemoryBudgetLimit = {
  maxRuns: number;
  windowMs: number;
};

export type MemoryBudgetDecision = {
  allowed: boolean;
  reasonCode?: string;
  reasonMessage?: string;
  observedRuns?: number;
  maxRuns?: number;
  windowMs?: number;
  retryAfterMs?: number;
};

export type RateLimitStatus = "unlimited" | "ok" | "limited";

export type RateLimitState = {
  status: RateLimitStatus;
  configured: boolean;
  observedRuns: number;
  maxRuns?: number;
  windowMs?: number;
  retryAfterMs?: number;
  reasonCode?: string;
  reasonMessage?: string;
};

export type MemoryRuntimeUsageAccountingOptions = {
  stateDir: string;
  retentionMs?: number;
  logger?: {
    warn?: (message: string, data?: unknown) => void;
  };
};

export type MemoryRuntimeBudgetGuardOptions = {
  accounting: MemoryRuntimeUsageAccounting;
  sessionDigestRefreshLimit?: MemoryBudgetLimit;
  durableExtractionRunLimit?: MemoryBudgetLimit;
};

const STATE_VERSION = 1 as const;
const DEFAULT_RETENTION_MS = 7 * 24 * 60 * 60 * 1_000;

function normalizePositiveInteger(value: unknown): number | undefined {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return undefined;
  }
  return parsed;
}

async function atomicWriteText(targetPath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempPath, content, "utf-8");
  await fs.rename(tempPath, targetPath);
}

export class SlidingWindowRateLimiter {
  private readonly maxRuns: number;
  private readonly windowMs: number;
  private readonly timestamps: number[] = [];

  constructor(maxRuns?: number, windowMs = 60 * 60 * 1_000) {
    this.maxRuns = typeof maxRuns === "number" && Number.isInteger(maxRuns) && maxRuns > 0 ? maxRuns : 0;
    this.windowMs = Number.isInteger(windowMs) && windowMs > 0 ? windowMs : 60 * 60 * 1_000;
  }

  note(timestamp = Date.now()): void {
    if (this.maxRuns <= 0) {
      return;
    }
    this.prune(timestamp);
    this.timestamps.push(timestamp);
  }

  evaluate(reasonCode: string, reasonMessage: string, now = Date.now()): MemoryBudgetDecision {
    if (this.maxRuns <= 0) {
      return { allowed: true };
    }
    this.prune(now);
    if (this.timestamps.length < this.maxRuns) {
      return {
        allowed: true,
        observedRuns: this.timestamps.length,
        maxRuns: this.maxRuns,
        windowMs: this.windowMs,
      };
    }
    const retryAfterMs = Math.max(1, this.timestamps[0] + this.windowMs - now);
    return {
      allowed: false,
      reasonCode,
      reasonMessage: `${reasonMessage} ${this.timestamps.length}/${this.maxRuns} runs in the last ${this.windowMs}ms.`,
      observedRuns: this.timestamps.length,
      maxRuns: this.maxRuns,
      windowMs: this.windowMs,
      retryAfterMs,
    };
  }

  getState(reasonCode: string, reasonMessage: string, now = Date.now()): RateLimitState {
    const decision = this.evaluate(reasonCode, reasonMessage, now);
    return toRateLimitState(decision, this.maxRuns > 0);
  }

  private prune(now: number): void {
    const minTimestamp = now - this.windowMs;
    while (this.timestamps.length > 0 && this.timestamps[0] < minTimestamp) {
      this.timestamps.shift();
    }
  }
}

export class MemoryRuntimeUsageAccounting {
  private readonly statePath: string;
  private readonly retentionMs: number;
  private readonly logger?: MemoryRuntimeUsageAccountingOptions["logger"];
  private readonly events: MemoryUsageEvent[] = [];
  private writeChain = Promise.resolve();
  private loadPromise: Promise<void> | null = null;

  constructor(options: MemoryRuntimeUsageAccountingOptions) {
    this.statePath = path.join(options.stateDir, "memory-runtime", "usage-accounting.json");
    this.retentionMs = Math.max(60_000, options.retentionMs ?? DEFAULT_RETENTION_MS);
    this.logger = options.logger;
  }

  async load(): Promise<void> {
    if (this.loadPromise) {
      return this.loadPromise;
    }
    this.loadPromise = (async () => {
      this.events.length = 0;
      try {
        const raw = await fs.readFile(this.statePath, "utf-8");
        const parsed = JSON.parse(raw) as Partial<MemoryUsageAccountingState>;
        for (const item of Array.isArray(parsed.events) ? parsed.events : []) {
          const event = this.normalizeEvent(item);
          if (event) {
            this.events.push(event);
          }
        }
        this.prune(Date.now());
      } catch (error) {
        if ((error as NodeJS.ErrnoException | undefined)?.code !== "ENOENT") {
          this.logger?.warn?.("Failed to load memory usage accounting state, starting fresh.", error);
        }
      }
    })();
    return this.loadPromise;
  }

  async recordEvent(event: MemoryUsageEvent): Promise<void> {
    await this.load();
    await this.mutate(async () => {
      this.events.push(this.normalizeEvent(event) ?? {
        consumer: event.consumer,
        outcome: event.outcome,
        timestamp: Date.now(),
      });
      this.prune(Date.now());
    });
  }

  async listEvents(filter: MemoryUsageEventFilter): Promise<MemoryUsageEvent[]> {
    await this.load();
    return this.events
      .filter((item) => this.matchesFilter(item, filter))
      .map((item) => ({ ...item, metadata: item.metadata ? { ...item.metadata } : undefined }));
  }

  async countEvents(filter: MemoryUsageEventFilter): Promise<number> {
    await this.load();
    return this.events.filter((item) => this.matchesFilter(item, filter)).length;
  }

  async getOldestTimestamp(filter: MemoryUsageEventFilter): Promise<number | undefined> {
    await this.load();
    const items = this.events.filter((item) => this.matchesFilter(item, filter));
    if (items.length === 0) {
      return undefined;
    }
    return items.reduce((min, item) => Math.min(min, item.timestamp), items[0].timestamp);
  }

  private matchesFilter(item: MemoryUsageEvent, filter: MemoryUsageEventFilter): boolean {
    if (item.consumer !== filter.consumer) {
      return false;
    }
    if (filter.outcomes && !filter.outcomes.includes(item.outcome)) {
      return false;
    }
    if (typeof filter.since === "number" && item.timestamp < filter.since) {
      return false;
    }
    return true;
  }

  private prune(now: number): void {
    const minTimestamp = now - this.retentionMs;
    let trimCount = 0;
    while (trimCount < this.events.length && this.events[trimCount].timestamp < minTimestamp) {
      trimCount += 1;
    }
    if (trimCount > 0) {
      this.events.splice(0, trimCount);
    }
  }

  private normalizeEvent(value: unknown): MemoryUsageEvent | null {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return null;
    }
    const item = value as Record<string, unknown>;
    const consumer = typeof item.consumer === "string" ? item.consumer : "";
    const outcome = typeof item.outcome === "string" ? item.outcome : "";
    const timestamp = Number(item.timestamp);
    if (!this.isConsumer(consumer) || !this.isOutcome(outcome) || !Number.isFinite(timestamp)) {
      return null;
    }
    const metadata = item.metadata && typeof item.metadata === "object" && !Array.isArray(item.metadata)
      ? { ...(item.metadata as Record<string, unknown>) }
      : undefined;
    return {
      consumer,
      outcome,
      timestamp,
      conversationId: typeof item.conversationId === "string" && item.conversationId.trim() ? item.conversationId.trim() : undefined,
      source: typeof item.source === "string" && item.source.trim() ? item.source.trim() : undefined,
      quantity: Number.isFinite(Number(item.quantity)) ? Number(item.quantity) : undefined,
      metadata,
    };
  }

  private isConsumer(value: string): value is MemoryUsageConsumer {
    return value === "session_digest_refresh"
      || value === "durable_extraction_request"
      || value === "durable_extraction_run";
  }

  private isOutcome(value: string): value is MemoryUsageOutcome {
    return value === "completed"
      || value === "skipped"
      || value === "blocked"
      || value === "queued"
      || value === "started"
      || value === "failed";
  }

  private async mutate(mutator: () => Promise<void>): Promise<void> {
    const run = this.writeChain.then(async () => {
      await mutator();
      const state: MemoryUsageAccountingState = {
        version: STATE_VERSION,
        events: this.events.map((item) => ({
          ...item,
          metadata: item.metadata ? { ...item.metadata } : undefined,
        })),
      };
      await atomicWriteText(this.statePath, JSON.stringify(state, null, 2));
    });
    this.writeChain = run.catch(() => {});
    await run;
  }
}

export class MemoryRuntimeBudgetGuard {
  private readonly accounting: MemoryRuntimeUsageAccounting;
  private readonly sessionDigestRefreshLimit?: MemoryBudgetLimit;
  private readonly durableExtractionRunLimit?: MemoryBudgetLimit;
  private readonly runtimeEvents: MemoryUsageEvent[] = [];

  constructor(options: MemoryRuntimeBudgetGuardOptions) {
    this.accounting = options.accounting;
    this.sessionDigestRefreshLimit = this.normalizeLimit(options.sessionDigestRefreshLimit);
    this.durableExtractionRunLimit = this.normalizeLimit(options.durableExtractionRunLimit);
  }

  static fromEnv(accounting: MemoryRuntimeUsageAccounting): MemoryRuntimeBudgetGuard {
    return new MemoryRuntimeBudgetGuard({
      accounting,
      sessionDigestRefreshLimit: {
        maxRuns: normalizePositiveInteger(process.env.BELLDANDY_MEMORY_SESSION_DIGEST_MAX_RUNS) ?? 0,
        windowMs: normalizePositiveInteger(process.env.BELLDANDY_MEMORY_SESSION_DIGEST_WINDOW_MS) ?? 60 * 60 * 1_000,
      },
      durableExtractionRunLimit: {
        maxRuns: normalizePositiveInteger(process.env.BELLDANDY_MEMORY_DURABLE_EXTRACTION_MAX_RUNS) ?? 0,
        windowMs: normalizePositiveInteger(process.env.BELLDANDY_MEMORY_DURABLE_EXTRACTION_WINDOW_MS) ?? 60 * 60 * 1_000,
      },
    });
  }

  async evaluateSessionDigestRefresh(now = Date.now()): Promise<MemoryBudgetDecision> {
    return this.evaluateLimit(
      "session_digest_refresh",
      ["completed", "skipped"],
      this.sessionDigestRefreshLimit,
      now,
      "session_digest_refresh_budget_exceeded",
      "Session digest refresh budget exceeded.",
    );
  }

  async evaluateDurableExtractionRun(now = Date.now()): Promise<MemoryBudgetDecision> {
    return this.evaluateLimit(
      "durable_extraction_run",
      ["started"],
      this.durableExtractionRunLimit,
      now,
      "durable_extraction_run_budget_exceeded",
      "Durable extraction run budget exceeded.",
    );
  }

  async getSessionDigestRateLimitState(now = Date.now()): Promise<RateLimitState> {
    return this.getRateLimitState(
      await this.evaluateSessionDigestRefresh(now),
      this.sessionDigestRefreshLimit,
    );
  }

  async getDurableExtractionRunRateLimitState(now = Date.now()): Promise<RateLimitState> {
    return this.getRateLimitState(
      await this.evaluateDurableExtractionRun(now),
      this.durableExtractionRunLimit,
    );
  }

  noteEvent(event: MemoryUsageEvent): void {
    this.runtimeEvents.push({
      consumer: event.consumer,
      outcome: event.outcome,
      timestamp: Number.isFinite(Number(event.timestamp)) ? Number(event.timestamp) : Date.now(),
      conversationId: event.conversationId,
      source: event.source,
      quantity: event.quantity,
      metadata: event.metadata ? { ...event.metadata } : undefined,
    });
    this.pruneRuntimeEvents(Date.now());
  }

  private normalizeLimit(limit: MemoryBudgetLimit | undefined): MemoryBudgetLimit | undefined {
    const maxRuns = normalizePositiveInteger(limit?.maxRuns);
    const windowMs = normalizePositiveInteger(limit?.windowMs);
    if (!maxRuns || !windowMs) {
      return undefined;
    }
    return { maxRuns, windowMs };
  }

  private async evaluateLimit(
    consumer: MemoryUsageConsumer,
    outcomes: MemoryUsageOutcome[],
    limit: MemoryBudgetLimit | undefined,
    now: number,
    reasonCode: string,
    reasonMessage: string,
  ): Promise<MemoryBudgetDecision> {
    if (!limit) {
      return { allowed: true };
    }
    const since = now - limit.windowMs;
    this.pruneRuntimeEvents(now);
    const observedRuns = this.runtimeEvents.filter((item) => item.consumer === consumer
      && outcomes.includes(item.outcome)
      && item.timestamp >= since).length;
    if (observedRuns < limit.maxRuns) {
      return {
        allowed: true,
        observedRuns,
        maxRuns: limit.maxRuns,
        windowMs: limit.windowMs,
      };
    }

    const oldestTimestamp = this.runtimeEvents
      .filter((item) => item.consumer === consumer && outcomes.includes(item.outcome) && item.timestamp >= since)
      .reduce<number | undefined>((min, item) => {
        if (typeof min !== "number") {
          return item.timestamp;
        }
        return Math.min(min, item.timestamp);
      }, undefined);
    const retryAfterMs = typeof oldestTimestamp === "number"
      ? Math.max(1, oldestTimestamp + limit.windowMs - now)
      : limit.windowMs;

    return {
      allowed: false,
      reasonCode,
      reasonMessage: `${reasonMessage} ${observedRuns}/${limit.maxRuns} runs in the last ${limit.windowMs}ms.`,
      observedRuns,
      maxRuns: limit.maxRuns,
      windowMs: limit.windowMs,
      retryAfterMs,
    };
  }

  private getRateLimitState(
    decision: MemoryBudgetDecision,
    limit: MemoryBudgetLimit | undefined,
  ): RateLimitState {
    return toRateLimitState(decision, Boolean(limit));
  }

  private pruneRuntimeEvents(now: number): void {
    const windows = [this.sessionDigestRefreshLimit?.windowMs, this.durableExtractionRunLimit?.windowMs]
      .filter((value): value is number => typeof value === "number" && value > 0);
    const maxWindowMs = windows.length > 0 ? Math.max(...windows) : 60 * 60 * 1_000;
    const minTimestamp = now - maxWindowMs;
    let trimCount = 0;
    while (trimCount < this.runtimeEvents.length && this.runtimeEvents[trimCount].timestamp < minTimestamp) {
      trimCount += 1;
    }
    if (trimCount > 0) {
      this.runtimeEvents.splice(0, trimCount);
    }
  }
}

function toRateLimitState(decision: MemoryBudgetDecision, configured: boolean): RateLimitState {
  return {
    status: configured ? (decision.allowed ? "ok" : "limited") : "unlimited",
    configured,
    observedRuns: decision.observedRuns ?? 0,
    maxRuns: decision.maxRuns,
    windowMs: decision.windowMs,
    retryAfterMs: decision.retryAfterMs,
    reasonCode: decision.reasonCode,
    reasonMessage: decision.reasonMessage,
  };
}
