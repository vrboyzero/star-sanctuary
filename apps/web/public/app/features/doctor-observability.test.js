import { describe, expect, it } from "vitest";

import { buildDoctorChatSummary } from "./doctor-observability.js";

describe("doctor observability formatting", () => {
  it("builds a user-facing doctor summary for prompt and tool observability", () => {
    const lines = buildDoctorChatSummary({
      promptObservability: {
        residentStateBinding: {
          workspaceScopeSummary: "current workspace scope (default) rooted at E:/state",
          stateScopeSummary: "root-default private=E:/state; sessions=E:/state/sessions; shared=E:/state/team-memory",
        },
        launchExplainability: {
          catalogDefault: {
            role: "default",
            permissionMode: "confirm",
            allowedToolFamilies: ["workspace-read", "patch"],
            maxToolRiskLevel: "high",
            handoffStyle: "summary",
          },
          effectiveLaunch: {
            source: "catalog_default",
            agentId: "default",
            role: "default",
            permissionMode: "confirm",
            allowedToolFamilies: ["workspace-read", "patch"],
            maxToolRiskLevel: "high",
            handoffStyle: "summary",
          },
          delegationReason: null,
        },
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
        visibilityContext: {
          launchExplainability: {
            catalogDefault: {
              role: "coder",
              permissionMode: "confirm",
              allowedToolFamilies: ["workspace-read", "workspace-write", "patch"],
              maxToolRiskLevel: "high",
              handoffStyle: "structured",
            },
            effectiveLaunch: {
              source: "runtime_launch_spec",
              agentId: "coder",
              profileId: "coder",
              role: "coder",
              permissionMode: "plan",
              allowedToolFamilies: ["workspace-read", "patch"],
              maxToolRiskLevel: "medium",
              policySummary: "permission=plan, patch-only",
              handoffStyle: "structured",
            },
            delegationReason: {
              source: "goal_subtask",
              intentKind: "goal_execution",
              intentSummary: "整理工具治理摘要",
              expectedDeliverableSummary: "返回治理摘要",
              aggregationMode: "main_agent_summary",
              contextKeys: ["goalId", "taskId"],
              sourceAgentIds: ["planner"],
            },
          },
          residentStateBinding: {
            workspaceScopeSummary: "current workspace scope (default) rooted at E:/state",
            stateScopeSummary: "root-default private=E:/state; sessions=E:/state/sessions; shared=E:/state/team-memory",
          },
        },
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
          recentTaskLinkedCount: 1,
          recentSubtaskLinkedCount: 1,
          experienceUsageLinkedCount: 1,
          catalogAnnotatedCount: 1,
          structuredHandoffCount: 1,
          skillHintedCount: 1,
          headline: "2 resident agent(s), active=1, isolated=1, shared=0, hybrid=1, running=1, background=0, idle=1, digest-ready=1, digest-updated=1, task-linked=1, subtask-linked=1, usage-linked=1",
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
            recentTaskDigest: {
              recentCount: 1,
              latestTaskId: "task-1",
              latestTitle: "收口 resident 任务观测",
              latestStatus: "success",
            },
            recentSubtaskDigest: {
              recentCount: 1,
              latestTaskId: "subtask-1",
              latestSummary: "整理 resident 连续观测摘要卡",
              latestStatus: "running",
              latestAgentId: "coder",
            },
            experienceUsageDigest: {
              usageCount: 2,
              methodCount: 1,
              skillCount: 1,
              latestAssetType: "method",
              latestAssetKey: "resident-observability-playbook.md",
              latestTaskId: "task-1",
            },
            memoryPolicy: {
              writeTarget: "private",
              readTargets: ["private", "shared"],
            },
            catalog: {
              defaultRole: "default",
              defaultPermissionMode: "confirm",
              defaultMaxToolRiskLevel: "high",
              skills: ["resident-observability"],
              whenToUse: ["收口 resident 主线"],
              handoffStyle: "summary",
            },
            launchExplainability: {
              catalogDefault: {
                role: "default",
                permissionMode: "confirm",
                allowedToolFamilies: ["workspace-read", "patch"],
                maxToolRiskLevel: "high",
                handoffStyle: "summary",
                skills: ["resident-observability"],
                whenToUse: ["收口 resident 主线"],
              },
              effectiveLaunch: {
                source: "catalog_default",
                agentId: "default",
                profileId: "default",
                role: "default",
                permissionMode: "confirm",
                allowedToolFamilies: ["workspace-read", "patch"],
                maxToolRiskLevel: "high",
                handoffStyle: "summary",
              },
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
            catalog: {
              defaultRole: "coder",
              defaultPermissionMode: "confirm",
              defaultMaxToolRiskLevel: "high",
              skills: [],
              whenToUse: [],
              handoffStyle: "structured",
            },
            launchExplainability: {
              catalogDefault: {
                role: "coder",
                permissionMode: "confirm",
                allowedToolFamilies: ["workspace-read", "workspace-write", "patch"],
                maxToolRiskLevel: "high",
                handoffStyle: "structured",
              },
              effectiveLaunch: {
                source: "catalog_default",
                agentId: "coder",
                profileId: "coder",
                role: "coder",
                permissionMode: "confirm",
                allowedToolFamilies: ["workspace-read", "workspace-write", "patch"],
                maxToolRiskLevel: "high",
                handoffStyle: "structured",
              },
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
      delegationObservability: {
        summary: {
          totalCount: 2,
          protocolBackedCount: 1,
          completedCount: 1,
          activeCount: 1,
          sourceCounts: {
            goal_subtask: 1,
          },
          aggregationModeCounts: {
            main_agent_summary: 1,
          },
          headline: "delegation protocol=1/2; active=1; completed=1; sources=goal_subtask:1",
        },
        items: [
          {
            taskId: "subtask-1",
            agentId: "coder",
            status: "running",
            source: "goal_subtask",
            aggregationMode: "main_agent_summary",
            expectedDeliverableFormat: "patch",
            expectedDeliverableSummary: "返回治理摘要",
            intentSummary: "整理工具治理摘要",
          },
        ],
      },
    });

    expect(lines.join("\n")).toContain("Prompt");
    expect(lines.join("\n")).toContain("约 800 tokens");
    expect(lines.join("\n")).toContain("已省略 2 段");
    expect(lines.join("\n")).toContain("workspace scope: current workspace scope (default) rooted at E:/state");
    expect(lines.join("\n")).toContain("state scope: root-default private=E:/state; sessions=E:/state/sessions; shared=E:/state/team-memory");
    expect(lines.join("\n")).toContain("catalog default: role=default");
    expect(lines.join("\n")).toContain("effective launch: source=catalog_default, agent=default");
    expect(lines.join("\n")).toContain("工具使用规则");
    expect(lines.join("\n")).toContain("5 条工具规则生效");
    expect(lines.join("\n")).toContain("workspace / state scope 绑定");
    expect(lines.join("\n")).toContain("workspace scope: current workspace scope (default) rooted at E:/state");
    expect(lines.join("\n")).toContain("state scope: root-default private=E:/state; sessions=E:/state/sessions; shared=E:/state/team-memory");
    expect(lines.join("\n")).toContain("effective launch: source=runtime_launch_spec, agent=coder");
    expect(lines.join("\n")).toContain("delegation reason: source=goal_subtask");
    expect(lines.join("\n")).toContain("当前生效：run_command, apply_patch");
    expect(lines.join("\n")).toContain("Tool Contract V2");
    expect(lines.join("\n")).toContain("6 条 V2 契约");
    expect(lines.join("\n")).toContain("尚未补齐 V2 契约：beta_builtin");
    expect(lines.join("\n")).toContain("Resident Agents");
    expect(lines.join("\n")).toContain("2 个 resident");
    expect(lines.join("\n")).toContain("running 1 / background 0 / idle 1 / error 0");
    expect(lines.join("\n")).toContain("digest ready 1 / updated 1 / idle 0 / missing 0");
    expect(lines.join("\n")).toContain("1 resident(s) with recent task context");
    expect(lines.join("\n")).toContain("1 resident(s) with recent subtask context");
    expect(lines.join("\n")).toContain("1 resident(s) with experience usage context");
    expect(lines.join("\n")).toContain("1 resident(s) with catalog guidance");
    expect(lines.join("\n")).toContain("1 resident(s) with structured handoff");
    expect(lines.join("\n")).toContain("1 resident(s) with skill hints");
    expect(lines.join("\n")).toContain("Belldandy: hybrid");
    expect(lines.join("\n")).toContain("role=default");
    expect(lines.join("\n")).toContain("permission=confirm");
    expect(lines.join("\n")).toContain("risk=high");
    expect(lines.join("\n")).toContain("handoff=summary");
    expect(lines.join("\n")).toContain("skills=resident-observability");
    expect(lines.join("\n")).toContain("when=收口 resident 主线");
    expect(lines.join("\n")).toContain("digest=updated/3");
    expect(lines.join("\n")).toContain("task=收口 resident 任务观测 · success");
    expect(lines.join("\n")).toContain("subtask=整理 resident 连续观测摘要卡 · running · coder");
    expect(lines.join("\n")).toContain("review=p1/c1");
    expect(lines.join("\n")).toContain("usage=m1/s1 · resident-observability-playbook.md");
    expect(lines.join("\n")).toContain("Shared Governance");
    expect(lines.join("\n")).toContain("1 个 shared reader");
    expect(lines.join("\n")).toContain("1 pending approval(s)");
    expect(lines.join("\n")).toContain("1 claimed pending item(s)");
    expect(lines.join("\n")).toContain("conflict policy");
    expect(lines.join("\n")).toContain("Delegation Protocol");
    expect(lines.join("\n")).toContain("1/2 protocol-backed");
    expect(lines.join("\n")).toContain("aggregation main_agent_summary:1");
    expect(lines.join("\n")).toContain("subtask-1: status=running, source=goal_subtask, aggregation=main_agent_summary, deliverable=patch, deliverable-summary=返回治理摘要, intent=整理工具治理摘要");
  });
});
