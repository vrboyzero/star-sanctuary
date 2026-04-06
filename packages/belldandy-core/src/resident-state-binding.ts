import path from "node:path";

import {
  buildDefaultProfile,
  resolveAgentProfileMetadata,
  type AgentRegistry,
  type AgentProfile,
} from "@belldandy/agent";

export type ResolvedResidentStateBinding = {
  agentId: string;
  workspaceBinding: "current" | "custom";
  workspaceDir: string;
  scopeStateDir: string;
  privateStateDir: string;
  sessionsDir: string;
  sharedStateDir: string;
  summary: string;
};

export type ResidentStateBindingView = ResolvedResidentStateBinding & {
  workspaceScopeSummary: string;
  stateScopeSummary: string;
};

export type ResidentProtectedStatePathMatch = {
  normalizedPath: string;
  scope: "current" | "custom";
  category: "sessions" | "private-state" | "shared-memory" | "workspace-scope";
  workspaceDir?: string;
  summary: string;
};

function normalizeStateToken(value: string | undefined): string {
  return String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    || "default";
}

function normalizeRelativeStatePath(value: string): string {
  return String(value ?? "")
    .trim()
    .replace(/\\/g, "/")
    .replace(/^\.\/+/, "")
    .replace(/^\/+/, "");
}

function normalizeProfile(profile?: Pick<AgentProfile, "id" | "kind" | "workspaceBinding" | "workspaceDir" | "sessionNamespace" | "memoryMode">) {
  return profile ?? buildDefaultProfile();
}

export function resolveResidentScopeStateDir(
  rootStateDir: string,
  profile?: Pick<AgentProfile, "id" | "kind" | "workspaceBinding" | "workspaceDir" | "sessionNamespace" | "memoryMode">,
): string {
  const metadata = resolveAgentProfileMetadata(normalizeProfile(profile));
  if (metadata.workspaceBinding === "custom") {
    return path.join(rootStateDir, "workspaces", metadata.workspaceDir);
  }
  return rootStateDir;
}

export function resolveResidentPrivateStateDir(
  rootStateDir: string,
  profile?: Pick<AgentProfile, "id" | "kind" | "workspaceBinding" | "workspaceDir" | "sessionNamespace" | "memoryMode">,
): string {
  const normalizedProfile = normalizeProfile(profile);
  const metadata = resolveAgentProfileMetadata(normalizedProfile);
  const scopeStateDir = resolveResidentScopeStateDir(rootStateDir, normalizedProfile);

  if (metadata.workspaceBinding === "custom") {
    return path.join(scopeStateDir, "agents", normalizeStateToken(normalizedProfile.id));
  }
  if (normalizedProfile.id === "default") {
    return rootStateDir;
  }
  return path.join(rootStateDir, "agents", metadata.workspaceDir);
}

export function resolveResidentSessionsDir(
  rootStateDir: string,
  profile?: Pick<AgentProfile, "id" | "kind" | "workspaceBinding" | "workspaceDir" | "sessionNamespace" | "memoryMode">,
): string {
  const normalizedProfile = normalizeProfile(profile);
  const metadata = resolveAgentProfileMetadata(normalizedProfile);
  if (metadata.workspaceBinding === "current" && normalizedProfile.id === "default") {
    return path.join(rootStateDir, "sessions");
  }
  return path.join(resolveResidentPrivateStateDir(rootStateDir, normalizedProfile), "sessions");
}

export function resolveResidentSharedStateDir(
  rootStateDir: string,
  profile?: Pick<AgentProfile, "id" | "kind" | "workspaceBinding" | "workspaceDir" | "sessionNamespace" | "memoryMode">,
): string {
  return path.join(resolveResidentScopeStateDir(rootStateDir, profile), "team-memory");
}

export function resolveResidentStateBinding(
  rootStateDir: string,
  profile?: Pick<AgentProfile, "id" | "kind" | "workspaceBinding" | "workspaceDir" | "sessionNamespace" | "memoryMode">,
): ResolvedResidentStateBinding {
  const normalizedProfile = normalizeProfile(profile);
  const metadata = resolveAgentProfileMetadata(normalizedProfile);
  const scopeStateDir = resolveResidentScopeStateDir(rootStateDir, normalizedProfile);
  const privateStateDir = resolveResidentPrivateStateDir(rootStateDir, normalizedProfile);
  const sessionsDir = resolveResidentSessionsDir(rootStateDir, normalizedProfile);
  const sharedStateDir = resolveResidentSharedStateDir(rootStateDir, normalizedProfile);

  return {
    agentId: normalizedProfile.id,
    workspaceBinding: metadata.workspaceBinding,
    workspaceDir: metadata.workspaceDir,
    scopeStateDir,
    privateStateDir,
    sessionsDir,
    sharedStateDir,
    summary: metadata.workspaceBinding === "custom"
      ? `custom workspace scope at ${scopeStateDir}; private state at ${privateStateDir}; sessions at ${sessionsDir}; shared layer at ${sharedStateDir}`
      : normalizedProfile.id === "default"
        ? `current workspace scope at ${scopeStateDir}; default resident keeps root private state at ${privateStateDir}; sessions at ${sessionsDir}; shared layer at ${sharedStateDir}`
        : `current workspace scope at ${scopeStateDir}; private state at ${privateStateDir}; sessions at ${sessionsDir}; shared layer at ${sharedStateDir}`,
  };
}

