import path from "node:path";

import { expect, test } from "vitest";

import { resolveGatewayRuntimePaths, resolvePreferredEnvDir } from "./runtime-paths.js";

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
