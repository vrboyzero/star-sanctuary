import { afterEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { mkdtempSync } from "node:fs";
import { readMemoryFile, writeMemoryFile } from "./memory-files.js";

describe("memory-files", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop()!;
      await fs.rm(dir, { recursive: true, force: true });
    }
  });

  it("should write and read a daily memory file with header", async () => {
    const workspaceDir = mkdtempSync(path.join(os.tmpdir(), "belldandy-memory-files-"));
    tempDirs.push(workspaceDir);

    const absPath = await writeMemoryFile({
      workspaceDir,
      relPath: "memory/2026-03-15.md",
      content: "- 记录一条测试记忆",
      mode: "overwrite",
    });

    expect(absPath.endsWith(path.join("memory", "2026-03-15.md"))).toBe(true);

    const result = await readMemoryFile({
      workspaceDir,
      relPath: "memory/2026-03-15.md",
    });

    expect(result.text).toContain("# 2026-03-15");
    expect(result.text).toContain("- 记录一条测试记忆");
  });

  it("should reject non-memory paths", async () => {
    const workspaceDir = mkdtempSync(path.join(os.tmpdir(), "belldandy-memory-files-"));
    tempDirs.push(workspaceDir);

    await expect(writeMemoryFile({
      workspaceDir,
      relPath: "notes/test.md",
      content: "not allowed",
    })).rejects.toThrow("Path is not a memory file");
  });
});
