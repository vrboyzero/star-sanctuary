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
      mindProfileSnapshot: {
        summary: {
          available: true,
          selectedAgentId: "default",
          headline: "user ready, private 2, shared 1, digest 1/1, usage 1",
          activeResidentCount: 1,
          digestReadyCount: 1,
          digestUpdatedCount: 1,
          usageLinkedCount: 1,
          privateMemoryCount: 2,
          sharedMemoryCount: 1,
          summaryLineCount: 3,
          hasUserProfile: true,
          hasPrivateMemoryFile: true,
          hasSharedMemoryFile: true,
        },
        profile: {
          summaryLines: [
            "USER.md: 喜欢简洁状态表与短结论。",
            "Private MEMORY.md: 优先把大文件主体逻辑外移。",
            "Shared MEMORY.md: 外发统一走 sessionKey / binding。",
          ],
        },
        conversation: {
          topResidents: [
            {
              agentId: "default",
              headline: "Belldandy: status=running, digest=updated, pending=3",
            },
          ],
        },
        memory: {
          recentMemorySnippets: [
            {
              scope: "private",
              text: "优先把大文件主体逻辑外移。",
            },
            {
              scope: "shared",
              text: "外发统一走 sessionKey / binding。",
            },
          ],
        },
      },
      learningReviewInput: {
        summary: {
          available: true,
          headline: "memory=4, candidate=1, review=0, nudges=2",
          memorySignalCount: 4,
          candidateSignalCount: 1,
          reviewSignalCount: 0,
          nudgeCount: 2,
        },
        summaryLines: [
          "Mind snapshot: USER.md: 喜欢简洁状态表与短结论。",
          "Profile anchor: USER.md: 喜欢简洁状态表与短结论。",
        ],
        nudges: [
          "当前输入已具备最小 learning/review 条件，可继续进入 candidate / governance 审阅。",
          "优先回顾高频 methods/skills 的最新 usage。",
        ],
      },
      learningReviewNudgeRuntime: {
        summary: {
          available: true,
          triggered: true,
          headline: "latest foreground run triggered learning/review nudge; session=goal_node; source=explicit_user_intent+goal_review_pressure; signals=candidate/review; lines=1",
          sessionKind: "goal_node",
          triggerSources: ["explicit_user_intent", "goal_review_pressure"],
          signalKinds: ["candidate", "review"],
          lineCount: 1,
        },
        latest: {
          conversationId: "goal:goal_alpha:node:node_1:run:run_1",
          runId: "run_1",
          createdAt: 1710000130000,
          currentTurnPreview: "请帮我整理这轮长期任务的经验候选",
        },
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
      cronRuntime: {
        scheduler: {
          enabled: true,
          running: true,
          activeRuns: 2,
          lastTickAtMs: 1710000000000,
        },
        totals: {
          totalJobs: 3,
          enabledJobs: 2,
          disabledJobs: 1,
          staggeredJobs: 1,
          invalidNextRunJobs: 0,
        },
        sessionTargetCounts: {
          main: 1,
          isolated: 2,
        },
        deliveryModeCounts: {
          user: 2,
          none: 1,
        },
        failureDestinationModeCounts: {
          user: 1,
          none: 2,
        },
        recentJobs: [
          {
            id: "cron-job-1",
            name: "Digest",
            enabled: true,
            scheduleSummary: "every 60000ms",
            sessionTarget: "main",
            deliveryMode: "user",
            failureDestinationMode: "user",
            staggerMs: 15000,
            nextRunAtMs: 1710000060000,
            lastStatus: "ok",
          },
        ],
        headline: "enabled; jobs=2/3; session main=1; isolated=2; delivery user=2; none=1; stagger=1; activeRuns=2",
      },
      backgroundContinuationRuntime: {
        totals: {
          totalRuns: 4,
          runningRuns: 1,
          failedRuns: 1,
          skippedRuns: 1,
          conversationLinkedRuns: 3,
        },
        kindCounts: {
          cron: 2,
          heartbeat: 1,
          subtask: 1,
        },
        sessionTargetCounts: {
          main: 1,
          isolated: 1,
        },
        recentEntries: [
          {
            runId: "cron-run-1",
            kind: "cron",
            sourceId: "cron-job-1",
            label: "Digest",
            status: "ran",
            startedAt: 1710000000000,
            finishedAt: 1710000000200,
            summary: "Digest completed.",
            conversationId: "cron-main:cron-job-1",
            sessionTarget: "main",
            continuationState: {
              recommendedTargetId: "cron-main:cron-job-1",
              targetType: "conversation",
            },
          },
          {
            runId: "subtask:task_sub_1",
            kind: "subtask",
            sourceId: "task_sub_1",
            label: "Implement runtime bridge",
            status: "ran",
            startedAt: 1710000015000,
            finishedAt: 1710000015600,
            summary: "patch delivered",
            continuationState: {
              recommendedTargetId: "sub-session-1",
              targetType: "session",
            },
          },
          {
            runId: "heartbeat-run-1",
            kind: "heartbeat",
            sourceId: "heartbeat",
            label: "Heartbeat",
            status: "failed",
            startedAt: 1710000010000,
            finishedAt: 1710000010500,
            reason: "provider unavailable",
            continuationState: {},
          },
        ],
        headline: "runs=4; running=1; failed=1; skipped=1; cron=2; heartbeat=1; subtask=1; linked=3; main=1; isolated=1",
      },
      externalOutboundRuntime: {
        requireConfirmation: true,
        totals: {
          totalRecords: 5,
          confirmedCount: 2,
          autoApprovedCount: 2,
          rejectedCount: 1,
          sentCount: 3,
          failedCount: 2,
          resolveFailedCount: 1,
          deliveryFailedCount: 1,
        },
        channelCounts: {
          feishu: 2,
          qq: 2,
          discord: 1,
        },
        errorCodeCounts: {
          binding_not_found: 1,
          send_failed: 1,
        },
        failureStageCounts: {
          resolve: 1,
          delivery: 1,
          confirmation: 0,
        },
        recentFailures: [
          {
            timestamp: 1710000100000,
            targetChannel: "qq",
            delivery: "failed",
            resolution: "latest_binding",
            failureStage: "resolve",
            errorCode: "binding_not_found",
            error: "当前没有可用于 qq 的最新会话绑定。",
            requestedSessionKey: "channel=qq:chat=chat-2",
            contentPreview: "请去 QQ 提醒我",
          },
          {
            timestamp: 1710000120000,
            targetChannel: "discord",
            delivery: "failed",
            resolution: "explicit_session_key",
            failureStage: "delivery",
            errorCode: "send_failed",
            error: "discord send failed",
            targetSessionKey: "channel=discord:chat=room-1",
            contentPreview: "请去 Discord 提醒我",
          },
        ],
        headline: "records=5; sent=3; failed=2; resolve_failed=1; delivery_failed=1; confirm=required",
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
    expect(lines.join("\n")).toContain("Mind / Profile Snapshot");
    expect(lines.join("\n")).toContain("user ready, private 2, shared 1, digest 1/1, usage 1");
    expect(lines.join("\n")).toContain("USER.md: 喜欢简洁状态表与短结论。");
    expect(lines.join("\n")).toContain("Resident: Belldandy: status=running, digest=updated, pending=3");
    expect(lines.join("\n")).toContain("Learning / Review Input");
    expect(lines.join("\n")).toContain("memory 4 / candidate 1 / review 0");
    expect(lines.join("\n")).toContain("runtime triggered");
    expect(lines.join("\n")).toContain("session goal_node");
    expect(lines.join("\n")).toContain("sources: explicit_user_intent, goal_review_pressure");
    expect(lines.join("\n")).toContain("signals: candidate, review");
    expect(lines.join("\n")).toContain("Latest turn: 请帮我整理这轮长期任务的经验候选");
    expect(lines.join("\n")).toContain("Nudge: 当前输入已具备最小 learning/review 条件，可继续进入 candidate / governance 审阅。");
    expect(lines.join("\n")).toContain("Shared Governance");
    expect(lines.join("\n")).toContain("1 个 shared reader");
    expect(lines.join("\n")).toContain("1 pending approval(s)");
    expect(lines.join("\n")).toContain("1 claimed pending item(s)");
    expect(lines.join("\n")).toContain("conflict policy");
    expect(lines.join("\n")).toContain("Delegation Protocol");
    expect(lines.join("\n")).toContain("1/2 protocol-backed");
    expect(lines.join("\n")).toContain("aggregation main_agent_summary:1");
    expect(lines.join("\n")).toContain("subtask-1: status=running, source=goal_subtask, aggregation=main_agent_summary, deliverable=patch, deliverable-summary=返回治理摘要, intent=整理工具治理摘要");
    expect(lines.join("\n")).toContain("Cron Runtime");
    expect(lines.join("\n")).toContain("2/3 jobs enabled");
    expect(lines.join("\n")).toContain("delivery user 2 / none 1");
    expect(lines.join("\n")).toContain("running / active 2");
    expect(lines.join("\n")).toContain("Digest: every 60000ms, enabled, session=main, delivery=user, failure=user, stagger=15000");
    expect(lines.join("\n")).toContain("Background Continuation Runtime");
    expect(lines.join("\n")).toContain("4 runs / running 1");
    expect(lines.join("\n")).toContain("cron 2 / heartbeat 1 / subtask 1");
    expect(lines.join("\n")).toContain("Digest: ran, cron, session=main, target=conversation:cron-main:cron-job-1");
    expect(lines.join("\n")).toContain("Implement runtime bridge: ran, subtask, target=session:sub-session-1, summary=patch delivered");
    expect(lines.join("\n")).toContain("Heartbeat: failed, heartbeat, reason=provider unavailable");
    expect(lines.join("\n")).toContain("External Outbound Runtime");
    expect(lines.join("\n")).toContain("5 records / sent 3 / failed 2");
    expect(lines.join("\n")).toContain("resolve 1 / delivery 1 / confirmation 0");
    expect(lines.join("\n")).toContain("channels feishu:2, qq:2, discord:1");
    expect(lines.join("\n")).toContain("error codes binding_not_found:1, send_failed:1");
    expect(lines.join("\n")).toContain("qq, 目标解析失败 · binding_not_found / 没有可用 binding");
    expect(lines.join("\n")).toContain("discord, 渠道投递失败 · send_failed / 渠道发送失败 · discord send failed");
    expect(lines.join("\n")).toContain("详细逐条记录仍可在 记忆查看 -> 外发审计 中查看。");
  });
});
