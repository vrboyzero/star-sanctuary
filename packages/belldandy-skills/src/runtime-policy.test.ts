import { describe, expect, it } from "vitest";

import { withToolContract } from "./tool-contract.js";
import {
  evaluateLaunchPermissionMode,
  evaluateLaunchRolePolicy,
} from "./runtime-policy.js";
import type { Tool } from "./types.js";

function createTool(name: string): Tool {
  return {
    definition: {
      name,
      description: `tool ${name}`,
      parameters: { type: "object", properties: {} },
    },
    async execute() {
      return {
        id: name,
        name,
        success: true,
        output: "ok",
        durationMs: 1,
      };
    },
  };
}

function createContractedTool(
  name: string,
  input: {
    family: "workspace-read" | "workspace-write" | "patch" | "command-exec" | "session-orchestration" | "browser" | "network-read" | "other";
    riskLevel: "low" | "medium" | "high" | "critical";
    needsPermission: boolean;
    isReadOnly: boolean;
    isConcurrencySafe?: boolean;
  },
): Tool {
  return withToolContract(createTool(name), {
    family: input.family,
    riskLevel: input.riskLevel,
    needsPermission: input.needsPermission,
    isReadOnly: input.isReadOnly,
    isConcurrencySafe: input.isConcurrencySafe ?? input.isReadOnly,
    channels: ["gateway"],
    safeScopes: ["local-safe"],
    activityDescription: `contracted ${name}`,
    resultSchema: {
      kind: "text",
      description: `${name} output`,
    },
    outputPersistencePolicy: "conversation",
  });
}

describe("runtime launch policy", () => {
  it("rejects non-readonly tools in plan mode with V2 summary", () => {
    const tool = createContractedTool("file_write", {
      family: "workspace-write",
      riskLevel: "high",
      needsPermission: true,
      isReadOnly: false,
    });

    const decision = evaluateLaunchPermissionMode(tool, {
      permissionMode: "plan",
    });

    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.reasonMessage).toContain("permissionMode=plan");
    expect(decision.reasonMessage).toContain("## file_write");
    expect(decision.reasonMessage).toContain("family=workspace-write");
    expect(decision.reasonMessage).toContain("risk=high");
  });

  it("rejects permissioned non-edit tools in acceptEdits mode", () => {
    const tool = createContractedTool("run_command", {
      family: "command-exec",
      riskLevel: "critical",
      needsPermission: true,
      isReadOnly: false,
      isConcurrencySafe: false,
    });

    const decision = evaluateLaunchPermissionMode(tool, {
      permissionMode: "acceptEdits",
    });

    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.reasonMessage).toContain("permissionMode=acceptEdits");
    expect(decision.reasonMessage).toContain("## run_command");
    expect(decision.reasonMessage).toContain("family=command-exec");
    expect(decision.reasonMessage).toContain("risk=critical");
  });

  it("rejects family-mismatched tools under role policy with summary detail", () => {
    const tool = createContractedTool("run_command", {
      family: "command-exec",
      riskLevel: "critical",
      needsPermission: true,
      isReadOnly: false,
      isConcurrencySafe: false,
    });

    const decision = evaluateLaunchRolePolicy(tool, {
      role: "researcher",
      allowedToolFamilies: ["workspace-read", "network-read"],
    });

    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.reasonMessage).toContain("role=researcher");
    expect(decision.reasonMessage).toContain("family=command-exec");
    expect(decision.reasonMessage).toContain("## run_command");
  });

  it("rejects risk-mismatched tools under role policy with max-risk detail", () => {
    const tool = createContractedTool("browser_open", {
      family: "browser",
      riskLevel: "medium",
      needsPermission: true,
      isReadOnly: false,
      isConcurrencySafe: false,
    });

    const decision = evaluateLaunchRolePolicy(tool, {
      role: "verifier",
      allowedToolFamilies: ["browser"],
      maxToolRiskLevel: "low",
    });

    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.reasonMessage).toContain("role=verifier");
    expect(decision.reasonMessage).toContain("risk=medium, max=low");
    expect(decision.reasonMessage).toContain("## browser_open");
  });

  it("uses V2 profile summaries even when a known tool is missing governance contract", () => {
    const tool = createTool("file_write");

    const decision = evaluateLaunchPermissionMode(tool, {
      permissionMode: "confirm",
    });

    expect(decision.allowed).toBe(false);
    if (decision.allowed) return;
    expect(decision.reasonMessage).not.toContain("缺少治理契约");
    expect(decision.reasonMessage).toContain("## file_write");
    expect(decision.reasonMessage).toContain("family=workspace-write");
    expect(decision.reasonMessage).toContain("risk=high");
  });
});
