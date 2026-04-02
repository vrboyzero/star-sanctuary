import { describe, expect, it } from "vitest";
import type { Tool, ToolCallResult } from "./types.js";
import {
  evaluateToolContractAccess,
  matchesSecurityMatrixSubject,
  resolveSafeScopesForChannel,
} from "./security-matrix.js";
import { withToolContract } from "./tool-contract.js";

function createTool(name: string): Tool {
  return {
    definition: {
      name,
      description: `${name} tool`,
      parameters: {
        type: "object",
        properties: {},
      },
    },
    async execute(): Promise<ToolCallResult> {
      return {
        id: "",
        name,
        success: true,
        output: "",
        durationMs: 0,
      };
    },
  };
}

describe("security-matrix", () => {
  it("matches channel and safe-scope filters with one shared helper", () => {
    const matched = matchesSecurityMatrixSubject({
      channels: ["cli", "web"],
      safeScopes: ["local-safe", "web-safe"],
    }, {
      channel: "cli",
      allowedSafeScopes: ["local-safe"],
    });

    expect(matched).toBe(true);
  });

  it("resolves explicit safe scopes for cli and gateway", () => {
    expect(resolveSafeScopesForChannel("cli")).toContain("privileged");
    expect(resolveSafeScopesForChannel("gateway")).toContain("bridge-safe");
  });

  it("blocks tool contracts by name, channel and safe scope", () => {
    const tool = withToolContract(createTool("run_command"), {
      family: "command-exec",
      isReadOnly: false,
      isConcurrencySafe: false,
      needsPermission: true,
      riskLevel: "critical",
      channels: ["gateway"],
      safeScopes: ["privileged"],
      activityDescription: "Run local commands",
      resultSchema: { kind: "text", description: "Command output" },
      outputPersistencePolicy: "conversation",
    });

    expect(evaluateToolContractAccess(tool, {
      channel: "gateway",
      allowedSafeScopes: ["privileged"],
      blockedToolNames: ["run_command"],
    })).toMatchObject({ allowed: false, reason: "blocked" });

    expect(evaluateToolContractAccess(tool, {
      channel: "web",
      allowedSafeScopes: ["privileged"],
    })).toMatchObject({ allowed: false, reason: "channel" });

    expect(evaluateToolContractAccess(tool, {
      channel: "gateway",
      allowedSafeScopes: ["local-safe"],
    })).toMatchObject({ allowed: false, reason: "safe-scope" });
  });
});
