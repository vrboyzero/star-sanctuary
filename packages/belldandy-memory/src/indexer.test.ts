import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { MemoryIndexer, resolveVerboseWatchEvents } from "./indexer.js";
import { MemoryStore } from "./store.js";

describe("MemoryIndexer", () => {
  let rootDir: string;
  let dbPath: string;
  let filePath: string;
  let store: MemoryStore;
  let indexer: MemoryIndexer;

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-memory-indexer-"));
    dbPath = path.join(rootDir, "memory.db");
    filePath = path.join(rootDir, "guide.md");
    store = new MemoryStore(dbPath);
    indexer = new MemoryIndexer(store, {
      chunkOptions: {
        maxLength: 80,
        overlap: 0,
      },
    });
  });

  afterEach(async () => {
    await indexer.stopWatching();
    vi.restoreAllMocks();
    store.close();
    await fs.rm(rootDir, { recursive: true, force: true }).catch(() => {});
  });

  it("reindexes changed content even when mtime moves backward, without mixing old chunks", async () => {
    await fs.writeFile(
      filePath,
      [
        "# Guide",
        "old-marker-a ".repeat(12),
        "old-marker-b ".repeat(12),
        "old-marker-c ".repeat(12),
      ].join("\n\n"),
      "utf-8",
    );

    await indexer.indexFile(filePath);

    const initialChunks = store.getChunksBySource(filePath, 20);
    expect(initialChunks.length).toBeGreaterThan(1);
    expect(initialChunks.some((item) => item.content?.includes("old-marker"))).toBe(true);

    await fs.writeFile(
      filePath,
      [
        "# Guide",
        "new-marker-a ".repeat(12),
        "new-marker-b ".repeat(12),
      ].join("\n\n"),
      "utf-8",
    );

    await fs.utimes(filePath, new Date("2026-03-22T10:00:00.000Z"), new Date("2026-03-22T10:00:00.000Z"));
    await indexer.indexFile(filePath);

    const reindexedChunks = store.getChunksBySource(filePath, 20);

    expect(reindexedChunks.length).toBeGreaterThan(0);
    expect(reindexedChunks.every((item) => !item.content?.includes("old-marker"))).toBe(true);
    expect(reindexedChunks.some((item) => item.content?.includes("new-marker"))).toBe(true);
  });

  it("keeps watch event logging disabled by default", () => {
    expect(resolveVerboseWatchEvents(undefined, {} as NodeJS.ProcessEnv)).toBe(false);
    expect(resolveVerboseWatchEvents(undefined, { BELLDANDY_MEMORY_INDEXER_VERBOSE_WATCH: "true" } as NodeJS.ProcessEnv)).toBe(true);
    expect(resolveVerboseWatchEvents(false, { BELLDANDY_MEMORY_INDEXER_VERBOSE_WATCH: "true" } as NodeJS.ProcessEnv)).toBe(false);
  });

  it("coalesces repeated watch upsert events for the same file", async () => {
    vi.useFakeTimers();
    indexer = new MemoryIndexer(store, {
      watchDebounceMs: 40,
    });
    const indexSpy = vi.spyOn(indexer, "indexFile").mockResolvedValue();

    try {
      (indexer as any).scheduleWatchEvent(filePath, "upsert");
      (indexer as any).scheduleWatchEvent(filePath, "upsert");

      await vi.advanceTimersByTimeAsync(15);
      expect(indexSpy).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(20);
      expect(indexSpy).toHaveBeenCalledTimes(1);
      expect(indexSpy).toHaveBeenCalledWith(path.resolve(filePath));
    } finally {
      vi.useRealTimers();
    }
  });

  it("lets the latest watch event win when a file is removed after a pending reindex", async () => {
    vi.useFakeTimers();
    indexer = new MemoryIndexer(store, {
      watchDebounceMs: 40,
    });
    const indexSpy = vi.spyOn(indexer, "indexFile").mockResolvedValue();
    const deleteSpy = vi.spyOn(store, "deleteBySource");

    try {
      (indexer as any).scheduleWatchEvent(filePath, "upsert");
      (indexer as any).scheduleWatchEvent(filePath, "remove");

      await vi.advanceTimersByTimeAsync(40);

      expect(indexSpy).not.toHaveBeenCalled();
      expect(deleteSpy).toHaveBeenCalledTimes(1);
      expect(deleteSpy).toHaveBeenCalledWith(path.resolve(filePath));
    } finally {
      vi.useRealTimers();
    }
  });
});
