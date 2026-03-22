import { describe, expect, it } from "vitest";

import { buildContextInjectionPrelude, type ContextInjectionMemoryProvider } from "./context-injection.js";

describe("buildContextInjectionPrelude", () => {
  it("keeps distinct memories across recent-memory and auto-recall while removing duplicates already present in history", async () => {
    const duplicateFromHistory = "Release memory marker: gateway retry window 20 minutes; avoid duplicate webhook execution.";
    const recentDistinct = "Release memory marker: gateway retry window 20 minutes; rotate tool transcript snapshots daily.";
    const autoRecallDistinct = "Release memory marker: gateway retry window 45 minutes; rotate tool transcript snapshots weekly.";

    const memoryManager: ContextInjectionMemoryProvider = {
      getContextInjectionMemories: () => [
        {
          id: "mem-history-dup",
          sourcePath: "memory/release-policy.md",
          summary: duplicateFromHistory,
          snippet: duplicateFromHistory,
          importance: "high",
          category: "decision",
          memoryType: "other",
        },
        {
          id: "mem-recent-distinct",
          sourcePath: "memory/release-policy.md",
          summary: recentDistinct,
          snippet: recentDistinct,
          importance: "high",
          category: "decision",
          memoryType: "other",
        },
      ],
      getRecentTaskSummaries: () => [],
      search: async () => [
        {
          id: "mem-history-dup",
          sourcePath: "memory/release-policy.md",
          snippet: duplicateFromHistory,
          score: 0.98,
        },
        {
          id: "mem-auto-distinct",
          sourcePath: "memory/release-policy.md",
          snippet: autoRecallDistinct,
          score: 0.91,
        },
      ],
    };

    const result = await buildContextInjectionPrelude(
      memoryManager,
      {
        prompt: "继续优化网关重试和 transcript 策略",
        userInput: "继续优化网关重试和 transcript 策略",
        messages: [
          {
            role: "assistant",
            content: duplicateFromHistory,
          },
        ],
      },
      {
        agentId: "default",
        sessionKey: "conv-context-injection",
      },
      {
        contextInjectionEnabled: true,
        contextInjectionLimit: 5,
        contextInjectionIncludeSession: false,
        contextInjectionTaskLimit: 0,
        contextInjectionAllowedCategories: ["decision", "fact"],
        autoRecallEnabled: true,
        autoRecallLimit: 5,
        autoRecallMinScore: 0.3,
        autoRecallTimeoutMs: 50,
      },
    );

    expect(result?.prependContext).toContain("<recent-memory");
    expect(result?.prependContext).toContain("<auto-recall");
    expect(result?.prependContext).toContain(recentDistinct);
    expect(result?.prependContext).toContain(autoRecallDistinct);
    expect(result?.prependContext).not.toContain(duplicateFromHistory);
  });
});
