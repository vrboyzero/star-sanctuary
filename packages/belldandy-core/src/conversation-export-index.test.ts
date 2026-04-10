import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { expect, test } from "vitest";

import {
  getConversationArtifactExportRoot,
  pruneConversationArtifactExports,
  recordConversationArtifactExport,
} from "./conversation-export-index.js";

test("pruneConversationArtifactExports removes aged prompt snapshot exports and stale ledger entries", async () => {
  const stateDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-prompt-export-prune-"));
  const exportRoot = getConversationArtifactExportRoot({
    stateDir,
    artifact: "prompt_snapshot",
  });
  const oldFile = path.join(exportRoot, "old.prompt-snapshot.json");
  const newFile = path.join(exportRoot, "new.prompt-snapshot.json");
  const now = Date.now();
  const fiveDaysAgo = new Date(now - (5 * 24 * 60 * 60 * 1000));

  try {
    await fs.mkdir(exportRoot, { recursive: true });
    await fs.writeFile(oldFile, "old", "utf-8");
    await fs.writeFile(newFile, "new", "utf-8");
    await fs.utimes(oldFile, fiveDaysAgo, fiveDaysAgo);

    await recordConversationArtifactExport({
      stateDir,
      conversationId: "agent:default:main",
      artifact: "prompt_snapshot",
      format: "json",
      outputPath: oldFile,
    });
    await recordConversationArtifactExport({
      stateDir,
      conversationId: "agent:default:main",
      artifact: "prompt_snapshot",
      format: "json",
      outputPath: newFile,
    });

    await pruneConversationArtifactExports({
      stateDir,
      artifact: "prompt_snapshot",
      maxAgeDays: 3,
      now,
    });

    await expect(fs.access(oldFile)).rejects.toThrow();
    await expect(fs.access(newFile)).resolves.toBeUndefined();
    const ledger = JSON.parse(await fs.readFile(path.join(stateDir, "diagnostics", "conversation-export-index.json"), "utf-8"));
    expect(ledger.entries).toHaveLength(1);
    expect(ledger.entries[0].outputPath).toContain("new.prompt-snapshot.json");
  } finally {
    await fs.rm(stateDir, { recursive: true, force: true }).catch(() => {});
  }
});
