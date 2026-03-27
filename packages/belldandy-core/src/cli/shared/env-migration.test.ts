import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, expect, test } from "vitest";

import { migrateEnvFilesToStateDir } from "./env-migration.js";

const tempDirs = new Set<string>();

async function createTempDir(prefix: string): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  tempDirs.add(dir);
  return dir;
}

afterEach(async () => {
  for (const dir of tempDirs) {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
  tempDirs.clear();
});

test("migrateEnvFilesToStateDir copies files to state dir and backs up project-root sources", async () => {
  const sourceEnvDir = await createTempDir("star-env-source-");
  const targetEnvDir = await createTempDir("star-env-target-");
  await fs.writeFile(path.join(sourceEnvDir, ".env"), "BELLDANDY_AUTH_MODE=none\n", "utf-8");
  await fs.writeFile(path.join(sourceEnvDir, ".env.local"), "BELLDANDY_OPENAI_API_KEY=test\n", "utf-8");

  const result = await migrateEnvFilesToStateDir({
    sourceEnvDir,
    targetEnvDir,
    backupSuffix: "test-backup",
  });

  expect(result.status).toBe("migrated");
  await expect(fs.readFile(path.join(targetEnvDir, ".env"), "utf-8")).resolves.toContain("BELLDANDY_AUTH_MODE=none");
  await expect(fs.readFile(path.join(targetEnvDir, ".env.local"), "utf-8")).resolves.toContain("BELLDANDY_OPENAI_API_KEY=test");
  await expect(fs.readFile(path.join(sourceEnvDir, ".env.migrated-to-state-dir.test-backup.bak"), "utf-8")).resolves.toContain("BELLDANDY_AUTH_MODE=none");
  await expect(fs.readFile(path.join(sourceEnvDir, ".env.local.migrated-to-state-dir.test-backup.bak"), "utf-8")).resolves.toContain("BELLDANDY_OPENAI_API_KEY=test");
});

test("migrateEnvFilesToStateDir aborts on conflicting target content", async () => {
  const sourceEnvDir = await createTempDir("star-env-source-");
  const targetEnvDir = await createTempDir("star-env-target-");
  await fs.writeFile(path.join(sourceEnvDir, ".env"), "BELLDANDY_AUTH_MODE=none\n", "utf-8");
  await fs.writeFile(path.join(targetEnvDir, ".env"), "BELLDANDY_AUTH_MODE=token\n", "utf-8");

  const result = await migrateEnvFilesToStateDir({
    sourceEnvDir,
    targetEnvDir,
    backupSuffix: "conflict-backup",
  });

  expect(result.status).toBe("conflict");
  expect(result.conflicts).toHaveLength(1);
  await expect(fs.readFile(path.join(sourceEnvDir, ".env"), "utf-8")).resolves.toContain("BELLDANDY_AUTH_MODE=none");
});

test("migrateEnvFilesToStateDir backs up source when target already has identical content", async () => {
  const sourceEnvDir = await createTempDir("star-env-source-");
  const targetEnvDir = await createTempDir("star-env-target-");
  const content = "BELLDANDY_OPENAI_API_KEY=test\n";
  await fs.writeFile(path.join(sourceEnvDir, ".env.local"), content, "utf-8");
  await fs.writeFile(path.join(targetEnvDir, ".env.local"), content, "utf-8");

  const result = await migrateEnvFilesToStateDir({
    sourceEnvDir,
    targetEnvDir,
    backupSuffix: "same-backup",
  });

  expect(result.status).toBe("migrated");
  expect(result.unchanged).toContain(path.join(targetEnvDir, ".env.local"));
  await expect(fs.readFile(path.join(sourceEnvDir, ".env.local.migrated-to-state-dir.same-backup.bak"), "utf-8")).resolves.toBe(content);
});

test("migrateEnvFilesToStateDir no-ops when source and target are the same directory", async () => {
  const envDir = await createTempDir("star-env-same-");

  const result = await migrateEnvFilesToStateDir({
    sourceEnvDir: envDir,
    targetEnvDir: envDir,
  });

  expect(result.status).toBe("already_target");
});
