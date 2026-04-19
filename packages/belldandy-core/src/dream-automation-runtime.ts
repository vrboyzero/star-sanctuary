import type { DreamAutoRunResult, DreamRuntime } from "@belldandy/memory";

export interface DreamAutomationRuntimeLogger {
  debug?: (message: string, data?: unknown) => void;
  warn?: (message: string, data?: unknown) => void;
  error?: (message: string, data?: unknown) => void;
}

export interface DreamAutomationTriggerResult {
  source: "heartbeat" | "cron";
  attempted: boolean;
  executed: boolean;
  agentId?: string;
  runId?: string;
  reason?: string;
  skipCode?: string;
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function uniqueAgentIds(agentIds: string[]): string[] {
  return Array.from(new Set(
    agentIds
      .map((item) => normalizeText(item) ?? "")
      .filter(Boolean),
  ));
}

async function sortAgentIdsByLastDreamAt(
  agentIds: string[],
  resolveDreamRuntime: (agentId?: string) => DreamRuntime | null,
): Promise<string[]> {
  const items = await Promise.all(agentIds.map(async (agentId, index) => {
    const runtime = resolveDreamRuntime(agentId);
    const state = runtime ? await runtime.getState().catch(() => null) : null;
    const lastDreamAt = typeof state?.lastDreamAt === "string" ? Date.parse(state.lastDreamAt) : Number.NaN;
    return {
      agentId,
      index,
      lastDreamAt: Number.isFinite(lastDreamAt) ? lastDreamAt : Number.NEGATIVE_INFINITY,
    };
  }));
  return items
    .sort((left, right) => {
      if (left.lastDreamAt !== right.lastDreamAt) {
        return left.lastDreamAt - right.lastDreamAt;
      }
      return left.index - right.index;
    })
    .map((item) => item.agentId);
}

export class DreamAutomationRuntime {
  private readonly heartbeatEnabled: boolean;
  private readonly cronEnabled: boolean;
  private readonly resolveDreamRuntime: (agentId?: string) => DreamRuntime | null;
  private readonly resolveDefaultConversationId: (agentId?: string) => string;
  private readonly agentIds: string[];
  private readonly isBusy?: () => boolean;
  private readonly logger?: DreamAutomationRuntimeLogger;
  private activeTrigger: Promise<DreamAutomationTriggerResult> | null = null;

  constructor(options: {
    heartbeatEnabled: boolean;
    cronEnabled: boolean;
    resolveDreamRuntime: (agentId?: string) => DreamRuntime | null;
    resolveDefaultConversationId: (agentId?: string) => string;
    agentIds: string[];
    isBusy?: () => boolean;
    logger?: DreamAutomationRuntimeLogger;
  }) {
    this.heartbeatEnabled = options.heartbeatEnabled;
    this.cronEnabled = options.cronEnabled;
    this.resolveDreamRuntime = options.resolveDreamRuntime;
    this.resolveDefaultConversationId = options.resolveDefaultConversationId;
    this.agentIds = uniqueAgentIds(options.agentIds);
    this.isBusy = options.isBusy;
    this.logger = options.logger;
  }

  async handleHeartbeatEvent(input: {
    status: "ran" | "skipped" | "failed";
    conversationId?: string;
    reason?: string;
  }): Promise<DreamAutomationTriggerResult> {
    return this.trigger({
      source: "heartbeat",
      driverEnabled: this.heartbeatEnabled,
      sourceStatus: input.status,
      sourceConversationId: input.conversationId,
      reason: normalizeText(input.reason) ?? "heartbeat auto trigger",
    });
  }

  async handleCronEvent(input: {
    status: "ok" | "skipped" | "error";
    sourceId?: string;
    label?: string;
    conversationId?: string;
    reason?: string;
  }): Promise<DreamAutomationTriggerResult> {
    const reasonParts = [
      "cron auto trigger",
      normalizeText(input.sourceId),
      normalizeText(input.label),
      normalizeText(input.reason),
    ].filter(Boolean);
    return this.trigger({
      source: "cron",
      driverEnabled: this.cronEnabled,
      sourceStatus: input.status === "ok" ? "ran" : input.status === "error" ? "failed" : "skipped",
      sourceConversationId: input.conversationId,
      reason: reasonParts.join(" | "),
    });
  }

  private async trigger(input: {
    source: "heartbeat" | "cron";
    driverEnabled: boolean;
    sourceStatus: "ran" | "skipped" | "failed";
    sourceConversationId?: string;
    reason: string;
  }): Promise<DreamAutomationTriggerResult> {
    if (this.activeTrigger) {
      return this.activeTrigger;
    }
    const task = this.triggerInternal(input).finally(() => {
      this.activeTrigger = null;
    });
    this.activeTrigger = task;
    return task;
  }

  private async triggerInternal(input: {
    source: "heartbeat" | "cron";
    driverEnabled: boolean;
    sourceStatus: "ran" | "skipped" | "failed";
    sourceConversationId?: string;
    reason: string;
  }): Promise<DreamAutomationTriggerResult> {
    if (!input.driverEnabled) {
      return {
        source: input.source,
        attempted: false,
        executed: false,
        reason: `${input.source} dream automation disabled`,
        skipCode: "driver_disabled",
      };
    }
    if (input.sourceStatus !== "ran") {
      return {
        source: input.source,
        attempted: false,
        executed: false,
        reason: `${input.source} source status=${input.sourceStatus}`,
        skipCode: "source_not_ran",
      };
    }
    if (this.isBusy?.()) {
      return {
        source: input.source,
        attempted: false,
        executed: false,
        reason: "gateway busy",
        skipCode: "busy",
      };
    }

    const orderedAgentIds = await sortAgentIdsByLastDreamAt(this.agentIds, this.resolveDreamRuntime);
    for (const agentId of orderedAgentIds) {
      const runtime = this.resolveDreamRuntime(agentId);
      if (!runtime) continue;
      const conversationId = agentId === "default" && normalizeText(input.sourceConversationId)
        ? normalizeText(input.sourceConversationId)
        : this.resolveDefaultConversationId(agentId);
      let result: DreamAutoRunResult;
      try {
        result = await runtime.maybeAutoRun({
          conversationId,
          triggerMode: input.source,
          reason: input.reason,
        });
      } catch (error) {
        this.logger?.error?.("dream automation trigger failed", {
          source: input.source,
          agentId,
          error: error instanceof Error ? error.message : String(error),
        });
        continue;
      }
      if (!result.executed) {
        this.logger?.debug?.("dream automation skipped", {
          source: input.source,
          agentId,
          skipCode: result.skipCode,
          reason: result.skipReason,
        });
        continue;
      }
      this.logger?.debug?.("dream automation executed", {
        source: input.source,
        agentId,
        runId: result.record?.id,
      });
      return {
        source: input.source,
        attempted: true,
        executed: true,
        agentId,
        runId: result.record?.id,
      };
    }

    return {
      source: input.source,
      attempted: true,
      executed: false,
      reason: "no eligible agent for automatic dream",
      skipCode: "no_eligible_agent",
    };
  }
}
