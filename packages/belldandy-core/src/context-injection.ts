import type { BeforeAgentStartEvent, BeforeAgentStartResult, HookAgentContext } from "@belldandy/agent";
import type { MemoryCategory } from "@belldandy/memory";

import { createContextInjectionDeduper } from "./context-injection-dedupe.js";

type ContextInjectionMemoryLike = {
  id?: string;
  sourcePath: string;
  summary?: string;
  snippet?: string;
  importance?: string;
  category?: string;
  memoryType?: string;
  updatedAt?: string;
};

type RecentTaskSummaryLike = {
  taskId?: string;
  title?: string;
  objective?: string;
  summary?: string;
  status?: string;
  toolNames?: string[];
  artifactPaths?: string[];
  finishedAt?: string;
  updatedAt?: string;
};

type AutoRecallMemoryLike = {
  id?: string;
  sourcePath: string;
  snippet: string;
  score: number;
  summary?: string;
  updatedAt?: string;
};

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function formatLocalTimeLabel(value?: string | number | Date): string | undefined {
  if (!value) return undefined;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? "+" : "-";
  const absOffset = Math.abs(offsetMinutes);
  const hours = Math.floor(absOffset / 60);
  const minutes = absOffset % 60;
  const offsetText = minutes > 0
    ? `GMT${sign}${hours}:${pad2(minutes)}`
    : `GMT${sign}${hours}`;
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())} ${pad2(date.getHours())}:${pad2(date.getMinutes())}:${pad2(date.getSeconds())} ${offsetText}`;
}

function buildTaggedLine(input: {
  time?: string;
  latest?: boolean;
  source?: string;
  body: string;
}): string | null {
  const body = input.body.trim();
  if (!body) return null;
  const tags = [input.time, input.latest ? "latest" : undefined, input.source].filter((item): item is string => Boolean(item));
  return `- [${tags.join(" | ")}] ${body}`;
}

function extractCurrentMessageBlock(meta: unknown, userInput?: string): string | null {
  if (!meta || typeof meta !== "object") return null;
  const currentMessageTime = (meta as Record<string, unknown>).currentMessageTime;
  if (!currentMessageTime || typeof currentMessageTime !== "object") return null;
  const payload = currentMessageTime as Record<string, unknown>;
  const timestampMs = typeof payload.timestampMs === "number" && Number.isFinite(payload.timestampMs)
    ? payload.timestampMs
    : undefined;
  const displayTimeText = typeof payload.displayTimeText === "string" && payload.displayTimeText.trim()
    ? payload.displayTimeText.trim()
    : formatLocalTimeLabel(timestampMs);
  const role = typeof payload.role === "string" && payload.role.trim() ? payload.role.trim() : "user";
  const body = String(userInput ?? "").trim();
  if (!body) return null;
  const tagged = buildTaggedLine({
    time: displayTimeText,
    latest: payload.isLatest === true,
    source: role,
    body,
  });
  if (!tagged) return null;
  return `<current-turn hint="以下是当前这轮用户输入的时间锚点。若你需要判断时间先后、最近记忆与当前输入的关系，优先参考这一条。">\n${tagged}\n</current-turn>`;
}

export type ContextInjectionMemoryProvider = {
  getContextInjectionMemories(input: {
    limit: number;
    agentId?: string | null;
    includeSession: boolean;
    allowedCategories: MemoryCategory[];
  }): ContextInjectionMemoryLike[];
  getRecentTaskSummaries(limit: number, filter?: { agentId?: string }): RecentTaskSummaryLike[];
  search(
    query: string,
    input: {
      limit: number;
      filter: { agentId?: string | null };
      retrievalMode: "implicit";
    },
  ): Promise<AutoRecallMemoryLike[]>;
};

export type ContextInjectionConfig = {
  contextInjectionEnabled: boolean;
  contextInjectionLimit: number;
  contextInjectionIncludeSession: boolean;
  contextInjectionTaskLimit: number;
  contextInjectionAllowedCategories: MemoryCategory[];
  autoRecallEnabled: boolean;
  autoRecallLimit: number;
  autoRecallMinScore: number;
  autoRecallTimeoutMs?: number;
};

export async function buildContextInjectionPrelude(
  memoryManager: ContextInjectionMemoryProvider,
  event: BeforeAgentStartEvent,
  ctx: HookAgentContext,
  config: ContextInjectionConfig,
): Promise<BeforeAgentStartResult | undefined> {
  const implicitFilter = { agentId: ctx.agentId ?? null };
  const deduper = createContextInjectionDeduper(event.messages);
  const blocks: string[] = [];
  const currentTurnBlock = extractCurrentMessageBlock(event.meta, event.userInput);
  if (currentTurnBlock) {
    blocks.push(currentTurnBlock);
  }

  if (config.contextInjectionEnabled) {
    const recent = memoryManager.getContextInjectionMemories({
      limit: config.contextInjectionLimit,
      agentId: ctx.agentId ?? null,
      includeSession: config.contextInjectionIncludeSession,
      allowedCategories: config.contextInjectionAllowedCategories,
    });
    if (recent.length > 0) {
      const latestUpdatedAt = recent.reduce((latest, item) => {
        const updatedAt = item.updatedAt ? Date.parse(item.updatedAt) : Number.NaN;
        if (!Number.isFinite(updatedAt)) return latest;
        return updatedAt > latest ? updatedAt : latest;
      }, Number.NEGATIVE_INFINITY);
      const lines = recent.flatMap((item) => {
        if (!deduper.shouldIncludeMemory(item)) {
          return [];
        }
        const src = item.sourcePath.split(/[/\\]/).pop() ?? item.sourcePath;
        const label = [item.importance, item.category ?? item.memoryType ?? "memory", src].join("|");
        const body = String(item.summary ?? item.snippet ?? "").trim();
        const time = formatLocalTimeLabel(item.updatedAt);
        const latest = Number.isFinite(latestUpdatedAt) && item.updatedAt ? Date.parse(item.updatedAt) === latestUpdatedAt : false;
        const tagged = buildTaggedLine({
          time,
          latest,
          source: "memory",
          body: `[${label}] ${body}`,
        });
        return tagged ? [tagged] : [];
      });
      if (lines.length > 0) {
        blocks.push(
          `<recent-memory hint="以下是按重要性筛选后的近期记忆。优先把它们当作背景约束或已知事实，不要把它们直接当作待重新执行的任务。">\n${lines.join("\n")}\n</recent-memory>`,
        );
      }
    }

    if (config.contextInjectionTaskLimit > 0) {
      const recentTasks = memoryManager.getRecentTaskSummaries(config.contextInjectionTaskLimit, {
        agentId: ctx.agentId,
      });
      if (recentTasks.length > 0) {
        const latestFinishedAt = recentTasks.reduce((latest, task) => {
          const finishedAt = task.finishedAt ? Date.parse(task.finishedAt) : Number.NaN;
          const updatedAt = task.updatedAt ? Date.parse(task.updatedAt) : Number.NaN;
          const candidate = Number.isFinite(finishedAt) ? finishedAt : updatedAt;
          if (!Number.isFinite(candidate)) return latest;
          return candidate > latest ? candidate : latest;
        }, Number.NEGATIVE_INFINITY);
        const taskLines = recentTasks.flatMap((task) => {
          if (!deduper.shouldIncludeTask(task)) {
            return [];
          }
          const title = task.title ?? task.objective ?? task.summary ?? task.taskId ?? "task";
          const tools = (task.toolNames ?? []).slice(0, 3).join(", ");
          const artifacts = (task.artifactPaths ?? []).slice(0, 2).join(", ");
          const extras = [
            tools ? `tools=${tools}` : "",
            artifacts ? `artifacts=${artifacts}` : "",
          ].filter(Boolean).join("; ");
          const body = extras
            ? `${title} (${extras})`
            : title;
          const timeSource = task.finishedAt ?? task.updatedAt;
          const time = formatLocalTimeLabel(timeSource);
          const latest = Number.isFinite(latestFinishedAt) && timeSource ? Date.parse(timeSource) === latestFinishedAt : false;
          const tagged = buildTaggedLine({
            time,
            latest,
            source: "task",
            body,
          });
          return tagged ? [tagged] : [];
        });
        if (taskLines.length > 0) {
          blocks.push(
            `<recent-tasks hint="以下是最近已完成或部分完成的任务摘要。若当前目标与其相同，优先复用结果，不要重复执行已成功完成的工具动作，除非用户明确要求重试。">\n${taskLines.join("\n")}\n</recent-tasks>`,
          );
        }
      }
    }
  }

  if (config.autoRecallEnabled) {
    const queryText = event.userInput?.trim() || event.prompt?.trim();
    if (queryText) {
      const results = await Promise.race([
        memoryManager.search(queryText, {
          limit: config.autoRecallLimit,
          filter: implicitFilter,
          retrievalMode: "implicit",
        }),
        new Promise<AutoRecallMemoryLike[]>((resolve) => setTimeout(() => resolve([]), config.autoRecallTimeoutMs ?? 2000)),
      ]);

      const filtered = results.filter((item) => item.score >= config.autoRecallMinScore);
      if (filtered.length > 0) {
        const latestUpdatedAt = filtered.reduce((latest, item) => {
          const updatedAt = item.updatedAt ? Date.parse(item.updatedAt) : Number.NaN;
          if (!Number.isFinite(updatedAt)) return latest;
          return updatedAt > latest ? updatedAt : latest;
        }, Number.NEGATIVE_INFINITY);
        const lines = filtered.flatMap((item) => {
          if (!deduper.shouldIncludeMemory(item)) {
            return [];
          }
          const src = item.sourcePath.split(/[/\\]/).pop() ?? item.sourcePath;
          const snippet = item.snippet.length > 200
            ? `${item.snippet.slice(0, 200)}...`
            : item.snippet;
          const time = formatLocalTimeLabel(item.updatedAt);
          const latest = Number.isFinite(latestUpdatedAt) && item.updatedAt ? Date.parse(item.updatedAt) === latestUpdatedAt : false;
          const tagged = buildTaggedLine({
            time,
            latest,
            source: "memory",
            body: `[${src}, score=${item.score.toFixed(2)}] ${snippet}`,
          });
          return tagged ? [tagged] : [];
        });
        if (lines.length > 0) {
          blocks.push(
            `<auto-recall hint="以下是与用户当前输入语义相关的历史记忆，仅供参考。无需再次调用 memory_search 除非需要更深入搜索。">\n${lines.join("\n")}\n</auto-recall>`,
          );
        }
      }
    }
  }

  return blocks.length > 0
    ? { prependContext: blocks.join("\n\n") }
    : undefined;
}
