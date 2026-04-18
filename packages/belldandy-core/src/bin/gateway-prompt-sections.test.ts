import { describe, expect, it } from "vitest";

import type { ToolContractV2 } from "@belldandy/skills";

import { buildAgentRuntimePromptSections } from "./gateway-prompt-sections.js";

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

describe("buildAgentRuntimePromptSections", () => {
  it("builds tool, delegation, and role sections for coder profiles", () => {
    const sections = buildAgentRuntimePromptSections({
      hasAvailableTools: true,
      visibleContracts: [
        createContract({
          name: "file_write",
          family: "workspace-write",
          riskLevel: "high",
          isReadOnly: false,
          needsPermission: true,
          preflightChecks: ["confirm the target file"],
        }),
      ],
      canDelegate: true,
      role: "coder",
    });

    expect(sections.map((section) => section.id)).toEqual([
      "tool-use-policy",
      "tool-contract-governance",
      "delegation-operating-policy",
      "role-execution-policy",
    ]);
    expect(sections.find((section) => section.id === "delegation-operating-policy")?.text)
      .toContain("ownership.scope_summary");
    expect(sections.find((section) => section.id === "delegation-operating-policy")?.text)
      .toContain("done definition");
    expect(sections.find((section) => section.id === "delegation-operating-policy")?.text)
      .toContain("classify it as accept, retry with a follow-up delegation, or report blocker");
    expect(sections.find((section) => section.id === "delegation-operating-policy")?.text)
      .toContain("inherit the existing `acceptance.verification_hints`");
    expect(sections.find((section) => section.id === "role-execution-policy")?.text)
      .toContain("Role Execution Policy (coder)");
  });

  it("skips delegation and role sections when they do not apply", () => {
    const sections = buildAgentRuntimePromptSections({
      hasAvailableTools: true,
      visibleContracts: [],
      canDelegate: false,
      role: "default",
    });

    expect(sections.map((section) => section.id)).toEqual([
      "tool-use-policy",
    ]);
  });
});
