import {
  resolveAgentProfileMetadata,
  type AgentMemoryMode,
  type AgentProfile,
} from "@belldandy/agent";
import {
  resolveResidentPrivateStateDir as resolveResidentPrivateStateDirFromBinding,
  resolveResidentSharedStateDir as resolveResidentSharedStateDirFromBinding,
  resolveResidentStateBinding,
} from "./resident-state-binding.js";

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
  return resolveResidentPrivateStateDirFromBinding(rootStateDir, profile);
}

export function resolveResidentSharedStateDir(
  rootStateDir: string,
  profile?: Pick<AgentProfile, "id" | "kind" | "workspaceBinding" | "workspaceDir" | "sessionNamespace" | "memoryMode">,
): string {
  return resolveResidentSharedStateDirFromBinding(rootStateDir, profile);
}

export function resolveResidentMemoryPolicy(
  rootStateDir: string,
  profile: Pick<AgentProfile, "id" | "workspaceDir" | "kind" | "workspaceBinding" | "sessionNamespace" | "memoryMode">,
): ResolvedResidentMemoryPolicy {
  const metadata = resolveAgentProfileMetadata(profile);
  const stateBinding = resolveResidentStateBinding(rootStateDir, profile);
  const privateStateDir = stateBinding.privateStateDir;
  const sharedStateDir = stateBinding.sharedStateDir;

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
