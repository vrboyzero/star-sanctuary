import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, expect, test } from "vitest";

import { ensureDefaultEnvFile } from "./env.js";

const tempDirs = new Set<string>();

async function createTempDir(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "star-env-bootstrap-"));
  tempDirs.add(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of tempDirs) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  tempDirs.clear();
});

test("ensureDefaultEnvFile creates a default .env for fresh installs", async () => {
  const envDir = await createTempDir();

  const result = ensureDefaultEnvFile(envDir);

  expect(result.created).toBe(true);
  const content = await fs.readFile(result.envPath, "utf-8");
  expect(content).toContain("BELLDANDY_AGENT_PROVIDER=openai");
  expect(content).toContain("BELLDANDY_AUTH_MODE=none");
  expect(content).toContain("BELLDANDY_TOKEN_USAGE_UPLOAD_ENABLED=false");
});

test("ensureDefaultEnvFile still creates .env when only .env.local exists", async () => {
  const envDir = await createTempDir();
  const envLocalPath = path.join(envDir, ".env.local");
  await fs.writeFile(envLocalPath, "BELLDANDY_OPENAI_API_KEY=test-key\n", "utf-8");

  const result = ensureDefaultEnvFile(envDir);

  expect(result.created).toBe(true);
  const content = await fs.readFile(result.envPath, "utf-8");
  expect(content).toContain("BELLDANDY_AUTH_MODE=none");
  const localContent = await fs.readFile(envLocalPath, "utf-8");
  expect(localContent).toBe("BELLDANDY_OPENAI_API_KEY=test-key\n");
});
