import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  DEFAULT_STATE_DIR_BASENAME,
  LEGACY_STATE_DIR_BASENAME,
  resolveDefaultStateDir,
  resolveStateDir,
  resolveWorkspaceStateDir,
} from "./state-dir.js";

describe("state-dir helpers", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    await Promise.all(tempDirs.map((dir) => fs.rm(dir, { recursive: true, force: true })));
    tempDirs.length = 0;
  });

  async function makeTempHome(): Promise<string> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "state-dir-"));
    tempDirs.push(dir);
    return dir;
  }

  it("prefers explicit BELLDANDY_STATE_DIR", async () => {
    const homeDir = await makeTempHome();
    const explicit = path.join(homeDir, "custom-state");
    const env = { BELLDANDY_STATE_DIR: explicit } as NodeJS.ProcessEnv;
    expect(resolveStateDir(env, { homeDir })).toBe(explicit);
  });

  it("prefers BELLDANDY_STATE_DIR_WINDOWS on Windows", async () => {
    const homeDir = await makeTempHome();
    const explicit = path.join(homeDir, "windows-state");
    const env = {
      BELLDANDY_STATE_DIR: path.join(homeDir, "fallback-state"),
      BELLDANDY_STATE_DIR_WINDOWS: explicit,
    } as NodeJS.ProcessEnv;
    expect(resolveStateDir(env, { homeDir, platform: "win32" })).toBe(explicit);
  });

  it("prefers BELLDANDY_STATE_DIR_WSL inside WSL", async () => {
    const homeDir = await makeTempHome();
    const explicit = path.join(homeDir, "wsl-state");
    const env = {
      BELLDANDY_STATE_DIR: path.join(homeDir, "fallback-state"),
      BELLDANDY_STATE_DIR_WSL: explicit,
      WSL_DISTRO_NAME: "Ubuntu",
    } as NodeJS.ProcessEnv;
    expect(resolveStateDir(env, { homeDir, platform: "linux" })).toBe(explicit);
  });

  it("expands tilde for explicit state directory overrides", async () => {
    const homeDir = await makeTempHome();
    const env = { BELLDANDY_STATE_DIR: "~/.star_sanctuary" } as NodeJS.ProcessEnv;
    expect(resolveStateDir(env, { homeDir })).toBe(path.join(homeDir, ".star_sanctuary"));
  });

  it("prefers new default directory when it exists", async () => {
    const homeDir = await makeTempHome();
    const nextDir = path.join(homeDir, DEFAULT_STATE_DIR_BASENAME);
    await fs.mkdir(nextDir, { recursive: true });
    expect(resolveDefaultStateDir({ homeDir })).toBe(nextDir);
  });

  it("falls back to legacy directory when only legacy exists", async () => {
    const homeDir = await makeTempHome();
    const legacyDir = path.join(homeDir, LEGACY_STATE_DIR_BASENAME);
    await fs.mkdir(legacyDir, { recursive: true });
    expect(resolveDefaultStateDir({ homeDir })).toBe(legacyDir);
  });

  it("defaults to new directory when no state directory exists", async () => {
    const homeDir = await makeTempHome();
    expect(resolveDefaultStateDir({ homeDir })).toBe(path.join(homeDir, DEFAULT_STATE_DIR_BASENAME));
  });

  it("resolves workspace-local state directory with legacy fallback", async () => {
    const workspaceRoot = await makeTempHome();
    const legacyDir = path.join(workspaceRoot, LEGACY_STATE_DIR_BASENAME);
    await fs.mkdir(legacyDir, { recursive: true });
    expect(resolveWorkspaceStateDir(workspaceRoot)).toBe(legacyDir);
  });
});
