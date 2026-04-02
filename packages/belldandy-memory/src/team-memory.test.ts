import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import { afterEach, describe, expect, it } from "vitest";

import {
  buildTeamSharedMemoryReadinessReport,
  getTeamSharedMemoryRoot,
  guardTeamSharedMemoryWrite,
  isTeamSharedMemoryRelativePath,
  resolveTeamSharedMemoryEntryPath,
  scanTeamSharedMemorySecrets,
} from "./team-memory.js";

describe("team shared memory readiness", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true }).catch(() => {})));
    tempDirs.length = 0;
  });

  it("resolves repo-local team memory paths under stateDir", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-team-memory-"));
    tempDirs.push(stateDir);

    expect(isTeamSharedMemoryRelativePath("team-memory/MEMORY.md")).toBe(true);
    expect(isTeamSharedMemoryRelativePath("team-memory/memory/2026-04-02.md")).toBe(true);
    expect(isTeamSharedMemoryRelativePath("MEMORY.md")).toBe(false);

    expect(resolveTeamSharedMemoryEntryPath(stateDir, "team-memory/MEMORY.md")).toEqual({
      normalizedPath: "team-memory/MEMORY.md",
      teamMemoryPath: "MEMORY.md",
      absolutePath: path.join(getTeamSharedMemoryRoot(stateDir), "MEMORY.md"),
    });
    expect(resolveTeamSharedMemoryEntryPath(stateDir, "team-memory/../../secrets.txt")).toBeNull();
  });

  it("blocks secret-like content before writing to team shared memory", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-team-memory-"));
    tempDirs.push(stateDir);

    expect(scanTeamSharedMemorySecrets("token=ghp_123456789012345678901234567890123456")).toEqual([
      { ruleId: "github-pat", label: "GitHub PAT" },
    ]);

    const blocked = guardTeamSharedMemoryWrite({
      stateDir,
      relativePath: "team-memory/MEMORY.md",
      content: "请记住这个 token: ghp_123456789012345678901234567890123456",
    });
    expect(blocked).toMatchObject({
      applies: true,
      ok: false,
      code: "secret_detected",
    });

    const allowed = guardTeamSharedMemoryWrite({
      stateDir,
      relativePath: "team-memory/memory/2026-04-02.md",
      content: "团队约定：共享记忆只记录稳定项目入口和协作事实。",
    });
    expect(allowed).toMatchObject({
      applies: true,
      ok: true,
      normalizedPath: "team-memory/memory/2026-04-02.md",
      teamMemoryPath: "memory/2026-04-02.md",
    });
  });

  it("builds readiness report with local path scope and deferred sync policy", async () => {
    const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-team-memory-"));
    tempDirs.push(stateDir);
    const teamRoot = getTeamSharedMemoryRoot(stateDir);
    await fs.mkdir(path.join(teamRoot, "memory"), { recursive: true });
    await fs.writeFile(path.join(teamRoot, "MEMORY.md"), "# Shared\n", "utf-8");
    await fs.writeFile(path.join(teamRoot, "memory", "2026-04-02.md"), "# 2026-04-02\n", "utf-8");

    const report = await buildTeamSharedMemoryReadinessReport({
      stateDir,
      enabled: true,
    });

    expect(report).toMatchObject({
      enabled: true,
      available: true,
      reasonCodes: [],
      scope: {
        relativeRoot: "team-memory",
        rootPath: teamRoot,
        fileCount: 2,
        hasMainMemory: true,
        dailyCount: 1,
      },
      secretGuard: {
        enabled: true,
        scanner: "curated-high-confidence",
      },
      syncPolicy: {
        status: "planned",
        deltaSync: {
          enabled: true,
          mode: "checksum-delta",
        },
        conflictPolicy: {
          mode: "local-write-wins-per-entry",
          maxConflictRetries: 2,
        },
        deletionPolicy: {
          propagatesDeletes: false,
        },
        suppressionPolicy: {
          enabled: true,
        },
      },
    });
  });
});
