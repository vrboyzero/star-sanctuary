import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { syncDreamToObsidian } from "./dream-obsidian-sync.js";
import { resolveDreamObsidianMirrorPaths } from "./obsidian-sync-paths.js";
import type { DreamRecord } from "./dream-types.js";

describe("dream obsidian sync", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true }).catch(() => {})));
    tempDirs.length = 0;
  });

  it("resolves Obsidian private mirror paths inside vault", async () => {
    const vaultDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-obsidian-paths-"));
    tempDirs.push(vaultDir);

    const resolved = resolveDreamObsidianMirrorPaths({
      mirror: {
        enabled: true,
        vaultPath: vaultDir,
      },
      agentId: "coder/main",
      dreamBasename: "2026-04-19--dream-1.md",
      occurredAt: "2026-04-19T12:01:00.000Z",
    });

    expect(resolved.dreamPath).toBe(path.join(vaultDir, "Star Sanctuary", "Agents", "coder-main", "Dreams", "2026", "04", "2026-04-19--dream-1.md"));
    expect(resolved.indexPath).toBe(path.join(vaultDir, "Star Sanctuary", "Agents", "coder-main", "DREAM.md"));
    expect(resolved.relativeDreamPath).toBe("Star Sanctuary/Agents/coder-main/Dreams/2026/04/2026-04-19--dream-1.md");
  });

  it("writes mirrored dream note and index into Obsidian vault", async () => {
    const vaultDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-obsidian-sync-"));
    tempDirs.push(vaultDir);

    const record: DreamRecord = {
      id: "dream-1",
      agentId: "coder",
      status: "completed",
      triggerMode: "manual",
      requestedAt: "2026-04-19T12:00:00.000Z",
      finishedAt: "2026-04-19T12:01:00.000Z",
      dreamPath: "E:/state/default/dreams/2026/04/2026-04-19--dream-1.md",
      indexPath: "E:/state/default/DREAM.md",
    };

    const status = await syncDreamToObsidian({
      mirror: {
        enabled: true,
        vaultPath: vaultDir,
      },
      agentId: "coder",
      record,
      markdown: "# Agent Dream\n\nhello",
      indexMarkdown: "# DREAM\n",
      now: () => new Date("2026-04-19T12:02:00.000Z"),
    });

    expect(status.stage).toBe("synced");
    expect(status.targetPath).toBe(path.join(vaultDir, "Star Sanctuary", "Agents", "coder", "Dreams", "2026", "04", "2026-04-19--dream-1.md"));

    const dreamContent = await fs.readFile(status.targetPath!, "utf-8");
    const indexContent = await fs.readFile(path.join(vaultDir, "Star Sanctuary", "Agents", "coder", "DREAM.md"), "utf-8");
    expect(dreamContent).toContain("hello");
    expect(indexContent).toContain("# DREAM");
  });

  it("returns failed status when Obsidian sync is enabled but vault path is missing", async () => {
    const status = await syncDreamToObsidian({
      mirror: {
        enabled: true,
      },
      agentId: "coder",
      record: {
        id: "dream-2",
        agentId: "coder",
        status: "completed",
        triggerMode: "manual",
        requestedAt: "2026-04-19T12:00:00.000Z",
      },
      markdown: "# Agent Dream",
      indexMarkdown: "# DREAM",
      now: () => new Date("2026-04-19T12:03:00.000Z"),
    });

    expect(status.enabled).toBe(true);
    expect(status.stage).toBe("failed");
    expect(status.error).toContain("missing Obsidian vault path");
  });
});
