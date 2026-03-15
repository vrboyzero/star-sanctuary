import { randomUUID } from "node:crypto";
import type { TaskConversationStore, TaskMemoryRelation, TaskRecord, TaskSource, TaskStatus, TaskToolCallSummary } from "./task-types.js";
import { TaskSummarizer } from "./task-summarizer.js";
import type { MemoryStore } from "./store.js";

type UsageSnapshot = {
  type: "usage";
  inputTokens: number;
  outputTokens: number;
};

interface TaskDraft {
  taskId: string;
  conversationId: string;
  sessionKey: string;
  agentId?: string;
  source: TaskSource;
  objective?: string;
  parentConversationId?: string;
  startedAt: string;
  toolCalls: TaskToolCallSummary[];
  artifactPaths: string[];
  memoryLinks: Array<{ chunkId: string; relation: TaskMemoryRelation }>;
}

export interface TaskProcessorOptions {
  enabled?: boolean;
  conversationStore?: TaskConversationStore;
  summarizer?: TaskSummarizer;
  summaryMinDurationMs?: number;
  summaryMinToolCalls?: number;
  summaryMinTokenTotal?: number;
}

export class TaskProcessor {
  private readonly store: MemoryStore;
  private readonly enabled: boolean;
  private readonly conversationStore?: TaskConversationStore;
  private readonly summarizer?: TaskSummarizer;
  private readonly summaryMinDurationMs: number;
  private readonly summaryMinToolCalls: number;
  private readonly summaryMinTokenTotal: number;
  private readonly drafts = new Map<string, TaskDraft>();
  private readonly summaryQueue: Array<{ taskId: string; conversationId: string }> = [];
  private summaryRunning = false;

  constructor(store: MemoryStore, options: TaskProcessorOptions = {}) {
    this.store = store;
    this.enabled = options.enabled ?? false;
    this.conversationStore = options.conversationStore;
    this.summarizer = options.summarizer;
    this.summaryMinDurationMs = options.summaryMinDurationMs ?? 15_000;
    this.summaryMinToolCalls = options.summaryMinToolCalls ?? 2;
    this.summaryMinTokenTotal = options.summaryMinTokenTotal ?? 2_000;
  }

  startTask(input: {
    conversationId: string;
    sessionKey: string;
    agentId?: string;
    source: TaskSource;
    objective?: string;
    parentConversationId?: string;
  }): string | null {
    if (!this.enabled) return null;

    const taskId = `task_${randomUUID().slice(0, 8)}`;
    this.drafts.set(input.conversationId, {
      taskId,
      conversationId: input.conversationId,
      sessionKey: input.sessionKey,
      agentId: input.agentId,
      source: input.source,
      objective: sanitizeObjective(input.objective),
      parentConversationId: input.parentConversationId,
      startedAt: new Date().toISOString(),
      toolCalls: [],
      artifactPaths: [],
      memoryLinks: [],
    });
    return taskId;
  }

  recordToolCall(conversationId: string, item: TaskToolCallSummary): void {
    if (!this.enabled) return;
    const draft = this.drafts.get(conversationId);
    if (!draft) return;

    draft.toolCalls.push(item);
    if (item.artifactPaths?.length) {
      for (const artifactPath of item.artifactPaths) {
        if (!draft.artifactPaths.includes(artifactPath)) {
          draft.artifactPaths.push(artifactPath);
        }
      }
    }
  }

  linkMemory(conversationId: string, chunkIds: string[], relation: TaskMemoryRelation = "used"): void {
    if (!this.enabled || chunkIds.length === 0) return;
    const draft = this.drafts.get(conversationId);
    if (!draft) return;

    for (const chunkId of chunkIds) {
      if (!chunkId) continue;
      const exists = draft.memoryLinks.some((link) => link.chunkId === chunkId && link.relation === relation);
      if (!exists) {
        draft.memoryLinks.push({ chunkId, relation });
      }
    }
  }

  addArtifactPath(conversationId: string, artifactPath: string): void {
    if (!this.enabled || !artifactPath) return;
    const draft = this.drafts.get(conversationId);
    if (!draft) return;
    if (!draft.artifactPaths.includes(artifactPath)) {
      draft.artifactPaths.push(artifactPath);
    }
  }

