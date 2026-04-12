import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, expect, test } from "vitest";

import { reconcileSetupCommunityApiConflict } from "./setup.js";

const tempDirs = new Set<string>();

async function createEnvDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-setup-"));
  tempDirs.add(dir);
  return {
    dir,
    envPath: path.join(dir, ".env"),
    envLocalPath: path.join(dir, ".env.local"),
  };
}

afterEach(async () => {
  for (const dir of tempDirs) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  tempDirs.clear();
});

test("bdd setup disables community http api when auth mode is set to none", async () => {
  const { envPath, envLocalPath } = await createEnvDir();
  await fs.writeFile(envPath, "BELLDANDY_COMMUNITY_API_ENABLED=true\n", "utf-8");
  await fs.writeFile(
    envLocalPath,
    [
      "BELLDANDY_COMMUNITY_API_TOKEN=community-secret",
      "BELLDANDY_OPENAI_MODEL=gpt-test",
    ].join("\n"),
    "utf-8",
  );

  const notes = reconcileSetupCommunityApiConflict({
    envPath,
    envLocalPath,
    authMode: "none",
  });

  const envLocalContent = await fs.readFile(envLocalPath, "utf-8");
  expect(notes).toEqual([
    "Detected AUTH_MODE=none during setup; disabled Community HTTP API in .env.local to avoid an invalid auth/community combination.",
  ]);
  expect(envLocalContent).toContain("BELLDANDY_COMMUNITY_API_ENABLED=false");
  expect(envLocalContent).not.toContain("BELLDANDY_COMMUNITY_API_TOKEN=community-secret");
  expect(envLocalContent).toContain("BELLDANDY_OPENAI_MODEL=gpt-test");
});

test("bdd setup keeps existing community config unchanged when auth mode stays authenticated", async () => {
  const { envPath, envLocalPath } = await createEnvDir();
  await fs.writeFile(envPath, "BELLDANDY_COMMUNITY_API_ENABLED=true\n", "utf-8");
  await fs.writeFile(
    envLocalPath,
    [
      "BELLDANDY_COMMUNITY_API_ENABLED=true",
      "BELLDANDY_COMMUNITY_API_TOKEN=community-secret",
    ].join("\n"),
    "utf-8",
  );
  const before = await fs.readFile(envLocalPath, "utf-8");

  const notes = reconcileSetupCommunityApiConflict({
    envPath,
    envLocalPath,
    authMode: "token",
  });

  const after = await fs.readFile(envLocalPath, "utf-8");
  expect(notes).toEqual([]);
  expect(after).toBe(before);
});
