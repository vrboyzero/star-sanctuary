import { describe, expect, it } from "vitest";
import { applyPatchTool } from "./builtin/apply-patch/index.js";
import { fetchTool } from "./builtin/fetch.js";
import { goalInitTool } from "./builtin/goals/index.js";
import { methodListTool } from "./builtin/methodology/index.js";
import {
  getToolContract,
  hasToolContract,
  listToolContracts,
} from "./tool-contract.js";

describe("tool contract helpers", () => {
  it("detects contract-aware tools", () => {
    expect(hasToolContract(fetchTool)).toBe(true);
    expect(getToolContract(fetchTool)?.family).toBe("network-read");
  });

  it("lists contracts from a tool collection", () => {
    const contracts = listToolContracts([fetchTool, applyPatchTool]);

    expect(contracts.map((contract) => contract.name)).toEqual([
      "web_fetch",
      "apply_patch",
    ]);
    expect(contracts[1]?.outputPersistencePolicy).toBe("artifact");
  });

  it("preserves contract metadata on wrapped family exports", () => {
    expect(hasToolContract(goalInitTool)).toBe(true);
    expect(getToolContract(goalInitTool)?.family).toBe("goal-governance");
    expect(getToolContract(methodListTool)?.family).toBe("workspace-read");
  });
});
