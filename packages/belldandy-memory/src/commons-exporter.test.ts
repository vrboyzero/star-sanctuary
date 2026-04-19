import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { writeObsidianCommonsExport } from "./commons-exporter.js";

describe("commons exporter", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true }).catch(() => {})));
    tempDirs.length = 0;
  });

  it("writes approved and revoked shared memory notes plus commons indexes", async () => {
    const vaultDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-commons-export-"));
    tempDirs.push(vaultDir);

    const result = await writeObsidianCommonsExport({
      mirror: {
        enabled: true,
        vaultPath: vaultDir,
      },
      approvedItems: [{
        sharedChunkId: "shared:coder:abc",
        sourceAgentId: "coder",
        sourceChunkId: "private-1",
        sourcePath: "memory/coder.md",
        sharedStatus: "approved",
        sharedReviewedAt: "2026-04-19T12:00:00.000Z",
        reviewerAgentId: "reviewer",
        decisionNote: "looks reusable",
        reason: "cross-agent reuse",
        category: "decision",
        memoryType: "other",
        topic: "dream-runtime",
        summary: "Dream runtime closed loop is stable.",
        snippet: "Dream runtime closed loop is stable.",
        content: "Dream runtime closed loop is stable and ready for reuse.",
      }],
      revokedItems: [{
        sharedChunkId: "shared:default:def",
        sourceAgentId: "default",
        sourceChunkId: "private-2",
        sourcePath: "memory/default.md",
        sharedStatus: "revoked",
        sharedReviewedAt: "2026-04-19T13:00:00.000Z",
        reviewerAgentId: "reviewer-2",
        decisionNote: "stale",
        reason: "stale memory",
        category: "fact",
        memoryType: "other",
        topic: "shared-memory",
        summary: "This memory was revoked.",
        snippet: "This memory was revoked.",
      }],
      agentIds: ["default", "coder"],
      now: () => new Date("2026-04-19T14:00:00.000Z"),
    });

    expect(result.approvedCount).toBe(1);
    expect(result.revokedCount).toBe(1);

    const approvedPath = path.join(vaultDir, "Star Sanctuary", "Commons", "Shared-Memory", "approved", "coder--shared-coder-abc.md");
    const revokedPath = path.join(vaultDir, "Star Sanctuary", "Commons", "Shared-Memory", "revoked", "default--shared-default-def.md");
    const indexPath = path.join(vaultDir, "Star Sanctuary", "Commons", "INDEX.md");
    const coderPagePath = path.join(vaultDir, "Star Sanctuary", "Commons", "Agents", "coder.md");

    const approvedContent = await fs.readFile(approvedPath, "utf-8");
    const revokedContent = await fs.readFile(revokedPath, "utf-8");
    const indexContent = await fs.readFile(indexPath, "utf-8");
    const coderPageContent = await fs.readFile(coderPagePath, "utf-8");

    expect(approvedContent).toContain("shared_status: \"approved\"");
    expect(approvedContent).toContain("Dream runtime closed loop is stable and ready for reuse.");
    expect(revokedContent).toContain("shared_status: \"revoked\"");
    expect(indexContent).toContain("Approved Shared Memory Count: 1");
    expect(indexContent).toContain("[coder](Agents/coder.md)");
    expect(coderPageContent).toContain("Dream runtime closed loop is stable.");
  });
});
