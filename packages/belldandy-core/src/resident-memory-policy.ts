import path from "node:path";

import {
  resolveAgentProfileMetadata,
  type AgentMemoryMode,
  type AgentProfile,
} from "@belldandy/agent";

export type ResidentMemoryTarget = "private" | "shared";

export type ResolvedResidentMemoryPolicy = {
  agentId: string;
  workspaceDir: string;
  memoryMode: AgentMemoryMode;
  privateStateDir: string;
  sharedStateDir: string;
  managerStateDir: string;
  includeSharedMemoryReads: boolean;
  readTargets: ResidentMemoryTarget[];
  writeTarget: ResidentMemoryTarget;
  summary: string;
};

export function resolveResidentPrivateStateDir(rootStateDir: string, profile: Pick<AgentProfile, "id" | "workspaceDir">): string {
  if (profile.id === "default") {
    return rootStateDir;
  }
  const metadata = resolveAgentProfileMetadata(profile);
  return path.join(rootStateDir, "agents", metadata.workspaceDir);
}

export function resolveResidentSharedStateDir(rootStateDir: string): string {
  return path.join(rootStateDir, "team-memory");
}

export function resolveResidentMemoryPolicy(
  rootStateDir: string,
  profile: Pick<AgentProfile, "id" | "workspaceDir" | "kind" | "workspaceBinding" | "sessionNamespace" | "memoryMode">,
): ResolvedResidentMemoryPolicy {
  const metadata = resolveAgentProfileMetadata(profile);
  const privateStateDir = resolveResidentPrivateStateDir(rootStateDir, profile);
  const sharedStateDir = resolveResidentSharedStateDir(rootStateDir);

  if (metadata.memoryMode === "shared") {
    return {
      agentId: profile.id,
      workspaceDir: metadata.workspaceDir,
      memoryMode: metadata.memoryMode,
      privateStateDir,
      sharedStateDir,
      managerStateDir: sharedStateDir,
      includeSharedMemoryReads: false,
      readTargets: ["shared"],
      writeTarget: "shared",
      summary: "Reads and writes use the shared team memory layer only.",
    };
  }

  if (metadata.memoryMode === "hybrid") {
    return {
      agentId: profile.id,
      workspaceDir: metadata.workspaceDir,
      memoryMode: metadata.memoryMode,
      privateStateDir,
      sharedStateDir,
      managerStateDir: privateStateDir,
      includeSharedMemoryReads: true,
      readTargets: ["private", "shared"],
      writeTarget: "private",
      summary: "Writes stay private; reads include both private memory and the shared team layer.",
    };
  }

  return {
    agentId: profile.id,
    workspaceDir: metadata.workspaceDir,
    memoryMode: metadata.memoryMode,
    privateStateDir,
    sharedStateDir,
    managerStateDir: privateStateDir,
    includeSharedMemoryReads: false,
    readTargets: ["private"],
    writeTarget: "private",
    summary: "Reads and writes stay inside the agent private memory scope.",
  };
}
