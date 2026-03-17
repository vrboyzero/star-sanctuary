import path from "node:path";

export interface MemoryIndexPaths {
  sessionsDir: string;
  additionalRoots: string[];
  additionalFiles: string[];
}

export function resolveMemoryIndexPaths(stateDir: string): MemoryIndexPaths {
  return {
    sessionsDir: path.join(stateDir, "sessions"),
    additionalRoots: [path.join(stateDir, "memory")],
    additionalFiles: [path.join(stateDir, "MEMORY.md")],
  };
}
