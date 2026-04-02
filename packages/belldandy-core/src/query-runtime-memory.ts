import type { ConversationStore } from "@belldandy/agent";
import {
  DURABLE_EXTRACTION_REQUEST_RATE_LIMIT_REASON_CODE,
  DURABLE_EXTRACTION_REQUEST_RATE_LIMIT_REASON_MESSAGE,
  type DurableExtractionDigestSnapshot,
  type DurableExtractionRecord,
  type DurableExtractionRuntime,
} from "@belldandy/memory";
import type { GatewayResFrame } from "@belldandy/protocol";

import type { SlidingWindowRateLimiter, MemoryRuntimeBudgetGuard, MemoryRuntimeUsageAccounting } from "./memory-runtime-budget.js";
import type { MemoryRuntimeDoctorReport } from "./memory-runtime-introspection.js";
import { QueryRuntime, type QueryRuntimeObserver } from "./query-runtime.js";

export type QueryRuntimeMemoryContext = {
  requestId: string;
  conversationStore: ConversationStore;
  durableExtractionRuntime?: DurableExtractionRuntime;
  stateDir?: string;
  teamSharedMemoryEnabled?: boolean;
  requestDurableExtraction?: (input: {
    conversationId: string;
    source: string;
    digest: DurableExtractionDigestSnapshot;
  }) => Promise<DurableExtractionRecord | undefined>;
  memoryUsageAccounting: MemoryRuntimeUsageAccounting;
  memoryBudgetGuard: MemoryRuntimeBudgetGuard;
  durableExtractionRequestRateLimiter: SlidingWindowRateLimiter;
  broadcastEvent?: (frame: any) => void;
  runtimeObserver?: QueryRuntimeObserver<
    | "conversation.digest.get"
    | "conversation.digest.refresh"
    | "conversation.memory.extraction.get"
    | "conversation.memory.extract"
  >;
  buildMemoryRuntimeDoctorReport: (input: {
    conversationStore?: ConversationStore;
    durableExtractionRuntime?: DurableExtractionRuntime;
    stateDir?: string;
    teamSharedMemoryEnabled?: boolean;
    sessionDigestRateLimit: Promise<any> | any;
    durableExtractionRequestRateLimit: Promise<any> | any;
    durableExtractionRunRateLimit: Promise<any> | any;
  }) => Promise<MemoryRuntimeDoctorReport>;
  buildDurableExtractionUnavailableError: (runtime?: DurableExtractionRuntime) => { code: string; message: string };
  refreshConversationDigestAndBroadcast: (
    conversationStore: ConversationStore,
    payload: {
      conversationId: string;
      force?: boolean;
      threshold?: number;
      source: string;
    },
    broadcastEvent?: (frame: any) => void,
    durableExtractionRuntime?: DurableExtractionRuntime,
    requestDurableExtraction?: (input: {
      conversationId: string;
      source: string;
      digest: DurableExtractionDigestSnapshot;
    }) => Promise<DurableExtractionRecord | undefined>,
    memoryUsageAccounting?: MemoryRuntimeUsageAccounting,
    memoryBudgetGuard?: MemoryRuntimeBudgetGuard,
  ) => Promise<any>;
  toDurableExtractionDigestSnapshot: (
    digest: Awaited<ReturnType<ConversationStore["getSessionDigest"]>>,
  ) => DurableExtractionDigestSnapshot;
  isMemoryBudgetExceededError: (error: unknown) => error is Error & {
    decision: {
      reasonCode?: string;
      reasonMessage?: string;
    };
  };
};

export async function handleConversationDigestGetWithQueryRuntime(
  ctx: QueryRuntimeMemoryContext,
  params: { conversationId: string; threshold?: number },
): Promise<GatewayResFrame> {
  const runtime = new QueryRuntime({
    method: "conversation.digest.get" as const,
    traceId: ctx.requestId,
    observer: ctx.runtimeObserver,
  });

  return runtime.run(async (queryRuntime) => {
    queryRuntime.mark("request_validated", {
      conversationId: params.conversationId,
      detail: {
        threshold: params.threshold,
      },
    });

    const digest = await ctx.conversationStore.getSessionDigest(params.conversationId, { threshold: params.threshold });
    queryRuntime.mark("digest_loaded", {
      conversationId: params.conversationId,
      detail: {
        status: digest.status,
        messageCount: digest.messageCount,
        pendingMessageCount: digest.pendingMessageCount,
      },
    });
    queryRuntime.mark("completed", { conversationId: params.conversationId });

    return {
      type: "res",
      id: ctx.requestId,
      ok: true,
      payload: {
        digest,
      },
    };
  });
}

