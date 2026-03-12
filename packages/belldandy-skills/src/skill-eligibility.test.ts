import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SkillDefinition, EligibilityContext } from "./skill-types.js";
import { checkEligibility, checkEligibilityBatch } from "./skill-eligibility.js";

const { execFileMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
}));

vi.mock("node:child_process", () => ({
  execFile: execFileMock,
}));

const baseSkill: SkillDefinition = {
  name: "portable-smoke",
  description: "portable smoke skill",
  priority: "normal",
  instructions: "test",
  source: { type: "bundled" },
};

const ctx: EligibilityContext = {
  registeredTools: [],
  activeMcpServers: [],
  workspaceRoot: process.cwd(),
};

describe("skill eligibility bin checks", () => {
  beforeEach(() => {
    execFileMock.mockReset();
  });

  it("treats sync spawn errors as missing bin instead of throwing", async () => {
    execFileMock.mockImplementation(() => {
      const error = new Error("spawn EPERM");
      (error as NodeJS.ErrnoException).code = "EPERM";
      throw error;
    });

    const result = await checkEligibility(
      {
        ...baseSkill,
        eligibility: { bin: ["git"] },
      },
      ctx,
    );

    expect(result).toEqual({
      eligible: false,
      reasons: ["missing bin: git"],
    });
  });

  it("keeps batch checks alive when one bin probe throws synchronously", async () => {
    execFileMock.mockImplementation((command: string, args: string[], options: unknown, callback: (error: Error | null) => void) => {
      const [bin] = args;
      if (bin === "blocked-bin") {
        const error = new Error("spawn EPERM");
        (error as NodeJS.ErrnoException).code = "EPERM";
        throw error;
      }
      callback(null);
      return undefined;
    });

    const results = await checkEligibilityBatch(
      [
        {
          ...baseSkill,
          name: "blocked",
          eligibility: { bin: ["blocked-bin"] },
        },
        {
          ...baseSkill,
          name: "available",
          eligibility: { bin: ["node"] },
        },
      ],
      ctx,
    );

    expect(results.get("blocked")).toEqual({
      eligible: false,
      reasons: ["missing bin: blocked-bin"],
    });
    expect(results.get("available")).toEqual({
      eligible: true,
      reasons: [],
    });
  });
});
