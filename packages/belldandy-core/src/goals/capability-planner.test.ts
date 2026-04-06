import { describe, expect, it } from "vitest";

import { buildGoalCapabilityPlan } from "./capability-planner.js";

describe("buildGoalCapabilityPlan", () => {
  it("prefers agent catalog defaults when selecting sub-agents", () => {
    const plan = buildGoalCapabilityPlan({
      goalTitle: "Release guardrails",
      nodeId: "node-1",
      nodeTitle: "实现上线前校验并补回归验收",
      nodeDescription: "需要编码实现、补充验证，并在上线前收口风险。",
      availableAgents: [
        {
          id: "ops-coder",
          kind: "resident",
          catalog: {
            defaultRole: "coder",
            defaultPermissionMode: "confirm",
            defaultAllowedToolFamilies: ["workspace-read", "workspace-write", "patch"],
            defaultMaxToolRiskLevel: "high",
            whenToUse: ["实现上线前校验", "需要改代码"],
            skills: ["repo-map"],
            handoffStyle: "summary",
          },
        },
        {
          id: "audit-verifier",
          kind: "worker",
          catalog: {
            defaultRole: "verifier",
            defaultPermissionMode: "confirm",
            whenToUse: ["补回归验收", "风险收口"],
            skills: ["review-checklist"],
            handoffStyle: "structured",
          },
        },
      ],
      forceMode: "multi_agent",
    });

    expect(plan.executionMode).toBe("multi_agent");
    expect(plan.subAgents ?? []).toEqual(expect.arrayContaining([
      expect.objectContaining({
        agentId: "ops-coder",
        role: "coder",
      }),
      expect.objectContaining({
        agentId: "audit-verifier",
        role: "verifier",
      }),
    ]));
    expect(plan.reasoning).toEqual(expect.arrayContaining([
      expect.stringContaining("agent catalog"),
      expect.stringContaining("checkpoint"),
    ]));
    expect((plan.subAgents ?? []).find((item) => item.agentId === "ops-coder")?.reason).toContain("catalog defaultRole=coder");
    expect((plan.subAgents ?? []).find((item) => item.agentId === "audit-verifier")?.reason).toContain("catalog handoff=structured");
    expect((plan.subAgents ?? []).find((item) => item.agentId === "ops-coder")?.catalogDefault).toMatchObject({
      permissionMode: "confirm",
      allowedToolFamilies: ["workspace-read", "workspace-write", "patch"],
      maxToolRiskLevel: "high",
      handoffStyle: "summary",
    });
    expect(plan.checkpoint?.suggestedNote).toContain("catalog default");
    expect(plan.checkpoint?.suggestedNote).toContain("ops-coder(coder)");
  });
});
