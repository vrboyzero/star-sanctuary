import crypto from "node:crypto";
import type { Tool, ToolCallResult, ToolCatalogEntry } from "../types.js";

export const TOOL_SEARCH_NAME = "tool_search";

type ToolSearchOptions = {
  getCatalogEntries: (conversationId?: string, agentId?: string) => ToolCatalogEntry[];
  loadDeferredTools: (conversationId: string, toolNames: string[]) => Promise<string[]>;
};

function scoreCatalogEntry(entry: ToolCatalogEntry, query: string): number {
  const lowerQuery = query.trim().toLowerCase();
  if (!lowerQuery) return 0;
  const haystacks = [
    entry.name.toLowerCase(),
    entry.shortDescription.toLowerCase(),
    entry.description.toLowerCase(),
    ...entry.keywords.map((item) => item.toLowerCase()),
    ...entry.tags.map((item) => item.toLowerCase()),
  ];

  let score = 0;
  for (const haystack of haystacks) {
    if (haystack === lowerQuery) score += 12;
    else if (haystack.includes(lowerQuery)) score += 6;
  }

  const queryTerms = lowerQuery.split(/\s+/).filter(Boolean);
  for (const term of queryTerms) {
    if (entry.name.toLowerCase().includes(term)) score += 4;
    if (entry.shortDescription.toLowerCase().includes(term)) score += 2;
    if (entry.keywords.some((item) => item.toLowerCase().includes(term))) score += 3;
    if (entry.tags.some((item) => item.toLowerCase().includes(term))) score += 2;
  }

  return score;
}

function formatEntries(entries: ToolCatalogEntry[]): string {
  if (entries.length === 0) {
    return "No matching tools found.";
  }

  return entries.map((entry) => {
    const suffix = entry.loaded ? "loaded" : entry.loadingMode;
    return `- ${entry.name} [${suffix}]: ${entry.shortDescription}`;
  }).join("\n");
}

export function createToolSearchTool(options: ToolSearchOptions): Tool {
  return {
    definition: {
      name: TOOL_SEARCH_NAME,
      description: "搜索当前可用工具；对 deferred tools 使用 select 可在下一轮把完整 schema 加载进上下文。",
      shortDescription: "搜索并加载延迟工具",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "按工具名、描述或关键词搜索工具",
          },
          select: {
            type: "array",
            description: "要立即加载的工具名列表；加载后下一轮可直接调用",
            items: { type: "string" },
          },
          maxResults: {
            type: "number",
            description: "返回结果上限，默认 8",
          },
        },
        required: [],
      },
      loadingMode: "core",
      keywords: ["tool", "search", "load", "schema", "deferred"],
      tags: ["runtime", "tooling"],
    },

    async execute(args, context): Promise<ToolCallResult> {
      const start = Date.now();
      const id = crypto.randomUUID();
      const conversationId = context.conversationId;
      const agentId = context.agentId;
      const allEntries = options.getCatalogEntries(conversationId, agentId);
      const query = typeof args.query === "string" ? args.query.trim() : "";
      const rawSelect = Array.isArray(args.select) ? args.select : [];
      const select = rawSelect
        .map((item) => typeof item === "string" ? item.trim() : "")
        .filter(Boolean);
      const maxResults = typeof args.maxResults === "number" && Number.isFinite(args.maxResults)
        ? Math.max(1, Math.min(20, Math.floor(args.maxResults)))
        : 8;

      const loaded = select.length > 0
        ? await options.loadDeferredTools(conversationId, select)
        : [];

      const matches = query
        ? allEntries
          .map((entry) => ({ entry, score: scoreCatalogEntry(entry, query) }))
          .filter((item) => item.score > 0)
          .sort((a, b) => b.score - a.score || a.entry.name.localeCompare(b.entry.name))
          .slice(0, maxResults)
          .map((item) => item.entry)
        : allEntries
          .filter((entry) => entry.loadingMode === "deferred")
          .slice(0, maxResults);

      const sections: string[] = [];
      if (loaded.length > 0) {
        sections.push(`Loaded tools for next turn:\n${loaded.map((name) => `- ${name}`).join("\n")}`);
      }
      sections.push(`Matches:\n${formatEntries(matches)}`);

      return {
        id,
        name: TOOL_SEARCH_NAME,
        success: true,
        output: sections.join("\n\n").trim(),
        durationMs: Date.now() - start,
      };
    },
  };
}
