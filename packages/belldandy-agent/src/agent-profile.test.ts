import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { expect, test } from "vitest";

import {
  buildDefaultProfile,
  loadAgentProfiles,
  resolveAgentProfileMetadata,
  resolveModelConfig,
} from "./agent-profile.js";

test("resolveAgentProfileMetadata applies resident defaults", () => {
  const metadata = resolveAgentProfileMetadata(buildDefaultProfile());
  expect(metadata).toEqual({
    kind: "resident",
    workspaceBinding: "current",
    workspaceDir: "default",
    sessionNamespace: "default",
    memoryMode: "hybrid",
    catalog: {
      whenToUse: [],
      defaultRole: "default",
      defaultPermissionMode: undefined,
      defaultAllowedToolFamilies: undefined,
      defaultMaxToolRiskLevel: undefined,
      skills: [],
      handoffStyle: "summary",
    },
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
        whenToUse: ["需要改代码", "需要补测试"],
        defaultRole: "coder",
        defaultAllowedToolFamilies: ["workspace-read", "patch", "workspace-read"],
        skills: ["repo-map", "repo-map", "review-helper"],
        handoffStyle: "structured",
      },
      {
        id: "verifier",
        displayName: "Verifier",
        model: "primary",
        kind: "not-valid",
        workspaceBinding: "not-valid",
        sessionNamespace: "verifier scope",
        memoryMode: "not-valid",
        defaultRole: "not-valid",
        defaultPermissionMode: "not-valid",
        defaultMaxToolRiskLevel: "not-valid",
        handoffStyle: "not-valid",
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
    whenToUse: ["需要改代码", "需要补测试"],
    defaultRole: "coder",
    defaultAllowedToolFamilies: ["workspace-read", "patch"],
    skills: ["repo-map", "review-helper"],
    handoffStyle: "structured",
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
    catalog: {
      whenToUse: [],
      defaultRole: "default",
      defaultPermissionMode: undefined,
      defaultAllowedToolFamilies: undefined,
      defaultMaxToolRiskLevel: undefined,
      skills: [],
      handoffStyle: "summary",
    },
  });

  expect(resolveAgentProfileMetadata(profiles[0]!)).toEqual({
    kind: "resident",
    workspaceBinding: "current",
    workspaceDir: "coder",
    sessionNamespace: "coder-main",
    memoryMode: "isolated",
    catalog: {
      whenToUse: ["需要改代码", "需要补测试"],
      defaultRole: "coder",
      defaultPermissionMode: "confirm",
      defaultAllowedToolFamilies: ["workspace-read", "patch"],
      defaultMaxToolRiskLevel: "high",
      skills: ["repo-map", "review-helper"],
      handoffStyle: "structured",
    },
  });
});

test("resolveModelConfig accepts manual model override without falling back to named profiles", () => {
  const resolved = resolveModelConfig(
    "manual:gpt-5.1-mini",
    {
      baseUrl: "https://api.openai.com/v1",
      apiKey: "sk-primary",
      model: "gpt-5",
    },
    [
      {
        id: "kimi-k2.5",
        baseUrl: "https://api.moonshot.cn/v1",
        apiKey: "sk-kimi",
        model: "kimi-k2.5",
      },
    ],
  );

  expect(resolved).toEqual({
    baseUrl: "https://api.openai.com/v1",
    apiKey: "sk-primary",
    model: "gpt-5.1-mini",
    source: "manual",
  });
});
