import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveMemoryIndexPaths } from "./memory-index-paths.js";

describe("resolveMemoryIndexPaths", () => {
  it("keeps memory indexing inside BELLDANDY_STATE_DIR", () => {
    const stateDir = "C:/Users/admin/.star_sanctuary";
    const result = resolveMemoryIndexPaths(stateDir);

    expect(result.sessionsDir).toBe(path.join(stateDir, "sessions"));
    expect(result.additionalRoots).toEqual([path.join(stateDir, "memory")]);
    expect(result.additionalFiles).toEqual([path.join(stateDir, "MEMORY.md")]);
  });
});
