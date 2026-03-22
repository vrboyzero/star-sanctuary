import { describe, expect, it } from "vitest";

import { createContextInjectionDeduper } from "./context-injection-dedupe.js";

describe("createContextInjectionDeduper", () => {
  it("deduplicates the same memory chunk across recent-memory and auto-recall", () => {
    const deduper = createContextInjectionDeduper([]);

    expect(deduper.shouldIncludeMemory({
      id: "memory-1",
      sourcePath: "memory/project.md",
      summary: "Project decision marker: use gateway lock queue for retries.",
    })).toBe(true);

    expect(deduper.shouldIncludeMemory({
      id: "memory-1",
      sourcePath: "memory/project.md",
      snippet: "Project decision marker: use gateway lock queue for retries.",
    })).toBe(false);
  });

  it("skips memory injection when recent history tail already contains near-identical text", () => {
    const deduper = createContextInjectionDeduper([
      {
        role: "assistant",
        content: "Project decision marker: use gateway lock queue for retries and avoid duplicate webhook execution.",
      },
    ]);

    expect(deduper.shouldIncludeMemory({
      id: "memory-2",
      sourcePath: "memory/project.md",
      snippet: "Project decision marker: use gateway lock queue for retries and avoid duplicate webhook execution.",
    })).toBe(false);
  });

  it("skips recent task injection when its summary is already present in recent history", () => {
    const deduper = createContextInjectionDeduper([
      {
        role: "user",
        content: "We already finished the restart gateway task and reused the previous artifact output.",
      },
      {
        role: "assistant",
        content: "Confirmed. The restart gateway task finished successfully and the previous artifact output was reused.",
      },
    ]);

    expect(deduper.shouldIncludeTask({
      taskId: "task-1",
      summary: "restart gateway task finished successfully and the previous artifact output was reused",
    })).toBe(false);
  });

  it("extracts text parts from multimodal history for lightweight duplicate detection", () => {
    const deduper = createContextInjectionDeduper([
      {
        role: "user",
        content: [
          { type: "text", text: "Auto recall marker: moonshot fallback was already selected for this request." },
          { type: "image_url", image_url: { url: "data:image/png;base64,abc" } },
        ],
      },
    ]);

    expect(deduper.shouldIncludeMemory({
      id: "memory-3",
      sourcePath: "memory/fallback.md",
      snippet: "Auto recall marker: moonshot fallback was already selected for this request.",
    })).toBe(false);
  });

  it("keeps distinct memory and task items when content is not duplicated", () => {
    const deduper = createContextInjectionDeduper([
      { role: "assistant", content: "Earlier topic was about workspace roots, not memory indexing." },
    ]);

    expect(deduper.shouldIncludeMemory({
      id: "memory-4",
      sourcePath: "memory/indexing.md",
      summary: "Memory index rebuild should replace records transactionally.",
    })).toBe(true);

    expect(deduper.shouldIncludeTask({
      taskId: "task-2",
      summary: "refresh webhook diagnostics after memory index rebuild",
    })).toBe(true);
  });
});
