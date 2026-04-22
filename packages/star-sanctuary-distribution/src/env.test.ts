import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, expect, test } from "vitest";

import {
  ensureDefaultEnvFile,
  ensureDefaultEnvFiles,
  loadRuntimeEnvFiles,
  readDefaultEnvTemplates,
  resolveDefaultEnvTemplatePaths,
} from "./env.js";

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
  expect(content).toContain("BELLDANDY_AUTH_MODE=token");
  expect(content).toContain("BELLDANDY_ALLOWED_ORIGINS=http://127.0.0.1:28889");
});

test("ensureDefaultEnvFile still creates .env when only .env.local exists", async () => {
  const envDir = await createTempDir();
  const envLocalPath = path.join(envDir, ".env.local");
  await fs.writeFile(envLocalPath, "BELLDANDY_OPENAI_API_KEY=test-key\n", "utf-8");

  const result = ensureDefaultEnvFile(envDir);

  expect(result.created).toBe(true);
  const content = await fs.readFile(result.envPath, "utf-8");
  expect(content).toContain("BELLDANDY_AUTH_MODE=token");
  const localContent = await fs.readFile(envLocalPath, "utf-8");
  expect(localContent).toBe("BELLDANDY_OPENAI_API_KEY=test-key\n");
});

test("ensureDefaultEnvFiles creates both .env and .env.local for a fresh state dir", async () => {
  const envDir = await createTempDir();

  const result = ensureDefaultEnvFiles(envDir);

  expect(result.createdEnv).toBe(true);
  expect(result.createdEnvLocal).toBe(true);
  await expect(fs.readFile(result.envPath, "utf-8")).resolves.toContain("BELLDANDY_AGENT_PROVIDER=openai");
  const envLocalContent = await fs.readFile(result.envLocalPath, "utf-8");
  expect(envLocalContent).toContain("BELLDANDY_AGENT_PROVIDER=openai");
  expect(envLocalContent).toMatch(/BELLDANDY_AUTH_TOKEN=setup-[^\r\n]+/);
});

test("ensureDefaultEnvFiles only backfills the missing file", async () => {
  const envDir = await createTempDir();
  await fs.writeFile(path.join(envDir, ".env"), "BELLDANDY_PORT=9999\n", "utf-8");

  const result = ensureDefaultEnvFiles(envDir);

  expect(result.createdEnv).toBe(false);
  expect(result.createdEnvLocal).toBe(true);
  await expect(fs.readFile(result.envPath, "utf-8")).resolves.toBe("BELLDANDY_PORT=9999\n");
  const envLocalContent = await fs.readFile(result.envLocalPath, "utf-8");
  expect(envLocalContent).toContain("BELLDANDY_AGENT_PROVIDER=openai");
  expect(envLocalContent).toMatch(/BELLDANDY_AUTH_TOKEN=setup-[^\r\n]+/);
});

test("loadRuntimeEnvFiles preserves explicit base env values over .env defaults", async () => {
  const envDir = await createTempDir();
  await fs.writeFile(
    path.join(envDir, ".env"),
    [
      "BELLDANDY_HOST=127.0.0.1",
      "BELLDANDY_AGENT_PROVIDER=openai",
      "BELLDANDY_PORT=28889",
    ].join("\n"),
    "utf-8",
  );
  await fs.writeFile(
    path.join(envDir, ".env.local"),
    [
      "BELLDANDY_PORT=38889",
      "BELLDANDY_AUTH_MODE=token",
    ].join("\n"),
    "utf-8",
  );

  const env = loadRuntimeEnvFiles(
    {
      BELLDANDY_HOST: "0.0.0.0",
      BELLDANDY_AGENT_PROVIDER: "mock",
    },
    envDir,
  );

  expect(env.BELLDANDY_HOST).toBe("0.0.0.0");
  expect(env.BELLDANDY_AGENT_PROVIDER).toBe("mock");
  expect(env.BELLDANDY_PORT).toBe("38889");
  expect(env.BELLDANDY_AUTH_MODE).toBe("token");
});

test("default env template loader resolves template asset paths", () => {
  const templatePaths = resolveDefaultEnvTemplatePaths();
  const templates = readDefaultEnvTemplates();

  expect(templatePaths.envTemplatePath).toContain(path.join("default-env", "runtime.env"));
  expect(templatePaths.envLocalTemplatePath).toContain(path.join("default-env", "runtime.env.local"));
  expect(templates.env).toContain("BELLDANDY_AGENT_PROVIDER=openai");
  expect(templates.envLocal).toContain("BELLDANDY_AGENT_PROVIDER=openai");
});
