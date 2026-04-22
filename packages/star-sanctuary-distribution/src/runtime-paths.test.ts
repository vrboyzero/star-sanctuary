import path from "node:path";

import { expect, test } from "vitest";

import { resolveGatewayRuntimePaths, resolvePreferredEnvDir, resolvePreferredEnvDirInfo } from "./runtime-paths.js";

test("resolvePreferredEnvDir always resolves to state dir", () => {
  const envDir = resolvePreferredEnvDir({
    cwd: "E:/project/star-sanctuary",
    stateDir: "C:/Users/test/.star_sanctuary",
    envDir: "D:/legacy-env",
    runtimeDir: "E:/legacy-install/current",
    exists: () => true,
  });

  expect(envDir).toBe(path.resolve("C:/Users/test/.star_sanctuary"));
});

test("resolvePreferredEnvDirInfo reports state_dir even when legacy inputs exist", () => {
  const result = resolvePreferredEnvDirInfo({
    cwd: "E:/project/star-sanctuary",
    stateDir: "C:/Users/test/.star_sanctuary",
    envDir: "D:/legacy-env",
    runtimeDir: "E:/legacy-install/current",
    exists: () => true,
  });

  expect(result.envDir).toBe(path.resolve("C:/Users/test/.star_sanctuary"));
  expect(result.source).toBe("state_dir");
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

test("resolveGatewayRuntimePaths ignores legacy env dir and install metadata", () => {
  const runtimePaths = resolveGatewayRuntimePaths({
    cwd: "E:/project/star-sanctuary",
    stateDir: "C:/Users/test/.star_sanctuary",
    envDir: "D:/legacy-env",
    runtimeDir: "E:/legacy-install/current",
    env: {
      STAR_SANCTUARY_ENV_DIR: "E:/ignored-explicit",
    },
  });

  expect(runtimePaths.envDir).toBe(path.resolve("C:/Users/test/.star_sanctuary"));
  expect(runtimePaths.stateDir).toBe(path.resolve("C:/Users/test/.star_sanctuary"));
  expect(runtimePaths.envSource).toBe("state_dir");
});
