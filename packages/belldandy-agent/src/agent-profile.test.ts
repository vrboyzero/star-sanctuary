import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { expect, test } from "vitest";

import {
  buildDefaultProfile,
  loadAgentProfiles,
  resolveAgentProfileMetadata,
} from "./agent-profile.js";

test("resolveAgentProfileMetadata applies resident defaults", () => {
  const metadata = resolveAgentProfileMetadata(buildDefaultProfile());
  expect(metadata).toEqual({
    kind: "resident",
    workspaceBinding: "current",
    workspaceDir: "default",
    sessionNamespace: "default",
    memoryMode: "hybrid",
  });
});

test("loadAgentProfiles accepts resident metadata extensions and ignores invalid enum values", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "belldandy-agent-profile-"));
  const configPath = path.join(tempDir, "agents.json");
  await fs.writeFile(configPath, JSON.stringify({
    agents: [
      {
        id: "coder",
        displayName: "Coder",
        model: "primary",
        kind: "resident",
        workspaceBinding: "current",
        workspaceDir: "coder",
        sessionNamespace: "coder-main",
        memoryMode: "isolated",
      },
      {
        id: "verifier",
        displayName: "Verifier",
        model: "primary",
        kind: "not-valid",
        workspaceBinding: "not-valid",
        sessionNamespace: "verifier scope",
        memoryMode: "not-valid",
      },
    ],
  }), "utf-8");

  const profiles = await loadAgentProfiles(configPath);
  expect(profiles).toHaveLength(2);
  expect(profiles[0]).toMatchObject({
    id: "coder",
    kind: "resident",
    workspaceBinding: "current",
    workspaceDir: "coder",
    sessionNamespace: "coder-main",
    memoryMode: "isolated",
  });
  expect(profiles[1]).toMatchObject({
    id: "verifier",
    kind: undefined,
    workspaceBinding: undefined,
    sessionNamespace: "verifier scope",
    memoryMode: undefined,
  });

  expect(resolveAgentProfileMetadata(profiles[1]!)).toEqual({
    kind: "resident",
    workspaceBinding: "current",
    workspaceDir: "verifier",
    sessionNamespace: "verifier-scope",
    memoryMode: "hybrid",
  });
});