export function toResidentStateBindingView(
  binding: ResolvedResidentStateBinding,
): ResidentStateBindingView {
  return {
    ...binding,
    workspaceScopeSummary: binding.workspaceBinding === "custom"
      ? `custom workspace scope (${binding.workspaceDir}) rooted at ${binding.scopeStateDir}`
      : `current workspace scope (${binding.workspaceDir}) rooted at ${binding.scopeStateDir}`,
    stateScopeSummary: binding.workspaceBinding === "custom"
      ? `private=${binding.privateStateDir}; sessions=${binding.sessionsDir}; shared=${binding.sharedStateDir}`
      : binding.agentId === "default"
        ? `root-default private=${binding.privateStateDir}; sessions=${binding.sessionsDir}; shared=${binding.sharedStateDir}`
        : `agent-private=${binding.privateStateDir}; sessions=${binding.sessionsDir}; shared=${binding.sharedStateDir}`,
  };
}

export function resolveResidentStateBindingView(
  rootStateDir: string,
  profile?: Pick<AgentProfile, "id" | "kind" | "workspaceBinding" | "workspaceDir" | "sessionNamespace" | "memoryMode">,
): ResidentStateBindingView {
  return toResidentStateBindingView(resolveResidentStateBinding(rootStateDir, profile));
}

export function resolveResidentStateBindingViewForAgent(
  rootStateDir: string | undefined,
  agentRegistry: Pick<AgentRegistry, "getProfile"> | undefined,
  agentId?: string,
): ResidentStateBindingView | undefined {
  if (!rootStateDir) return undefined;
  const normalizedAgentId = typeof agentId === "string" && agentId.trim()
    ? agentId.trim()
    : "default";
  if (normalizedAgentId === "default") {
    return resolveResidentStateBindingView(rootStateDir, buildDefaultProfile());
  }
  const profile = agentRegistry?.getProfile(normalizedAgentId);
  if (!profile) return undefined;
  return resolveResidentStateBindingView(rootStateDir, profile);
}

export function matchResidentProtectedStatePath(
  relativePath: string,
): ResidentProtectedStatePathMatch | undefined {
  const normalizedPath = normalizeRelativeStatePath(relativePath);
  if (!normalizedPath) return undefined;

  const parts = normalizedPath.split("/").filter(Boolean);
  if (parts.length <= 0) return undefined;

  if (parts[0] === "sessions") {
    return {
      normalizedPath,
      scope: "current",
      category: "sessions",
      summary: `current/root resident sessions (${normalizedPath})`,
    };
  }
  if (parts[0] === "agents") {
    return {
      normalizedPath,
      scope: "current",
      category: "private-state",
      summary: `current workspace resident private state (${normalizedPath})`,
    };
  }
  if (parts[0] === "team-memory") {
    return {
      normalizedPath,
      scope: "current",
      category: "shared-memory",
      summary: `current workspace shared memory scope (${normalizedPath})`,
    };
  }
  if (parts[0] !== "workspaces") {
    return undefined;
  }

  const workspaceDir = parts[1] || "unknown";
  if (parts[2] === "agents") {
    return {
      normalizedPath,
      scope: "custom",
      category: "private-state",
      workspaceDir,
      summary: `custom workspace (${workspaceDir}) resident private state (${normalizedPath})`,
    };
  }
  if (parts[2] === "team-memory") {
    return {
      normalizedPath,
      scope: "custom",
      category: "shared-memory",
      workspaceDir,
      summary: `custom workspace (${workspaceDir}) shared memory scope (${normalizedPath})`,
    };
  }
  return {
    normalizedPath,
    scope: "custom",
    category: "workspace-scope",
    workspaceDir,
    summary: `custom workspace (${workspaceDir}) resident state scope (${normalizedPath})`,
  };
}
