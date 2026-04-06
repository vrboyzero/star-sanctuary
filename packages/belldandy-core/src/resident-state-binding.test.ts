import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  matchResidentProtectedStatePath,
  resolveResidentScopeStateDir,
  resolveResidentPrivateStateDir,
  resolveResidentSessionsDir,
  resolveResidentSharedStateDir,
  resolveResidentStateBinding,
  resolveResidentStateBindingView,
} from "./resident-state-binding.js";

describe("resident state binding", () => {
  const stateDir = path.join("C:", "tmp", "belldandy-state");

  it("keeps current-binding default resident on root scope while using root sessions", () => {
    expect(resolveResidentScopeStateDir(stateDir, {
      id: "default",
      workspaceBinding: "current",
    })).toBe(stateDir);
    expect(resolveResidentPrivateStateDir(stateDir, {
      id: "default",
      workspaceBinding: "current",
    })).toBe(stateDir);
    expect(resolveResidentSessionsDir(stateDir, {
      id: "default",
      workspaceBinding: "current",
    })).toBe(path.join(stateDir, "sessions"));
    expect(resolveResidentSharedStateDir(stateDir, {
      id: "default",
      workspaceBinding: "current",
    })).toBe(path.join(stateDir, "team-memory"));
  });

  it("keeps current-binding non-default residents under stateDir/agents/<workspaceDir>", () => {
    const binding = resolveResidentStateBinding(stateDir, {
      id: "coder",
      workspaceBinding: "current",
      workspaceDir: "coder",
    });

    expect(binding.scopeStateDir).toBe(stateDir);
    expect(binding.privateStateDir).toBe(path.join(stateDir, "agents", "coder"));
    expect(binding.sessionsDir).toBe(path.join(stateDir, "agents", "coder", "sessions"));
    expect(binding.sharedStateDir).toBe(path.join(stateDir, "team-memory"));
  });

  it("moves custom-binding residents into a workspace-scoped state root", () => {
    const binding = resolveResidentStateBinding(stateDir, {
      id: "coder",
      workspaceBinding: "custom",
      workspaceDir: "project-b",
    });

    expect(binding.scopeStateDir).toBe(path.join(stateDir, "workspaces", "project-b"));
    expect(binding.privateStateDir).toBe(path.join(stateDir, "workspaces", "project-b", "agents", "coder"));
    expect(binding.sessionsDir).toBe(path.join(stateDir, "workspaces", "project-b", "agents", "coder", "sessions"));
    expect(binding.sharedStateDir).toBe(path.join(stateDir, "workspaces", "project-b", "team-memory"));
  });

  it("builds a concise workspace/state scope summary for observability surfaces", () => {
    const binding = resolveResidentStateBindingView(stateDir, {
      id: "coder",
      workspaceBinding: "custom",
      workspaceDir: "project-b",
    });

    expect(binding.workspaceScopeSummary).toBe(
      `custom workspace scope (project-b) rooted at ${path.join(stateDir, "workspaces", "project-b")}`,
    );
    expect(binding.stateScopeSummary).toBe(
      `private=${path.join(stateDir, "workspaces", "project-b", "agents", "coder")}; sessions=${path.join(stateDir, "workspaces", "project-b", "agents", "coder", "sessions")}; shared=${path.join(stateDir, "workspaces", "project-b", "team-memory")}`,
    );
  });

  it("classifies protected resident state paths for minimum safety guards", () => {
    expect(matchResidentProtectedStatePath("sessions/agent-default-main.jsonl")).toMatchObject({
      scope: "current",
      category: "sessions",
    });
    expect(matchResidentProtectedStatePath("agents/coder/MEMORY.md")).toMatchObject({
      scope: "current",
      category: "private-state",
    });
    expect(matchResidentProtectedStatePath("team-memory/MEMORY.md")).toMatchObject({
      scope: "current",
      category: "shared-memory",
    });
    expect(matchResidentProtectedStatePath("workspaces/project-b/team-memory/MEMORY.md")).toMatchObject({
      scope: "custom",
      category: "shared-memory",
      workspaceDir: "project-b",
    });
    expect(matchResidentProtectedStatePath("docs/generated.md")).toBeUndefined();
  });
});
