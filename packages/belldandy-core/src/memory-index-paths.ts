import path from "node:path";

export interface MemoryIndexPaths {
  sessionsDir: string;
  additionalRoots: string[];
  additionalFiles: string[];
}

export function resolveMemoryIndexPaths(
  stateDir: string,
  options: { includeTeamSharedMemory?: boolean } = {},
): MemoryIndexPaths {
  const additionalRoots = [path.join(stateDir, "memory")];
  const additionalFiles = [path.join(stateDir, "MEMORY.md")];

  if (options.includeTeamSharedMemory === true) {
    additionalRoots.push(path.join(stateDir, "team-memory", "memory"));
    additionalFiles.push(path.join(stateDir, "team-memory", "MEMORY.md"));
  }

  return {
    sessionsDir: path.join(stateDir, "sessions"),
    additionalRoots,
    additionalFiles,
  };
}
