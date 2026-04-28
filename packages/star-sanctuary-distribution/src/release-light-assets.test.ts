import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

import { expect, test } from "vitest";

function resolveWorkspaceRoot(): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(currentDir, "..", "..", "..");
}

function readPackageVersion(workspaceRoot: string): string {
  const packageJsonPath = path.join(workspaceRoot, "package.json");
  const packageJson = JSON.parse(
    fs.readFileSync(packageJsonPath, "utf-8"),
  ) as { version?: string };
  const version = String(packageJson.version ?? "").trim();
  if (!version) {
    throw new Error("Failed to resolve workspace version for release-light test.");
  }
  return version;
}

function runNodeScript(workspaceRoot: string, relativeScriptPath: string): void {
  execFileSync(process.execPath, [relativeScriptPath], {
    cwd: workspaceRoot,
    stdio: "pipe",
    encoding: "utf-8",
  });
}

test("release-light asset keeps default env templates complete", async () => {
  const workspaceRoot = resolveWorkspaceRoot();
  const version = readPackageVersion(workspaceRoot);

  runNodeScript(workspaceRoot, "scripts/build-release-light-assets.mjs");
  runNodeScript(workspaceRoot, "scripts/verify-release-light-assets.mjs");

  const sourceTemplatesRoot = path.join(
    workspaceRoot,
    "packages",
    "star-sanctuary-distribution",
    "src",
    "templates",
    "default-env",
  );
  const artifactTemplatesRoot = path.join(
    workspaceRoot,
    "artifacts",
    "release-light",
    `v${version}`,
    `star-sanctuary-dist-v${version}`,
    "packages",
    "star-sanctuary-distribution",
    "src",
    "templates",
    "default-env",
  );

  const [sourceEnv, sourceEnvLocal, artifactEnv, artifactEnvLocal] = await Promise.all([
    fsp.readFile(path.join(sourceTemplatesRoot, "runtime.env"), "utf-8"),
    fsp.readFile(path.join(sourceTemplatesRoot, "runtime.env.local"), "utf-8"),
    fsp.readFile(path.join(artifactTemplatesRoot, "runtime.env"), "utf-8"),
    fsp.readFile(path.join(artifactTemplatesRoot, "runtime.env.local"), "utf-8"),
  ]);

  expect(artifactEnv).toBe(sourceEnv);
  expect(artifactEnvLocal).toBe(sourceEnvLocal);
}, 120_000);
