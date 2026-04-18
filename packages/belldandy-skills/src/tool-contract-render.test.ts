import { describe, expect, it } from "vitest";

import type { ToolContractV2 } from "./tool-contract-v2.js";
import { buildToolContractV2CompactPromptSummary } from "./tool-contract-render.js";

function createContract(overrides: Partial<ToolContractV2> & Pick<ToolContractV2, "name">): ToolContractV2 {
  return {
    name: overrides.name,
    family: overrides.family,
    riskLevel: overrides.riskLevel,
    needsPermission: overrides.needsPermission ?? false,
    isReadOnly: overrides.isReadOnly ?? true,
    isConcurrencySafe: overrides.isConcurrencySafe ?? true,
    activityDescription: overrides.activityDescription,
    outputPersistencePolicy: overrides.outputPersistencePolicy,
    channels: overrides.channels,
    safeScopes: overrides.safeScopes,
    recommendedWhen: overrides.recommendedWhen ?? [],
    avoidWhen: overrides.avoidWhen ?? [],
    confirmWhen: overrides.confirmWhen ?? [],
    preflightChecks: overrides.preflightChecks ?? [],
    fallbackStrategy: overrides.fallbackStrategy ?? [],
    expectedOutput: overrides.expectedOutput ?? [],
    sideEffectSummary: overrides.sideEffectSummary ?? [],
    userVisibleRiskNote: overrides.userVisibleRiskNote,
    hasGovernanceContract: overrides.hasGovernanceContract ?? true,
    hasBehaviorContract: overrides.hasBehaviorContract ?? true,
  };
}

describe("buildToolContractV2CompactPromptSummary", () => {
  it("prioritizes higher-risk tools and keeps the summary compact", () => {
    const summary = buildToolContractV2CompactPromptSummary([
      createContract({
        name: "file_read",
        family: "workspace-read",
        riskLevel: "low",
        recommendedWhen: ["you need to inspect an existing file"],
      }),
      createContract({
        name: "file_write",
        family: "workspace-write",
        riskLevel: "high",
        isReadOnly: false,
        needsPermission: true,
        preflightChecks: ["confirm the exact target path"],
        fallbackStrategy: ["switch to file_read if you only need inspection"],
      }),
    ], {
      maxTools: 1,
      maxBulletsPerField: 1,
    });

    expect(summary).toContain("## Tool Contract Governance");
    expect(summary).toContain("`file_write`");
    expect(summary).not.toContain("`file_read`");
    expect(summary).toContain("Preflight: confirm the exact target path");
    expect(summary).toContain("1 additional visible tools omitted");
  });
});
