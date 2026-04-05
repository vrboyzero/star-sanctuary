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
      toolContractV2Observability: {
        summary: {
          totalCount: 6,
          missingV2Count: 1,
          highRiskCount: 2,
          confirmRequiredCount: 3,
          governedTools: ["run_command", "apply_patch"],
          missingV2Tools: ["beta_builtin"],
        },
      },
      residentAgents: {
        summary: {
          totalCount: 2,
          activeCount: 1,
          runningCount: 1,
          idleCount: 1,
          backgroundCount: 0,
          errorCount: 0,
          digestReadyCount: 1,
          digestUpdatedCount: 1,
          digestIdleCount: 0,
          digestMissingCount: 0,
          headline: "2 resident agent(s), active=1, isolated=1, shared=0, hybrid=1, running=1, background=0, idle=1, digest-ready=1, digest-updated=1",
          sharedReadEnabledCount: 1,
          memoryModeCounts: {
            isolated: 1,
            shared: 0,
            hybrid: 1,
          },
          writeTargetCounts: {
            private: 2,
            shared: 0,
          },
          sharedGovernanceCounts: {
            pendingCount: 1,
            claimedCount: 1,
            approvedCount: 2,
            rejectedCount: 0,
            revokedCount: 0,
          },
        },
        agents: [
          {
            id: "default",
            displayName: "Belldandy",
            memoryMode: "hybrid",
            sessionNamespace: "default",
            status: "running",
            conversationDigest: {
              status: "updated",
              pendingMessageCount: 3,
            },
            memoryPolicy: {
              writeTarget: "private",
              readTargets: ["private", "shared"],
            },
            sharedGovernance: {
              pendingCount: 1,
              claimedCount: 1,
              approvedCount: 2,
              rejectedCount: 0,
              revokedCount: 0,
            },
          },
          {
            id: "coder",
            displayName: "Coder",
            memoryMode: "isolated",
            sessionNamespace: "coder-main",
            status: "idle",
            conversationDigest: {
              status: "ready",
              pendingMessageCount: 0,
            },
            memoryPolicy: {
              writeTarget: "private",
              readTargets: ["private"],
            },
          },
        ],
      },
      memoryRuntime: {
        sharedMemory: {
          enabled: true,
          available: true,
          reasonMessages: [],
          secretGuard: {
            enabled: true,
            summary: "high-confidence rules enabled",
          },
          syncPolicy: {
            conflictPolicy: {
              summary: "local-write-wins-per-entry",
            },
          },
        },
      },
    });

    expect(lines.join("\n")).toContain("Prompt");
    expect(lines.join("\n")).toContain("约 800 tokens");
    expect(lines.join("\n")).toContain("已省略 2 段");
    expect(lines.join("\n")).toContain("工具使用规则");
    expect(lines.join("\n")).toContain("5 条工具规则生效");
    expect(lines.join("\n")).toContain("当前生效：run_command, apply_patch");
    expect(lines.join("\n")).toContain("Tool Contract V2");
    expect(lines.join("\n")).toContain("6 条 V2 契约");
    expect(lines.join("\n")).toContain("尚未补齐 V2 契约：beta_builtin");
    expect(lines.join("\n")).toContain("Resident Agents");
    expect(lines.join("\n")).toContain("2 个 resident");
    expect(lines.join("\n")).toContain("running 1 / background 0 / idle 1 / error 0");
    expect(lines.join("\n")).toContain("digest ready 1 / updated 1 / idle 0 / missing 0");
    expect(lines.join("\n")).toContain("Belldandy: hybrid");
    expect(lines.join("\n")).toContain("digest=updated/3");
    expect(lines.join("\n")).toContain("Shared Governance");
    expect(lines.join("\n")).toContain("1 个 shared reader");
    expect(lines.join("\n")).toContain("1 pending approval(s)");
    expect(lines.join("\n")).toContain("1 claimed pending item(s)");
    expect(lines.join("\n")).toContain("conflict policy");
  });
});
