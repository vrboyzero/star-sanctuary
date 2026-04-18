import { describe, expect, it } from "vitest";

import { normalizeAgentLaunchSpec, normalizeAgentLaunchSpecWithCatalog } from "./launch-spec.js";

describe("normalizeAgentLaunchSpec", () => {
  it("normalizes structured delegation constraints for launch spec runtime visibility", () => {
    const spec = normalizeAgentLaunchSpec({
      instruction: "  Patch the failing bootstrap path.  ",
      parentConversationId: "  conv-1  ",
      agentId: "coder",
      delegationProtocol: {
        source: "delegate_task",
        intent: {
          kind: "ad_hoc",
          summary: "  Patch the failing bootstrap path.  ",
          role: "coder",
        },
        contextPolicy: {
          includeParentConversation: true,
          includeStructuredContext: true,
          contextKeys: [" goalId ", "goalId", " file "],
        },
        expectedDeliverable: {
          format: "patch",
          summary: "  Patch summary with proof.  ",
        },
        aggregationPolicy: {
          mode: "single",
          summarizeFailures: true,
          sourceAgentIds: [" coder ", "coder", " verifier "],
        },
        launchDefaults: {
          permissionMode: " confirm ",
          allowedToolFamilies: [" workspace-read ", "patch", "patch"] as any,
          maxToolRiskLevel: "high",
        },
        ownership: {
          scopeSummary: "  Gateway bootstrap only.  ",
          outOfScope: [" docs ", "docs", " ui "],
          writeScope: [" packages/belldandy-core/src/bin/gateway.ts ", "packages/belldandy-core/src/bin/gateway.ts"],
        },
        acceptance: {
          doneDefinition: "  Build stays green.  ",
          verificationHints: [" run targeted tests ", "run targeted tests", " inspect diff "],
        },
        deliverableContract: {
          format: "patch",
          summary: "  Patch plus verification notes.  ",
          requiredSections: [" Changes ", "Verification", "Changes"],
        },
      },
    });

    expect(spec.instruction).toBe("Patch the failing bootstrap path.");
    expect(spec.parentConversationId).toBe("conv-1");
    expect(spec.delegationProtocol).toMatchObject({
      intent: {
        summary: "Patch the failing bootstrap path.",
      },
      contextPolicy: {
        contextKeys: ["goalId", "file"],
      },
      aggregationPolicy: {
        sourceAgentIds: ["coder", "verifier"],
      },
      launchDefaults: {
        permissionMode: "confirm",
        allowedToolFamilies: ["workspace-read", "patch"],
        maxToolRiskLevel: "high",
      },
      ownership: {
        scopeSummary: "Gateway bootstrap only.",
        outOfScope: ["docs", "ui"],
        writeScope: ["packages/belldandy-core/src/bin/gateway.ts"],
      },
      acceptance: {
        doneDefinition: "Build stays green.",
        verificationHints: ["run targeted tests", "inspect diff"],
      },
      deliverableContract: {
        format: "patch",
        summary: "Patch plus verification notes.",
        requiredSections: ["Changes", "Verification"],
      },
    });
  });

  it("patches catalog launch defaults while preserving structured delegation constraints", () => {
    const spec = normalizeAgentLaunchSpecWithCatalog({
      instruction: "Verify the delegated patch.",
      parentConversationId: "conv-2",
      agentId: "verifier",
      delegationProtocol: {
        source: "goal_verifier",
        intent: {
          kind: "verifier_handoff",
          summary: "Verify the delegated patch.",
          role: "verifier",
        },
        contextPolicy: {
          includeParentConversation: true,
          includeStructuredContext: false,
          contextKeys: [],
        },
        expectedDeliverable: {
          format: "verification_report",
          summary: "Verifier summary.",
        },
        aggregationPolicy: {
          mode: "verifier_fan_in",
          summarizeFailures: true,
        },
        launchDefaults: {},
        ownership: {
          scopeSummary: "Verification only.",
        },
        acceptance: {
          doneDefinition: "Findings and release recommendation are explicit.",
        },
        deliverableContract: {
          format: "verification_report",
          requiredSections: ["Findings", "Evidence"],
        },
      },
    }, {
      agentRegistry: {
        getProfile: (id: string) => id === "verifier"
          ? {
            id: "verifier",
            defaultRole: "verifier",
            defaultPermissionMode: "confirm",
            defaultAllowedToolFamilies: ["workspace-read", "command-exec"],
            defaultMaxToolRiskLevel: "high",
          } as any
          : undefined,
      },
    });

    expect(spec.delegationProtocol?.launchDefaults).toEqual({
      permissionMode: "confirm",
      allowedToolFamilies: ["workspace-read", "command-exec"],
      maxToolRiskLevel: "high",
    });
    expect(spec.delegationProtocol?.ownership).toEqual({
      scopeSummary: "Verification only.",
    });
    expect(spec.delegationProtocol?.acceptance).toEqual({
      doneDefinition: "Findings and release recommendation are explicit.",
    });
    expect(spec.delegationProtocol?.deliverableContract).toEqual({
      format: "verification_report",
      summary: "Verifier summary.",
      requiredSections: ["Findings", "Evidence"],
    });
  });
});
