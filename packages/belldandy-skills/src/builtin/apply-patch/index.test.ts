import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyPatchTool } from "./index.js";
import type { ToolContext } from "../../types.js";

describe("apply_patch tool", () => {
  let tempDir: string;
  let baseContext: ToolContext;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-apply-patch-"));
    baseContext = {
      conversationId: "test-conversation",
      workspaceRoot: tempDir,
      policy: {
        allowedPaths: [],
        deniedPaths: ["node_modules", ".git"],
        allowedDomains: [],
        deniedDomains: [],
        maxTimeoutMs: 30_000,
        maxResponseBytes: 1024 * 1024,
      },
    };
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("should allow writing workspace root files when allowedPaths contains dot", async () => {
    const result = await applyPatchTool.execute(
      {
        input: [
          "*** Begin Patch",
          "*** Add File: TOOLS.md",
          "+hello from root",
          "*** End Patch",
        ].join("\n"),
      },
      {
        ...baseContext,
        policy: {
          ...baseContext.policy,
          allowedPaths: ["."],
        },
      },
    );

    expect(result.success).toBe(true);
    await expect(fs.readFile(path.join(tempDir, "TOOLS.md"), "utf-8")).resolves.toBe("hello from root\n");
  });

  it("should still reject files outside whitelist", async () => {
    const result = await applyPatchTool.execute(
      {
        input: [
          "*** Begin Patch",
          "*** Add File: docs/TOOLS.md",
          "+forbidden",
          "*** End Patch",
        ].join("\n"),
      },
      {
        ...baseContext,
        policy: {
          ...baseContext.policy,
          allowedPaths: ["output"],
        },
      },
    );

    expect(result.success).toBe(false);
    expect(result.error).toContain("白名单");
  });

  it("should reject move targets outside allowedPaths whitelist", async () => {
    await fs.mkdir(path.join(tempDir, "allowed"), { recursive: true });
    await fs.writeFile(path.join(tempDir, "allowed", "source.txt"), "hello\n", "utf-8");

    const restrictedResult = await applyPatchTool.execute(
      {
        input: [
          "*** Begin Patch",
          "*** Update File: allowed/source.txt",
          "*** Move to: blocked/moved.txt",
          "@@",
          "-hello",
          "+hello moved",
          "*** End Patch",
        ].join("\n"),
      },
      {
        ...baseContext,
        policy: {
          ...baseContext.policy,
          allowedPaths: ["allowed"],
        },
      },
    );

    expect(restrictedResult.success).toBe(false);
    expect(restrictedResult.error).toContain("白名单");
  });

  it("should allow absolute paths under extraWorkspaceRoots", async () => {
    const extraRoot = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-apply-patch-extra-"));
    const targetPath = path.join(extraRoot, "nested", "TOOLS.md").replace(/\\/g, "/");

    try {
      const result = await applyPatchTool.execute(
        {
          input: [
            "*** Begin Patch",
            `*** Add File: ${targetPath}`,
            "+hello extra root",
            "*** End Patch",
          ].join("\n"),
        },
        {
          ...baseContext,
          extraWorkspaceRoots: [extraRoot],
          policy: {
            ...baseContext.policy,
            allowedPaths: ["."],
          },
        },
      );

      expect(result.success).toBe(true);
      await expect(fs.readFile(path.join(extraRoot, "nested", "TOOLS.md"), "utf-8")).resolves.toBe("hello extra root\n");
    } finally {
      await fs.rm(extraRoot, { recursive: true, force: true });
    }
  });
});
