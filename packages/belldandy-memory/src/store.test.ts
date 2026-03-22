import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { MemoryStore } from "./store.js";
import type { MemoryChunk } from "./types.js";

describe("MemoryStore", () => {
  let rootDir: string;
  let dbPath: string;
  let store: MemoryStore;

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-memory-store-"));
    dbPath = path.join(rootDir, "memory.db");
    store = new MemoryStore(dbPath);
  });

  afterEach(async () => {
    store.close();
    await fs.rm(rootDir, { recursive: true, force: true }).catch(() => {});
  });

  it("rolls back replaceSourceChunks when a chunk write fails", () => {
    const sourcePath = "/tmp/atomic-source.md";

    store.upsertChunk({
      id: "old-1",
      sourcePath,
      sourceType: "file",
      memoryType: "other",
      content: "old content chunk one",
    });
    store.upsertChunk({
      id: "old-2",
      sourcePath,
      sourceType: "file",
      memoryType: "other",
      content: "old content chunk two",
    });

    const circularMetadata: { self?: unknown } = {};
    circularMetadata.self = circularMetadata;

    const replacementChunks: MemoryChunk[] = [
      {
        id: "new-1",
        sourcePath,
        sourceType: "file",
        memoryType: "other",
        content: "new content chunk one",
      },
      {
        id: "new-2",
        sourcePath,
        sourceType: "file",
        memoryType: "other",
        content: "new content chunk two",
        metadata: circularMetadata,
      },
    ];

    expect(() => store.replaceSourceChunks(sourcePath, replacementChunks)).toThrow();

    const remainingChunks = store.getChunksBySource(sourcePath, 10);

    expect(remainingChunks).toHaveLength(2);
    expect(remainingChunks.map((item) => item.id)).toEqual(["old-1", "old-2"]);
    expect(remainingChunks.every((item) => item.content?.includes("old content"))).toBe(true);
  });
});