export async function handleConversationDigestRefreshWithQueryRuntime(
  ctx: QueryRuntimeMemoryContext,
  params: { conversationId: string; force?: boolean; threshold?: number },
): Promise<GatewayResFrame> {
  const runtime = new QueryRuntime({
    method: "conversation.digest.refresh" as const,
    traceId: ctx.requestId,
    observer: ctx.runtimeObserver,
  });

  return runtime.run(async (queryRuntime) => {
    queryRuntime.mark("request_validated", {
      conversationId: params.conversationId,
      detail: {
        threshold: params.threshold,
        force: params.force === true,
      },
    });

    try {
      const result = await ctx.refreshConversationDigestAndBroadcast(
        ctx.conversationStore,
        {
          conversationId: params.conversationId,
          force: params.force === true,
          threshold: params.threshold,
          source: "manual",
        },
        ctx.broadcastEvent,
        ctx.durableExtractionRuntime,
        ctx.requestDurableExtraction,
        ctx.memoryUsageAccounting,
        ctx.memoryBudgetGuard,
      );

      queryRuntime.mark("digest_refreshed", {
        conversationId: params.conversationId,
        detail: {
          updated: result.updated,
          compacted: result.compacted,
          digestStatus: result.digest?.status,
        },
      });
      queryRuntime.mark("completed", { conversationId: params.conversationId });

      return {
        type: "res",
        id: ctx.requestId,
        ok: true,
        payload: result,
      };
    } catch (error) {
      if (ctx.isMemoryBudgetExceededError(error)) {
        return {
          type: "res",
          id: ctx.requestId,
          ok: false,
          error: {
            code: error.decision.reasonCode ?? "memory_budget_exceeded",
            message: error.decision.reasonMessage ?? String(error),
          },
        };
      }
      return {
        type: "res",
        id: ctx.requestId,
        ok: false,
        error: { code: "digest_refresh_failed", message: String(error) },
      };
    }
  });
}

export async function handleConversationMemoryExtractionGetWithQueryRuntime(
  ctx: QueryRuntimeMemoryContext,
  params: { conversationId: string; threshold?: number },
): Promise<GatewayResFrame> {
  const runtime = new QueryRuntime({
    method: "conversation.memory.extraction.get" as const,
    traceId: ctx.requestId,
    observer: ctx.runtimeObserver,
  });

  return runtime.run(async (queryRuntime) => {
    queryRuntime.mark("runtime_checked", {
      conversationId: params.conversationId,
      detail: {
        available: ctx.durableExtractionRuntime?.isAvailable() === true,
      },
    });

    if (!ctx.durableExtractionRuntime || !ctx.durableExtractionRuntime.isAvailable()) {
      queryRuntime.mark("completed", {
        conversationId: params.conversationId,
        detail: {
          unavailable: true,
        },
      });
      return { type: "res", id: ctx.requestId, ok: false, error: ctx.buildDurableExtractionUnavailableError(ctx.durableExtractionRuntime) };
    }

    queryRuntime.mark("request_validated", {
      conversationId: params.conversationId,
      detail: {
        threshold: params.threshold,
      },
    });

    const [extraction, digest] = await Promise.all([
      ctx.durableExtractionRuntime.getRecord(params.conversationId),
      ctx.conversationStore.getSessionDigest(params.conversationId, { threshold: params.threshold }),
    ]);

    queryRuntime.mark("extraction_loaded", {
      conversationId: params.conversationId,
      detail: {
        status: extraction.status,
        pending: extraction.pending,
        runCount: extraction.runCount,
      },
    });
    queryRuntime.mark("digest_loaded", {
      conversationId: params.conversationId,
      detail: {
        status: digest.status,
        messageCount: digest.messageCount,
        pendingMessageCount: digest.pendingMessageCount,
      },
    });

    const runtimeReport = await ctx.buildMemoryRuntimeDoctorReport({
      conversationStore: ctx.conversationStore,
      durableExtractionRuntime: ctx.durableExtractionRuntime,
      stateDir: ctx.stateDir,
      teamSharedMemoryEnabled: ctx.teamSharedMemoryEnabled,
      sessionDigestRateLimit: ctx.memoryBudgetGuard.getSessionDigestRateLimitState(),
      durableExtractionRequestRateLimit: ctx.durableExtractionRequestRateLimiter.getState(
        DURABLE_EXTRACTION_REQUEST_RATE_LIMIT_REASON_CODE,
        DURABLE_EXTRACTION_REQUEST_RATE_LIMIT_REASON_MESSAGE,
      ),
      durableExtractionRunRateLimit: ctx.memoryBudgetGuard.getDurableExtractionRunRateLimitState(),
    });

    queryRuntime.mark("runtime_report_built", {
      conversationId: params.conversationId,
      detail: {
        durableAvailable: runtimeReport.durableExtraction.availability.available,
      },
    });
    queryRuntime.mark("completed", { conversationId: params.conversationId });

    return {
      type: "res",
      id: ctx.requestId,
      ok: true,
      payload: {
        extraction,
        digest,
        runtime: runtimeReport,
      },
    };
  });
}

