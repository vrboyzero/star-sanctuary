import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { expect, test } from "vitest";

import { resolveGatewayRuntimePaths, resolvePreferredEnvDir, resolvePreferredEnvDirInfo } from "./runtime-paths.js";

test("resolvePreferredEnvDir prefers explicit env dir", () => {
  const envDir = resolvePreferredEnvDir({
    cwd: "E:/project/star-sanctuary",
    stateDir: "C:/Users/test/.star_sanctuary",
    envDir: "D:/star/env",
    exists: () => false,
  });

  expect(envDir).toBe(path.resolve("D:/star/env"));
});

test("resolvePreferredEnvDir keeps legacy project-root env when cwd has env files", () => {
  const cwd = "E:/project/star-sanctuary";
  const envDir = resolvePreferredEnvDir({
    cwd,
    stateDir: "C:/Users/test/.star_sanctuary",
    exists: (filePath) => filePath === path.join(path.resolve(cwd), ".env.local"),
  });

  expect(envDir).toBe(path.resolve(cwd));
});

test("resolvePreferredEnvDir falls back to state dir for fresh installs", () => {
  const envDir = resolvePreferredEnvDir({
    cwd: "E:/project/star-sanctuary",
    stateDir: "C:/Users/test/.star_sanctuary",
    exists: () => false,
  });

  expect(envDir).toBe(path.resolve("C:/Users/test/.star_sanctuary"));
});

test("resolvePreferredEnvDirInfo prefers install root when runtime dir points to installed current", () => {
  const installRoot = "E:/Users/test/AppData/Local/StarSanctuary";
  const runtimeDir = `${installRoot}/current`;
  const result = resolvePreferredEnvDirInfo({
    cwd: "E:/project/star-sanctuary",
    runtimeDir,
    exists: (filePath) => filePath === path.join(path.resolve(installRoot), "install-info.json"),
  });

  expect(result.envDir).toBe(path.resolve(installRoot));
  expect(result.source).toBe("installed_source");
});

test("resolvePreferredEnvDirInfo honors install-info currentDir and envDir metadata", () => {
  const installRoot = fs.mkdtempSync(path.join(os.tmpdir(), "star-sanctuary-install-layout-"));
  const runtimeDir = path.join(installRoot, "runtime");
  const envDir = path.join(installRoot, "config");

  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.mkdirSync(envDir, { recursive: true });
  fs.writeFileSync(
    path.join(installRoot, "install-info.json"),
    JSON.stringify({ currentDir: "runtime", envDir: "config" }, null, 2) + "\n",
    "utf-8",
  );

  try {
    const result = resolvePreferredEnvDirInfo({
      cwd: "E:/project/star-sanctuary",
      runtimeDir,
      stateDir: "C:/Users/test/.star_sanctuary",
    });

    expect(result.envDir).toBe(path.resolve(envDir));
    expect(result.source).toBe("installed_source");
  } finally {
    fs.rmSync(installRoot, { recursive: true, force: true });
  }
});

test("resolvePreferredEnvDirInfo ignores install-info paths that escape install root", () => {
  const installRoot = fs.mkdtempSync(path.join(os.tmpdir(), "star-sanctuary-install-escape-"));
  const runtimeDir = path.join(installRoot, "current");

  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.writeFileSync(
    path.join(installRoot, "install-info.json"),
    JSON.stringify({ currentDir: "../runtime", envDir: "../config" }, null, 2) + "\n",
    "utf-8",
  );

  try {
    const result = resolvePreferredEnvDirInfo({
      cwd: "E:/project/star-sanctuary",
      runtimeDir,
      stateDir: "C:/Users/test/.star_sanctuary",
    });

    expect(result.envDir).toBe(path.resolve(installRoot));
    expect(result.source).toBe("installed_source");
  } finally {
    fs.rmSync(installRoot, { recursive: true, force: true });
  }
});

test("resolveGatewayRuntimePaths uses state-dir env fallback when project root has no env", () => {
  const cwd = "E:/fresh-install/star-sanctuary";
  const runtimePaths = resolveGatewayRuntimePaths({
    cwd,
    stateDir: "C:/Users/test/.star_sanctuary",
    env: {},
  });

  expect(runtimePaths.envDir).toBe(path.resolve("C:/Users/test/.star_sanctuary"));
  expect(runtimePaths.cwd).toBe(path.resolve(cwd));
  expect(runtimePaths.envSource).toBe("state_dir");
});

test("resolveGatewayRuntimePaths prefers installed-source env over cwd legacy env when runtime dir is explicit", () => {
  const installRoot = fs.mkdtempSync(path.join(os.tmpdir(), "star-sanctuary-install-"));
  const runtimeDir = path.join(installRoot, "current");

  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.writeFileSync(path.join(installRoot, "install-info.json"), "{}\n", "utf-8");

  try {
    const runtimePaths = resolveGatewayRuntimePaths({
      cwd: "E:/project/star-sanctuary",
      runtimeDir,
      stateDir: "C:/Users/test/.star_sanctuary",
      env: {},
    });

    expect(runtimePaths.envDir).toBe(path.resolve(installRoot));
    expect(runtimePaths.envSource).toBe("installed_source");
  } finally {
    fs.rmSync(installRoot, { recursive: true, force: true });
  }
});

test("resolveGatewayRuntimePaths reuses install-info envDir metadata for installed runtime", () => {
  const installRoot = fs.mkdtempSync(path.join(os.tmpdir(), "star-sanctuary-install-runtime-"));
  const runtimeDir = path.join(installRoot, "runtime");
  const envDir = path.join(installRoot, "env");

  fs.mkdirSync(runtimeDir, { recursive: true });
  fs.mkdirSync(envDir, { recursive: true });
  fs.writeFileSync(
    path.join(installRoot, "install-info.json"),
    JSON.stringify({ currentDir: "runtime", envDir: "env" }, null, 2) + "\n",
    "utf-8",
  );

  try {
    const runtimePaths = resolveGatewayRuntimePaths({
      cwd: "E:/project/star-sanctuary",
      runtimeDir,
      stateDir: "C:/Users/test/.star_sanctuary",
      env: {},
    });

    expect(runtimePaths.envDir).toBe(path.resolve(envDir));
    expect(runtimePaths.envSource).toBe("installed_source");
  } finally {
    fs.rmSync(installRoot, { recursive: true, force: true });
  }
});
