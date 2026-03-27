import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, expect, test } from "vitest";

import { loadEnvFileIfExists, loadProjectEnvFiles } from "./env-loader.js";

const TRACKED_ENV_KEYS = [
  "BELLDANDY_AUTH_MODE",
  "BELLDANDY_AUTH_TOKEN",
  "BELLDANDY_PORT",
] as const;

const tempDirs = new Set<string>();

function snapshotTrackedEnv(): Record<string, string | undefined> {
  return Object.fromEntries(
    TRACKED_ENV_KEYS.map((key) => [key, process.env[key]]),
  );
}

function restoreTrackedEnv(snapshot: Record<string, string | undefined>) {
  for (const key of TRACKED_ENV_KEYS) {
    const value = snapshot[key];
    if (typeof value === "undefined") {
      delete process.env[key];
      continue;
    }
    process.env[key] = value;
  }
}

async function createEnvDir() {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-env-loader-"));
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

test(".env overrides launcher preset auth mode and token", async () => {
  const snapshot = snapshotTrackedEnv();
  const { envPath, envLocalPath } = await createEnvDir();

  try {
    process.env.BELLDANDY_AUTH_MODE = "token";
    process.env.BELLDANDY_AUTH_TOKEN = "setup-token";

    await fs.writeFile(
      envPath,
      [
        "BELLDANDY_AUTH_MODE=none",
        'BELLDANDY_AUTH_TOKEN="file-token"',
      ].join("\n"),
      "utf-8",
    );

    loadProjectEnvFiles({ envPath, envLocalPath });

    expect(process.env.BELLDANDY_AUTH_MODE).toBe("none");
    expect(process.env.BELLDANDY_AUTH_TOKEN).toBe("file-token");
  } finally {
    restoreTrackedEnv(snapshot);
  }
});

test(".env.local overrides .env for the same auth keys", async () => {
  const snapshot = snapshotTrackedEnv();
  const { envPath, envLocalPath } = await createEnvDir();

  try {
    process.env.BELLDANDY_AUTH_MODE = "token";
    process.env.BELLDANDY_AUTH_TOKEN = "setup-token";

    await fs.writeFile(
      envPath,
      [
        "BELLDANDY_AUTH_MODE=token",
        "BELLDANDY_AUTH_TOKEN=env-token",
      ].join("\n"),
      "utf-8",
    );
    await fs.writeFile(
      envLocalPath,
      [
        "BELLDANDY_AUTH_MODE=none",
        "BELLDANDY_AUTH_TOKEN=local-token",
      ].join("\n"),
      "utf-8",
    );

    loadProjectEnvFiles({ envPath, envLocalPath });

    expect(process.env.BELLDANDY_AUTH_MODE).toBe("none");
    expect(process.env.BELLDANDY_AUTH_TOKEN).toBe("local-token");
  } finally {
    restoreTrackedEnv(snapshot);
  }
});

test("loadEnvFileIfExists strips quotes and export prefix", async () => {
  const snapshot = snapshotTrackedEnv();
  const { envPath } = await createEnvDir();

  try {
    process.env.BELLDANDY_AUTH_TOKEN = "setup-token";
    process.env.BELLDANDY_PORT = "28889";

    await fs.writeFile(
      envPath,
      [
        "export BELLDANDY_AUTH_TOKEN='quoted-token'",
        'BELLDANDY_PORT="38889"',
      ].join("\n"),
      "utf-8",
    );

    loadEnvFileIfExists(envPath);

    expect(process.env.BELLDANDY_AUTH_TOKEN).toBe("quoted-token");
    expect(process.env.BELLDANDY_PORT).toBe("38889");
  } finally {
    restoreTrackedEnv(snapshot);
  }
});
