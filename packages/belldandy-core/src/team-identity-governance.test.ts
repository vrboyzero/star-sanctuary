import { describe, expect, it } from "vitest";

import type { IdentityAuthorityProfile } from "@belldandy/protocol";

import { enrichDelegationProtocolTeamWithIdentity } from "./team-identity-governance.js";

describe("enrichDelegationProtocolTeamWithIdentity", () => {
  it("fills manager and lane identity governance fields from authority profiles", () => {
    const managerProfile: IdentityAuthorityProfile = {
      currentLabel: "首席执行官 (CEO)",
      superiorLabels: ["董事长"],
      subordinateLabels: ["CTO", "审计"],
      ownerUuids: ["vr777"],
      authorityMode: "verifiable_only",
      responsePolicy: {
        ownerOrSuperior: "execute",
        subordinate: "guide",
        other: "refuse_or_inform",
      },
      source: "identity_md",
    };
    const coderProfile: IdentityAuthorityProfile = {
      currentLabel: "CTO",
      superiorLabels: ["首席执行官 (CEO)"],
      subordinateLabels: ["员工"],
      ownerUuids: [],
      authorityMode: "verifiable_only",
      responsePolicy: {
        ownerOrSuperior: "execute",
        subordinate: "guide",
        other: "refuse_or_inform",
      },
      source: "identity_md",
    };

    const protocol = enrichDelegationProtocolTeamWithIdentity({
      protocol: {
        source: "delegate_parallel",
        intent: {
          kind: "parallel_subtasks",
          summary: "Split the patch work.",
        },
        contextPolicy: {
          includeParentConversation: true,
          includeStructuredContext: false,
          contextKeys: [],
        },
        expectedDeliverable: {
          format: "patch",
          summary: "Patch lane handoff.",
        },
        aggregationPolicy: {
          mode: "parallel_collect",
          summarizeFailures: true,
        },
        launchDefaults: {},
        team: {
          id: "team-1",
          mode: "parallel_patch",
          managerAgentId: "default",
          currentLaneId: "lane_a",
          memberRoster: [
            {
              laneId: "lane_a",
              agentId: "coder",
              role: "coder",
              scopeSummary: "Patch lane A only.",
            },
          ],
        },
      },
      currentAgentId: "coder",
      resolveAuthorityProfile: (agentId) => {
        switch (agentId) {
          case "default":
            return managerProfile;
          case "coder":
            return coderProfile;
          default:
            return undefined;
        }
      },
    });

    expect(protocol?.team).toMatchObject({
      managerIdentityLabel: "首席执行官 (CEO)",
      memberRoster: [
        {
          laneId: "lane_a",
          identityLabel: "CTO",
          authorityRelationToManager: "subordinate",
          reportsTo: ["首席执行官 (CEO)"],
          mayDirect: ["员工"],
        },
      ],
    });
  });
});
