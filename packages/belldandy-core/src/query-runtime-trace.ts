import type {
  QueryRuntimeMethod,
  QueryRuntimeObserver,
  QueryRuntimeStage,
  QueryRuntimeStageEvent,
} from "./query-runtime.js";

export type QueryRuntimeTraceStatus = "running" | "completed" | "failed";

export type QueryRuntimeTraceStageSnapshot = {
  stage: QueryRuntimeStage;
  timestamp: number;
  detail?: Record<string, unknown>;
};

export type QueryRuntimeTraceRecord = {
  traceId: string;
  method: QueryRuntimeMethod;
  status: QueryRuntimeTraceStatus;
  conversationId?: string;
  startedAt: number;
  updatedAt: number;
  latestStage: QueryRuntimeStage;
  stageCount: number;
  stages: QueryRuntimeTraceStageSnapshot[];
};

export type QueryRuntimeTraceSummary = {
  observerEnabled: true;
  totalObservedEvents: number;
  activeTraceCount: number;
  traces: QueryRuntimeTraceRecord[];
};

type TerminalStage = Extract<QueryRuntimeStage, "completed" | "failed">;

type QueryRuntimeTraceInternalRecord = {
  traceId: string;
  method: QueryRuntimeMethod;
  conversationId?: string;
  startedAt: number;
  updatedAt: number;
  latestStage: QueryRuntimeStage;
  stageCount: number;
  stages: QueryRuntimeTraceStageSnapshot[];
  terminalStage?: TerminalStage;
};

export class QueryRuntimeTraceStore {
  private readonly maxTraces: number;
  private readonly maxStagesPerTrace: number;
  private readonly traces = new Map<string, QueryRuntimeTraceInternalRecord>();
  private totalObservedEvents = 0;

  constructor(options: { maxTraces?: number; maxStagesPerTrace?: number } = {}) {
    this.maxTraces = Math.max(1, Math.floor(options.maxTraces ?? 24));
    this.maxStagesPerTrace = Math.max(1, Math.floor(options.maxStagesPerTrace ?? 16));
  }

  createObserver<TMethod extends QueryRuntimeMethod>(): QueryRuntimeObserver<TMethod> {
    return (event) => {
      this.observe(event);
    };
  }

  observe<TMethod extends QueryRuntimeMethod>(event: QueryRuntimeStageEvent<TMethod>): void {
    this.totalObservedEvents += 1;
    const current = this.traces.get(event.traceId);
    const stageSnapshot: QueryRuntimeTraceStageSnapshot = {
      stage: event.stage,
      timestamp: event.timestamp,
      detail: cloneDetail(event.detail),
    };

    if (!current) {
      this.traces.set(event.traceId, {
        traceId: event.traceId,
        method: event.method,
        conversationId: event.conversationId,
        startedAt: event.timestamp,
        updatedAt: event.timestamp,
        latestStage: event.stage,
        stageCount: 1,
        stages: [stageSnapshot],
        terminalStage: toTerminalStage(event.stage),
      });
      this.trimToLimit();
      return;
    }

    current.conversationId = event.conversationId ?? current.conversationId;
    current.updatedAt = event.timestamp;
    current.latestStage = event.stage;
    current.stageCount += 1;
    current.stages.push(stageSnapshot);
    if (current.stages.length > this.maxStagesPerTrace) {
      current.stages.splice(0, current.stages.length - this.maxStagesPerTrace);
    }
    current.terminalStage = toTerminalStage(event.stage) ?? current.terminalStage;
    this.trimToLimit();
  }

  getSummary(): QueryRuntimeTraceSummary {
    const traces = [...this.traces.values()]
      .sort((left, right) => {
        if (right.updatedAt !== left.updatedAt) {
          return right.updatedAt - left.updatedAt;
        }
        return right.startedAt - left.startedAt;
      })
      .map<QueryRuntimeTraceRecord>((trace) => ({
        traceId: trace.traceId,
        method: trace.method,
        status: toStatus(trace.terminalStage),
        conversationId: trace.conversationId,
        startedAt: trace.startedAt,
        updatedAt: trace.updatedAt,
        latestStage: trace.latestStage,
        stageCount: trace.stageCount,
        stages: trace.stages.map((stage) => ({
          stage: stage.stage,
          timestamp: stage.timestamp,
          detail: cloneDetail(stage.detail),
        })),
      }));

    return {
      observerEnabled: true,
      totalObservedEvents: this.totalObservedEvents,
      activeTraceCount: traces.filter((trace) => trace.status === "running").length,
      traces,
    };
  }

  private trimToLimit(): void {
    if (this.traces.size <= this.maxTraces) {
      return;
    }

    const traceIds = [...this.traces.values()]
      .sort((left, right) => {
        if (left.updatedAt !== right.updatedAt) {
          return left.updatedAt - right.updatedAt;
        }
        return left.startedAt - right.startedAt;
      })
      .slice(0, this.traces.size - this.maxTraces)
      .map((trace) => trace.traceId);

    for (const traceId of traceIds) {
      this.traces.delete(traceId);
    }
  }
}

function toTerminalStage(stage: QueryRuntimeStage): TerminalStage | undefined {
  return stage === "completed" || stage === "failed" ? stage : undefined;
}

function toStatus(terminalStage?: TerminalStage): QueryRuntimeTraceStatus {
  if (terminalStage === "failed") {
    return "failed";
  }
  if (terminalStage === "completed") {
    return "completed";
  }
  return "running";
}

function cloneDetail(detail?: Record<string, unknown>): Record<string, unknown> | undefined {
  return detail ? { ...detail } : undefined;
}
