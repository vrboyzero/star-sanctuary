import { describe, expect, it } from "vitest";

import { buildDoctorChatSummary } from "./doctor-observability.js";

describe("doctor observability formatting", () => {
  it("builds a user-facing doctor summary for prompt and tool observability", () => {
    const lines = buildDoctorChatSummary({
      promptObservability: {
        summary: {
          scope: "run",
          agentId: "default",
          conversationId: "conv-1",
          counts: {
            sectionCount: 12,
            deltaCount: 2,
            providerNativeSystemBlockCount: 4,
          },
          promptSizes: {
            finalChars: 3200,
          },
          tokenBreakdown: {
            systemPromptEstimatedTokens: 800,
          },
          truncationReason: {
            code: "max_chars_limit",
            droppedSectionCount: 2,
            droppedSectionLabels: ["methodology", "workspace-dir"],
            maxChars: 3000,
          },
        },
      },
      toolBehaviorObservability: {
        counts: {
          includedContractCount: 5,
          visibleToolContractCount: 5,
        },
        included: ["run_command", "apply_patch"],
        experiment: {
          disabledContractNamesApplied: ["delegate_parallel"],
        },
      },
    });

    expect(lines.join("\n")).toContain("Prompt");
    expect(lines.join("\n")).toContain("约 800 tokens");
    expect(lines.join("\n")).toContain("已省略 2 段");
    expect(lines.join("\n")).toContain("工具使用规则");
    expect(lines.join("\n")).toContain("5 条工具规则生效");
    expect(lines.join("\n")).toContain("当前生效：run_command, apply_patch");
  });
});
