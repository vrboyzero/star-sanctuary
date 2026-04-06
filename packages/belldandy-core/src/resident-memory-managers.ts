import fs from "node:fs";
import path from "node:path";

import { buildDefaultProfile, isResidentAgentProfile, type AgentRegistry, type AgentProfile } from "@belldandy/agent";
import {
  MemoryManager,
  registerGlobalMemoryManager,
  type MemoryManagerOptions,
} from "@belldandy/memory";

import { resolveMemoryIndexPaths } from "./memory-index-paths.js";
import {
  resolveResidentMemoryPolicy,
  resolveResidentSharedStateDir,
  type ResolvedResidentMemoryPolicy,
} from "./resident-memory-policy.js";

type SharedMemoryManagerOptions = Omit<
  MemoryManagerOptions,
  "workspaceRoot" | "additionalRoots" | "additionalFiles" | "storePath" | "modelsDir" | "stateDir"
> & {
  stateDir: string;
  modelsDir: string;
  agentRegistry?: AgentRegistry;
  includeTeamSharedMemory?: boolean;
  teamSharedStateDir?: string;
};

export type ScopedMemoryManagerRecord = {
  agentId: string;
  stateDir: string;
  memoryMode: "shared" | "isolated" | "hybrid";
  policy: ResolvedResidentMemoryPolicy;
  manager: MemoryManager;
};

function createMemoryManagerForStateDir(
  managerStateDir: string,
  options: Omit<SharedMemoryManagerOptions, "stateDir"> & { includeTeamSharedMemory?: boolean },
): MemoryManager {
  const memoryIndexPaths = resolveMemoryIndexPaths(managerStateDir, {
    includeTeamSharedMemory: options.includeTeamSharedMemory,
    teamSharedStateDir: options.teamSharedStateDir,
  });
  fs.mkdirSync(memoryIndexPaths.sessionsDir, { recursive: true });
  fs.mkdirSync(path.join(managerStateDir, "memory"), { recursive: true });

  return new MemoryManager({
    ...options,
    workspaceRoot: memoryIndexPaths.sessionsDir,
    additionalRoots: memoryIndexPaths.additionalRoots,
    additionalFiles: memoryIndexPaths.additionalFiles,
    storePath: path.join(managerStateDir, "memory.sqlite"),
    modelsDir: options.modelsDir,
    stateDir: managerStateDir,
  });
}

export function createScopedMemoryManagers(options: SharedMemoryManagerOptions): {
  defaultManager: MemoryManager;
  records: ScopedMemoryManagerRecord[];
} {
  const records: ScopedMemoryManagerRecord[] = [];
  const managersByStateDir = new Map<string, MemoryManager>();
  const sharedStateDir = resolveResidentSharedStateDir(options.stateDir);

  function resolveRegisteredManager(policy: ResolvedResidentMemoryPolicy): MemoryManager {
    const cached = managersByStateDir.get(policy.managerStateDir);
    if (cached) {
      return cached;
    }
    const manager = createMemoryManagerForStateDir(policy.managerStateDir, {
      ...options,
      includeTeamSharedMemory: policy.includeSharedMemoryReads,
      teamSharedStateDir: policy.sharedStateDir,
    });
    managersByStateDir.set(policy.managerStateDir, manager);
    return manager;
  }

  function ensureSharedLayerManager(sharedStateDir: string): MemoryManager {
    const cached = managersByStateDir.get(sharedStateDir);
    if (cached) {
      registerGlobalMemoryManager(cached, {
        workspaceRoot: sharedStateDir,
      });
      return cached;
    }

    const manager = createMemoryManagerForStateDir(sharedStateDir, {
      ...options,
      includeTeamSharedMemory: false,
    });
    managersByStateDir.set(sharedStateDir, manager);
    registerGlobalMemoryManager(manager, {
      workspaceRoot: sharedStateDir,
    });
    return manager;
  }

  function registerResidentManager(profile: AgentProfile, isDefault = false): MemoryManager {
    const policy = resolveResidentMemoryPolicy(options.stateDir, profile);
    ensureSharedLayerManager(policy.sharedStateDir);
    const manager = resolveRegisteredManager(policy);
    registerGlobalMemoryManager(manager, {
      agentId: profile.id,
      workspaceRoot: policy.managerStateDir,
      ...(isDefault ? { isDefault: true } : {}),
    });
    records.push({
      agentId: profile.id,
      stateDir: policy.managerStateDir,
      memoryMode: policy.memoryMode,
      policy,
      manager,
    });
    return manager;
  }

  // 共享层 manager 需要始终可解析，便于 hybrid resident 查询与共享提升写入。
  ensureSharedLayerManager(sharedStateDir);

  const configuredDefault = options.agentRegistry?.getProfile("default");
  const defaultProfile = configuredDefault && isResidentAgentProfile(configuredDefault)
    ? configuredDefault
    : buildDefaultProfile();
  const defaultManager = registerResidentManager(defaultProfile, true);

  for (const profile of options.agentRegistry?.list() ?? []) {
    if (profile.id === "default") continue;
    if (!isResidentAgentProfile(profile)) continue;
    registerResidentManager(profile);
  }

  return {
    defaultManager,
    records,
  };
}