export async function handleConversationMemoryExtractWithQueryRuntime(
  ctx: QueryRuntimeMemoryContext,
  params: { conversationId: string; threshold?: number; refreshDigest?: boolean },
): Promise<GatewayResFrame> {
  const runtime = new QueryRuntime({
    method: "conversation.memory.extract" as const,
    traceId: ctx.requestId,
    observer: ctx.runtimeObserver,
  });

  return runtime.run(async (queryRuntime) => {
    queryRuntime.mark("runtime_checked", {
      conversationId: params.conversationId,
      detail: {
        available: ctx.durableExtractionRuntime?.isAvailable() === true,
      },
    });

    if (!ctx.durableExtractionRuntime || !ctx.durableExtractionRuntime.isAvailable()) {
      queryRuntime.mark("completed", {
        conversationId: params.conversationId,
        detail: {
          unavailable: true,
        },
      });
      return { type: "res", id: ctx.requestId, ok: false, error: ctx.buildDurableExtractionUnavailableError(ctx.durableExtractionRuntime) };
    }

    queryRuntime.mark("request_validated", {
      conversationId: params.conversationId,
      detail: {
        threshold: params.threshold,
        refreshDigest: params.refreshDigest === true,
      },
    });

    try {
      const digest = params.refreshDigest === true
        ? (await ctx.refreshConversationDigestAndBroadcast(
          ctx.conversationStore,
          {
            conversationId: params.conversationId,
            threshold: params.threshold,
            source: "memory.extract",
          },
          ctx.broadcastEvent,
          ctx.durableExtractionRuntime,
          ctx.requestDurableExtraction,
          ctx.memoryUsageAccounting,
          ctx.memoryBudgetGuard,
        )).digest
        : await ctx.conversationStore.getSessionDigest(params.conversationId, { threshold: params.threshold });

      queryRuntime.mark(params.refreshDigest === true ? "digest_refreshed" : "digest_loaded", {
        conversationId: params.conversationId,
        detail: {
          status: digest.status,
          messageCount: digest.messageCount,
          pendingMessageCount: digest.pendingMessageCount,
        },
      });

      const extraction = await (ctx.requestDurableExtraction ?? ctx.durableExtractionRuntime.requestExtraction.bind(ctx.durableExtractionRuntime))({
        conversationId: params.conversationId,
        source: "manual",
        digest: ctx.toDurableExtractionDigestSnapshot(digest),
      });

      queryRuntime.mark("extraction_requested", {
        conversationId: params.conversationId,
        detail: {
          status: extraction?.status,
          pending: extraction?.pending,
          runCount: extraction?.runCount,
          lastSkipReason: extraction?.lastSkipReason,
        },
      });

      const runtimeReport = await ctx.buildMemoryRuntimeDoctorReport({
        conversationStore: ctx.conversationStore,
        durableExtractionRuntime: ctx.durableExtractionRuntime,
        stateDir: ctx.stateDir,
        teamSharedMemoryEnabled: ctx.teamSharedMemoryEnabled,
        sessionDigestRateLimit: ctx.memoryBudgetGuard.getSessionDigestRateLimitState(),
        durableExtractionRequestRateLimit: ctx.durableExtractionRequestRateLimiter.getState(
          DURABLE_EXTRACTION_REQUEST_RATE_LIMIT_REASON_CODE,
          DURABLE_EXTRACTION_REQUEST_RATE_LIMIT_REASON_MESSAGE,
        ),
        durableExtractionRunRateLimit: ctx.memoryBudgetGuard.getDurableExtractionRunRateLimitState(),
      });

      queryRuntime.mark("runtime_report_built", {
        conversationId: params.conversationId,
        detail: {
          durableAvailable: runtimeReport.durableExtraction.availability.available,
        },
      });
      queryRuntime.mark("completed", { conversationId: params.conversationId });

      return {
        type: "res",
        id: ctx.requestId,
        ok: true,
        payload: {
          extraction,
          digest,
          runtime: runtimeReport,
        },
      };
    } catch (error) {
      if (ctx.isMemoryBudgetExceededError(error)) {
        return {
          type: "res",
          id: ctx.requestId,
          ok: false,
          error: {
            code: error.decision.reasonCode ?? "memory_budget_exceeded",
            message: error.decision.reasonMessage ?? String(error),
          },
        };
      }
      return {
        type: "res",
        id: ctx.requestId,
        ok: false,
        error: { code: "memory_extract_failed", message: String(error) },
      };
    }
  });
}
