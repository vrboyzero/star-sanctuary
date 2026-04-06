import { describe, expect, it } from "vitest";

import type { ToolContext } from "./types.js";
import { buildSubAgentLaunchSpec } from "./subagent-launch.js";

function createContext(overrides: Partial<ToolContext> = {}): ToolContext {
  return {
    conversationId: "conv-main",
    workspaceRoot: "/tmp/workspace",
    defaultCwd: "/tmp/workspace",
    launchSpec: {
      cwd: "/tmp/workspace",
      permissionMode: "confirm",
      parentTaskId: "task-parent",
    },
    policy: {
      allowedPaths: [],
      deniedPaths: [],
      allowedDomains: [],
      deniedDomains: [],
      maxTimeoutMs: 30_000,
      maxResponseBytes: 512_000,
    },
    ...overrides,
  };
}

describe("buildSubAgentLaunchSpec delegation protocol", () => {
  it("builds ad-hoc protocol for delegate_task", () => {
    const spec = buildSubAgentLaunchSpec(createContext(), {
      instruction: "Patch the failing integration test and explain the fix",
      agentId: "coder",
      channel: "subtask",
      role: "coder",
      delegationSource: "delegate_task",
      context: { file: "packages/belldandy-core/src/server.ts" },
    });

    expect(spec.delegationProtocol).toMatchObject({
      source: "delegate_task",
      intent: {
        kind: "ad_hoc",
        role: "coder",
      },
      expectedDeliverable: {
        format: "patch",
      },
      aggregationPolicy: {
        mode: "single",
      },
      launchDefaults: {
        permissionMode: "confirm",
        maxToolRiskLevel: "high",
      },
    });
    expect(spec.delegationProtocol?.contextPolicy.contextKeys).toEqual(["file"]);
  });

  it("builds verifier fan-in protocol for goal verifier handoff", () => {
    const spec = buildSubAgentLaunchSpec(createContext(), {
      instruction: "Verify the delegated results and decide whether the node is ready to close",
      agentId: "verifier",
      channel: "goal",
      role: "verifier",
      delegationSource: "goal_verifier",
      goalId: "goal-1",
      nodeId: "node-2",
      planId: "plan-3",
      sourceAgentIds: ["coder", "researcher", "coder"],
      aggregationMode: "verifier_fan_in",
      expectedDeliverableSummary: "Verifier summary with findings and final decision.",
      context: {
        goalId: "goal-1",
        nodeId: "node-2",
        sourceTaskIds: ["task-1", "task-2"],
      },
    });

    expect(spec.delegationProtocol).toMatchObject({
      source: "goal_verifier",
      intent: {
        kind: "verifier_handoff",
        role: "verifier",
        goalId: "goal-1",
        nodeId: "node-2",
        planId: "plan-3",
      },
      expectedDeliverable: {
        format: "verification_report",
        summary: "Verifier summary with findings and final decision.",
      },
      aggregationPolicy: {
        mode: "verifier_fan_in",
        sourceAgentIds: ["coder", "researcher"],
      },
    });
  });

  it("keeps custom profile launches open for catalog defaults instead of forcing role defaults", () => {
    const spec = buildSubAgentLaunchSpec(createContext({ launchSpec: undefined }), {
      instruction: "Implement rollout guardrails",
      agentId: "ops-coder",
      channel: "goal",
      role: "coder",
      delegationSource: "goal_subtask",
    });

    expect(spec.permissionMode).toBeUndefined();
    expect(spec.allowedToolFamilies).toBeUndefined();
    expect(spec.maxToolRiskLevel).toBeUndefined();
    expect(spec.delegationProtocol?.launchDefaults).toEqual({
      permissionMode: undefined,
      allowedToolFamilies: undefined,
      maxToolRiskLevel: undefined,
    });
  });
});