  completeTask(input: {
    conversationId: string;
    success: boolean;
    durationMs?: number;
    error?: string;
    messages?: unknown[];
  }): string | null {
    if (!this.enabled) return null;

    const draft = this.drafts.get(input.conversationId);
    if (!draft) return null;
    this.drafts.delete(input.conversationId);

    const usage = extractUsage(input.messages);
    const now = new Date().toISOString();
    const status: TaskStatus = input.success ? "success" : "failed";
    const outcome = input.success ? "success" : "failed";
    const title = buildFallbackTitle(draft.objective, draft.source);
    const summary = buildFallbackSummary({
      objective: draft.objective,
      source: draft.source,
      success: input.success,
      toolCalls: draft.toolCalls,
      error: input.error,
    });

    const task: TaskRecord = {
      id: draft.taskId,
      conversationId: draft.conversationId,
      sessionKey: draft.sessionKey,
      parentConversationId: draft.parentConversationId,
      agentId: draft.agentId,
      source: draft.source,
      title,
      objective: draft.objective,
      status,
      outcome,
      summary,
      reflection: input.success ? undefined : shorten(input.error, 500),
      toolCalls: draft.toolCalls,
      artifactPaths: draft.artifactPaths,
      tokenInput: usage?.inputTokens,
      tokenOutput: usage?.outputTokens,
      tokenTotal: usage?.totalTokens,
      durationMs: input.durationMs,
      startedAt: draft.startedAt,
      finishedAt: now,
      metadata: {
        toolCallCount: draft.toolCalls.length,
      },
      createdAt: now,
      updatedAt: now,
    };

    this.store.createTask(task);
    for (const link of draft.memoryLinks) {
      this.store.linkTaskMemory(task.id, link.chunkId, link.relation);
    }

    if (this.shouldSummarize(task)) {
      this.summaryQueue.push({ taskId: task.id, conversationId: task.conversationId });
      void this.flushSummaryQueue();
    }

    return task.id;
  }

  async waitForIdle(): Promise<void> {
    while (this.summaryRunning || this.summaryQueue.length > 0) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  }

  private shouldSummarize(task: TaskRecord): boolean {
    if (!this.summarizer?.isEnabled) return false;
    if (task.source === "sub_agent") return true;
    if (task.status !== "success") return true;
    if ((task.toolCalls?.length ?? 0) >= this.summaryMinToolCalls) return true;
    if ((task.durationMs ?? 0) >= this.summaryMinDurationMs) return true;
    if ((task.tokenTotal ?? 0) >= this.summaryMinTokenTotal) return true;
    return false;
  }

  private async flushSummaryQueue(): Promise<void> {
    if (this.summaryRunning) return;
    this.summaryRunning = true;

    try {
      while (this.summaryQueue.length > 0) {
        const current = this.summaryQueue.shift()!;
        const task = this.store.getTask(current.taskId);
        if (!task) continue;

        const history = this.conversationStore?.getHistory(current.conversationId) ?? [];
        if (!this.summarizer?.isEnabled) continue;

        try {
          const result = await this.summarizer.summarizeTask({
            task,
            history,
            toolCalls: task.toolCalls ?? [],
          });
          if (!result) continue;

          const nextArtifactPaths = uniqueStrings([
            ...(task.artifactPaths ?? []),
            ...(result.artifactPaths ?? []),
          ]);

          this.store.updateTask(task.id, {
            title: result.title ?? task.title,
            summary: result.summary ?? task.summary,
            reflection: result.reflection ?? task.reflection,
            outcome: result.outcome ?? task.outcome,
            artifactPaths: nextArtifactPaths.length > 0 ? nextArtifactPaths : task.artifactPaths,
            summaryModel: this.summarizerModelName(),
            summaryVersion: "task-summary-v1",
          });
        } catch (err) {
          console.warn("[TaskProcessor] Failed to summarize task:", err);
        }
      }
    } finally {
      this.summaryRunning = false;
    }
  }

  private summarizerModelName(): string | undefined {
    return this.summarizer?.modelName;
  }
}

function sanitizeObjective(value?: string): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.length > 1000 ? `${trimmed.slice(0, 1000)}...` : trimmed;
}

function buildFallbackTitle(objective: string | undefined, source: TaskSource): string {
  const base = objective?.split(/\r?\n/)[0]?.trim();
  if (base) {
    return base.length > 80 ? `${base.slice(0, 80)}...` : base;
  }
  return `Task from ${source}`;
}

function buildFallbackSummary(input: {
  objective?: string;
  source: TaskSource;
  success: boolean;
  toolCalls: TaskToolCallSummary[];
  error?: string;
}): string {
  const objective = input.objective ? `目标：${shorten(input.objective, 120)}。` : "";
  const toolPart = input.toolCalls.length > 0
    ? `工具调用 ${input.toolCalls.length} 次。`
    : "未记录工具调用。";
  const resultPart = input.success
    ? "任务执行完成。"
    : `任务失败。${input.error ? `错误：${shorten(input.error, 120)}。` : ""}`;
  return `${objective}来源：${input.source}。${toolPart}${resultPart}`.trim();
}

function extractUsage(messages: unknown[] | undefined): {
  inputTokens?: number;
  outputTokens?: number;
  totalTokens?: number;
} | null {
  if (!Array.isArray(messages)) return null;

  let latest: UsageSnapshot | null = null;
  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    const candidate = message as Partial<UsageSnapshot> & { type?: string };
    if (candidate.type !== "usage") continue;
    if (typeof candidate.inputTokens !== "number" || typeof candidate.outputTokens !== "number") continue;
    latest = candidate as UsageSnapshot;
  }

  if (!latest) return null;
  return {
    inputTokens: latest.inputTokens,
    outputTokens: latest.outputTokens,
    totalTokens: latest.inputTokens + latest.outputTokens,
  };
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function shorten(value: string | undefined, maxLength: number): string | undefined {
  if (!value) return undefined;
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}
