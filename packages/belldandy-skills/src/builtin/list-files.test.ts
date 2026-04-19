import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";

import type { ToolContext } from "../types.js";
import { listFilesTool } from "./list-files.js";

describe("list_files", () => {
  let tempDir: string;
  let homeDir: string;
  let stateDir: string;
  let baseContext: ToolContext;
  let previousHome: string | undefined;
  let previousUserProfile: string | undefined;
  let previousHomeDrive: string | undefined;
  let previousHomePath: string | undefined;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-list-files-"));
    homeDir = path.join(tempDir, "home");
    stateDir = path.join(homeDir, ".star_sanctuary");
    await fs.mkdir(stateDir, { recursive: true });
    previousHome = process.env.HOME;
    previousUserProfile = process.env.USERPROFILE;
    previousHomeDrive = process.env.HOMEDRIVE;
    previousHomePath = process.env.HOMEPATH;
    process.env.HOME = homeDir;
    process.env.USERPROFILE = homeDir;
    process.env.HOMEDRIVE = path.parse(homeDir).root.replace(/[\\/]+$/, "");
    process.env.HOMEPATH = homeDir.slice(path.parse(homeDir).root.length - 1).replace(/\//g, "\\");
    baseContext = {
      conversationId: "test-conv",
      workspaceRoot: stateDir,
      policy: {
        allowedPaths: [],
        deniedPaths: [".git", "node_modules"],
        allowedDomains: [],
        deniedDomains: [],
        maxTimeoutMs: 5000,
        maxResponseBytes: 1024 * 64,
      },
    };
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    if (previousHome === undefined) delete process.env.HOME;
    else process.env.HOME = previousHome;
    if (previousUserProfile === undefined) delete process.env.USERPROFILE;
    else process.env.USERPROFILE = previousUserProfile;
    if (previousHomeDrive === undefined) delete process.env.HOMEDRIVE;
    else process.env.HOMEDRIVE = previousHomeDrive;
    if (previousHomePath === undefined) delete process.env.HOMEPATH;
    else process.env.HOMEPATH = previousHomePath;
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it("expands ~/ paths under the allowed state directory", async () => {
    await fs.mkdir(path.join(stateDir, "canvas"), { recursive: true });
    await fs.writeFile(path.join(stateDir, "canvas", "board-a.json"), "{}", "utf-8");

    const result = await listFilesTool.execute({ path: "~/.star_sanctuary/canvas" }, baseContext);

    expect(result.success).toBe(true);
    const payload = JSON.parse(result.output) as { path: string; entries: Array<{ name: string; path: string; type: string }> };
    expect(payload.path).toBe("canvas");
    expect(payload.entries).toHaveLength(1);
    expect(payload.entries[0]).toMatchObject({
      name: "board-a.json",
      path: "canvas/board-a.json",
      type: "file",
    });
  });

  it("rejects ~/ paths when expanded home directory is outside allowed roots", async () => {
    const outsideContext: ToolContext = {
      ...baseContext,
      workspaceRoot: path.join(tempDir, "workspace"),
    };
    await fs.mkdir(outsideContext.workspaceRoot, { recursive: true });

    const result = await listFilesTool.execute({ path: "~/.star_sanctuary/canvas" }, outsideContext);

    expect(result.success).toBe(false);
    expect(result.error).toContain("越界");
  });
});
