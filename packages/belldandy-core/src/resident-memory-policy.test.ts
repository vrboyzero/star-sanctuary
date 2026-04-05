import path from "node:path";

import { expect, test } from "vitest";

import { resolveResidentMemoryPolicy } from "./resident-memory-policy.js";

test("resolveResidentMemoryPolicy maps isolated/shared/hybrid onto concrete state scopes", () => {
  const stateDir = path.join("C:", "tmp", "belldandy-state");

  expect(resolveResidentMemoryPolicy(stateDir, {
    id: "coder",
    workspaceDir: "coder",
    memoryMode: "isolated",
  })).toMatchObject({
    managerStateDir: path.join(stateDir, "agents", "coder"),
    includeSharedMemoryReads: false,
    readTargets: ["private"],
    writeTarget: "private",
  });

  expect(resolveResidentMemoryPolicy(stateDir, {
    id: "coder",
    workspaceDir: "coder",
    memoryMode: "hybrid",
  })).toMatchObject({
    managerStateDir: path.join(stateDir, "agents", "coder"),
    includeSharedMemoryReads: true,
    readTargets: ["private", "shared"],
    writeTarget: "private",
  });

  expect(resolveResidentMemoryPolicy(stateDir, {
    id: "coder",
    workspaceDir: "coder",
    memoryMode: "shared",
  })).toMatchObject({
    managerStateDir: path.join(stateDir, "team-memory"),
    includeSharedMemoryReads: false,
    readTargets: ["shared"],
    writeTarget: "shared",
  });
});
