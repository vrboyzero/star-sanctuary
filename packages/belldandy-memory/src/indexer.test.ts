import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { MemoryIndexer } from "./indexer.js";
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
    store.close();
    await fs.rm(rootDir, { recursive: true, force: true }).catch(() => {});
  });

  it("replaces existing source chunks on reindex instead of mixing old and new chunks", async () => {
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
});
