import path from "node:path";

import { expect, test } from "vitest";

import { resolveGatewayRuntimePaths, resolvePreferredEnvDir, resolvePreferredEnvDirInfo } from "./runtime-paths.js";

test("resolvePreferredEnvDir prefers explicit envDir argument over state dir", () => {
  const envDir = resolvePreferredEnvDir({
    cwd: "E:/project/star-sanctuary",
    stateDir: "C:/Users/test/.star_sanctuary",
    envDir: "D:/legacy-env",
    runtimeDir: "E:/legacy-install/current",
    exists: () => true,
  });

  expect(envDir).toBe(path.resolve("D:/legacy-env"));
});

test("resolvePreferredEnvDirInfo reports explicit source when explicit envDir argument exists", () => {
  const result = resolvePreferredEnvDirInfo({
    cwd: "E:/project/star-sanctuary",
    stateDir: "C:/Users/test/.star_sanctuary",
    envDir: "D:/legacy-env",
    runtimeDir: "E:/legacy-install/current",
    exists: () => true,
  });

  expect(result.envDir).toBe(path.resolve("D:/legacy-env"));
  expect(result.source).toBe("explicit");
});

test("resolveGatewayRuntimePaths uses state-dir env for fresh installs", () => {
  const cwd = "E:/fresh-install/star-sanctuary";
  const runtimePaths = resolveGatewayRuntimePaths({
    cwd,
    stateDir: "C:/Users/test/.star_sanctuary",
    env: {},
  });

  expect(runtimePaths.envDir).toBe(path.resolve("C:/Users/test/.star_sanctuary"));
  expect(runtimePaths.stateDir).toBe(path.resolve("C:/Users/test/.star_sanctuary"));
  expect(runtimePaths.cwd).toBe(path.resolve(cwd));
  expect(runtimePaths.envSource).toBe("state_dir");
});

test("resolveGatewayRuntimePaths respects explicit env dir from process env", () => {
  const runtimePaths = resolveGatewayRuntimePaths({
    cwd: "E:/project/star-sanctuary",
    stateDir: "C:/Users/test/.star_sanctuary",
    runtimeDir: "E:/legacy-install/current",
    env: {
      STAR_SANCTUARY_ENV_DIR: "E:/explicit-env",
    },
  });

  expect(runtimePaths.envDir).toBe(path.resolve("E:/explicit-env"));
  expect(runtimePaths.stateDir).toBe(path.resolve("C:/Users/test/.star_sanctuary"));
  expect(runtimePaths.envSource).toBe("explicit");
});
