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
};

type RecentTaskSummaryLike = {
  taskId?: string;
  title?: string;
  objective?: string;
  summary?: string;
  status?: string;
  toolNames?: string[];
  artifactPaths?: string[];
};

type AutoRecallMemoryLike = {
  id?: string;
  sourcePath: string;
  snippet: string;
  score: number;
  summary?: string;
};

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

  if (config.contextInjectionEnabled) {
    const recent = memoryManager.getContextInjectionMemories({
      limit: config.contextInjectionLimit,
      agentId: ctx.agentId ?? null,
      includeSession: config.contextInjectionIncludeSession,
      allowedCategories: config.contextInjectionAllowedCategories,
    });
    if (recent.length > 0) {
      const lines = recent.flatMap((item) => {
        if (!deduper.shouldIncludeMemory(item)) {
          return [];
        }
        const src = item.sourcePath.split(/[/\\]/).pop() ?? item.sourcePath;
        const label = [item.importance, item.category ?? item.memoryType ?? "memory", src].join("|");
        const body = String(item.summary ?? item.snippet ?? "").trim();
        return body ? [`- [${label}] ${body}`] : [];
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
          return [extras
            ? `- [${task.status ?? "unknown"}] ${title} (${extras})`
            : `- [${task.status ?? "unknown"}] ${title}`];
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
        const lines = filtered.flatMap((item) => {
          if (!deduper.shouldIncludeMemory(item)) {
            return [];
          }
          const src = item.sourcePath.split(/[/\\]/).pop() ?? item.sourcePath;
          const snippet = item.snippet.length > 200
            ? `${item.snippet.slice(0, 200)}...`
            : item.snippet;
          return [`- [${src}, score=${item.score.toFixed(2)}] ${snippet}`];
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
