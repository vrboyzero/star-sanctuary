import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { MemoryManager } from "./manager.js";

describe("MemoryManager guardrails", () => {
  let rootDir: string;
  let stateDir: string;
  let sessionsDir: string;
  let docsDir: string;
  let manager: MemoryManager | null;

  beforeEach(async () => {
    rootDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-memory-manager-"));
    stateDir = path.join(rootDir, "state");
    sessionsDir = path.join(stateDir, "sessions");
    docsDir = path.join(rootDir, "docs");
    await fs.mkdir(sessionsDir, { recursive: true });
    await fs.mkdir(docsDir, { recursive: true });
    manager = null;
  });

  afterEach(async () => {
    manager?.close();
    await fs.rm(rootDir, { recursive: true, force: true }).catch(() => { });
  });

  it("indexes explicit MEMORY.md files and additional workspace roots", async () => {
    const stateMemoryPath = path.join(stateDir, "MEMORY.md");
    const extraDocPath = path.join(docsDir, "guide.md");
    await fs.writeFile(stateMemoryPath, "# Main Memory\nmarkerstateroot\n", "utf-8");
    await fs.writeFile(extraDocPath, "# Guide\nmarkerextraroot\n", "utf-8");

    manager = createManager({
      workspaceRoot: sessionsDir,
      stateDir,
      additionalRoots: [docsDir],
      additionalFiles: [stateMemoryPath],
    });

    await manager.indexWorkspace();

    const recent = manager.getRecent(10);

    expect(recent.some((item) => item.sourcePath === stateMemoryPath)).toBe(true);
    expect(recent.some((item) => item.sourcePath === extraDocPath)).toBe(true);
  });

  it("resolves relative memory source paths against stateDir roots for task linking", async () => {
    const stateMemoryPath = path.join(stateDir, "MEMORY.md");
    const dailyMemoryPath = path.join(stateDir, "memory", "2026-03-17.md");
    await fs.mkdir(path.dirname(dailyMemoryPath), { recursive: true });
    await fs.writeFile(stateMemoryPath, "# Main Memory\nstate root memory\n", "utf-8");
    await fs.writeFile(dailyMemoryPath, "# 2026-03-17\ndaily memory\n", "utf-8");

    manager = createManager({
      workspaceRoot: sessionsDir,
      stateDir,
      additionalRoots: [path.join(stateDir, "memory")],
      additionalFiles: [stateMemoryPath],
      taskMemoryEnabled: true,
    });

    await manager.indexWorkspace();

    expect(await manager.linkTaskMemoriesFromSource("conv-state-link", "MEMORY.md", "used")).toBeGreaterThan(0);
    expect(await manager.linkTaskMemoriesFromSource("conv-state-link", "memory/2026-03-17.md", "used")).toBeGreaterThan(0);
  });

  it("keeps explicit search available while implicit recall still skips greetings", async () => {
    const filePath = path.join(docsDir, "hello.md");
    await fs.writeFile(filePath, "# Greeting\nhello memory marker\n", "utf-8");

    manager = createManager({
      workspaceRoot: docsDir,
      stateDir,
    });

    await manager.indexWorkspace();

    const explicit = await manager.search("hello", { limit: 5 });
    const implicit = await manager.search("hello", { limit: 5, retrievalMode: "implicit" });

    expect(explicit.some((item) => item.sourcePath === filePath)).toBe(true);
    expect(implicit).toHaveLength(0);
  });

  it("preserves chunk and source visibility after reindex", async () => {
    const chunkFilePath = path.join(docsDir, "chunk-visibility.md");
    const sourceFilePath = path.join(docsDir, "source-visibility.md");
    const longChunkContent = [
      "# Chunk Visibility",
      "chunkvisibilitymarkera ".repeat(8),
      "chunkvisibilitymarkerb ".repeat(8),
      "chunkvisibilitymarkerc ".repeat(8),
    ].join("\n\n");
    await fs.writeFile(chunkFilePath, longChunkContent, "utf-8");
    await fs.writeFile(sourceFilePath, "# Source Visibility\nsourcevisibilitymarker\n", "utf-8");

    manager = createManager({
      workspaceRoot: docsDir,
      stateDir,
      indexerOptions: {
        chunkOptions: { maxLength: 80, overlap: 0 },
      },
    });

    await manager.indexWorkspace();

    const initialChunkRecords = (manager as any).store.getChunksBySource(chunkFilePath, 10);
    expect(initialChunkRecords.length).toBeGreaterThan(1);
    const chunk = initialChunkRecords[0];
    expect(chunk?.id).toBeTruthy();
    expect(manager.promoteMemoryChunk(chunk.id)?.visibility).toBe("shared");

    const sourcePromotion = manager.promoteMemorySource(sourceFilePath);
    expect(sourcePromotion.count).toBeGreaterThan(0);

    await manager.indexWorkspace();

    const reindexedChunk = manager.getMemory(chunk.id);
    const reindexedSource = (manager as any).store.getChunksBySource(sourceFilePath, 10);

    expect(reindexedChunk?.visibility).toBe("shared");
    expect(reindexedSource.every((item: { visibility?: string }) => item.visibility === "shared")).toBe(true);
  });

  it("ignores configured directories by path segment instead of substring", async () => {
    const ignoredDir = path.join(docsDir, "node_modules");
    const safeDir = path.join(docsDir, "project-node_modules-copy");
    const ignoredFile = path.join(ignoredDir, "ignore.md");
    const safeFile = path.join(safeDir, "keep.md");
    await fs.mkdir(ignoredDir, { recursive: true });
    await fs.mkdir(safeDir, { recursive: true });
    await fs.writeFile(ignoredFile, "ignored-marker", "utf-8");
    await fs.writeFile(safeFile, "keep-marker", "utf-8");

    manager = createManager({
      workspaceRoot: docsDir,
      stateDir,
      indexerOptions: {
        ignorePatterns: ["node_modules"],
      },
    });

    await manager.indexWorkspace();

    const recent = manager.getRecent(20);

    expect(recent.some((item) => item.sourcePath === safeFile)).toBe(true);
    expect(recent.some((item) => item.sourcePath === ignoredFile)).toBe(false);
  });
});

function createManager(options: ConstructorParameters<typeof MemoryManager>[0]): MemoryManager {
  const manager = new MemoryManager(options);
  (manager as any).embeddingProvider = {
    modelName: "test-memory-manager",
    embed: async () => [0.1],
    embedBatch: async (texts: string[]) => texts.map(() => [0.1]),
    embedQuery: async () => [0.1],
  };
  return manager;
}
