import { describe, expect, it } from "vitest";

import {
  buildGoalCheckpointExplainabilityEntry,
  buildGoalDelegationResultExplainabilityEntry,
  buildGoalSubAgentExplainabilityEntries,
  buildGoalVerifierExplainabilityEntry,
} from "./goal-launch-explainability.js";

describe("goal launch explainability helpers", () => {
  const plan = {
    goalId: "goal_demo",
    nodeId: "node_impl",
    runId: "run_1",
    riskLevel: "high",
    orchestration: {
      coordinationPlan: {
        rolePolicy: {
          fanInStrategy: "verifier_handoff",
        },
      },
      verifierHandoff: {
        verifierAgentId: "verifier",
        summary: "Collect verifier handoff",
        sourceAgentIds: ["coder"],
      },
      verifierResult: {
        summary: "Verifier result summary",
      },
    },
    checkpoint: {
      required: true,
      approvalMode: "strict",
      suggestedReviewer: "reviewer",
      suggestedReviewerRole: "verifier",
      suggestedTitle: "High-risk checkpoint",
      suggestedNote: "Need approval before execution",
      reasons: ["high risk"],
      requiredRequestFields: ["impact"],
      requiredDecisionFields: ["decision"],
    },
    subAgents: [
      {
        agentId: "coder",
        role: "coder",
        objective: "Implement runtime fix",
        reason: "catalog matched coder",
        deliverable: "Return patch summary",
        handoffToVerifier: true,
        catalogDefault: {
          permissionMode: "confirm",
          allowedToolFamilies: ["workspace-read", "workspace-write"],
          maxToolRiskLevel: "high",
          handoffStyle: "summary",
        },
      },
      {
        agentId: "verifier",
        role: "verifier",
        objective: "Review patch",
        deliverable: "Return review findings",
        catalogDefault: {
          permissionMode: "confirm",
          allowedToolFamilies: ["workspace-read"],
          maxToolRiskLevel: "medium",
          handoffStyle: "structured",
        },
      },
    ],
  };

  it("builds explainability entries for planned subagents", () => {
    const entries = buildGoalSubAgentExplainabilityEntries(plan);
    expect(entries).toEqual(expect.arrayContaining([
      expect.objectContaining({
        label: "coder",
        lines: expect.arrayContaining([
          expect.stringContaining("catalog default: permission=confirm"),
          expect.stringContaining("suggested launch: source=goal_capability_plan, agent=coder"),
          expect.stringContaining("delegation reason: source=goal_capability_plan"),
        ]),
      }),
    ]));
  });

  it("builds explainability entry for delegation result via matched subagent", () => {
    const entry = buildGoalDelegationResultExplainabilityEntry(plan, {
      agentId: "coder",
      status: "success",
    });
    expect(entry?.label).toBe("coder");
    expect(entry?.lines.join("\n")).toContain("summary=Implement runtime fix");
  });

  it("builds explainability entry for verifier handoff", () => {
    const entry = buildGoalVerifierExplainabilityEntry(plan);
    expect(entry?.lines.join("\n")).toContain("source=goal_verifier_handoff");
    expect(entry?.lines.join("\n")).toContain("aggregation=verifier_handoff");
  });

  it("builds explainability entry for checkpoint routing", () => {
    const entry = buildGoalCheckpointExplainabilityEntry(plan);
    expect(entry?.label).toBe("checkpoint");
    expect(entry?.lines.join("\n")).toContain("source=goal_checkpoint");
    expect(entry?.lines.join("\n")).toContain("intent=checkpoint");
    expect(entry?.lines.join("\n")).toContain("suggested launch: source=goal_checkpoint, agent=reviewer");
    expect(entry?.lines.join("\n")).toContain("agent=reviewer");
  });
});
