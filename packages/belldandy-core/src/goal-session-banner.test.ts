import { describe, expect, it } from "vitest";

import { buildGoalSessionStartBanner } from "./goal-session-banner.js";

describe("buildGoalSessionStartBanner", () => {
  it("builds a goal banner for goal sessions", async () => {
    const result = await buildGoalSessionStartBanner({
      sessionKey: "goal:goal_alpha",
      getGoal: async () => ({
        id: "goal_alpha",
        slug: "goal-alpha",
        title: "收口 H2 学习闭环",
        status: "executing",
        objective: "让学习/审阅闭环具备稳定的可解释输入与 prompt/runtime 提示。",
        currentPhase: "implementation",
        goalRoot: "goalRoot",
        runtimeRoot: "runtimeRoot",
        docRoot: "docRoot",
        northstarPath: "northstar",
        tasksPath: "tasks",
        progressPath: "progress",
        handoffPath: "handoff",
        registryPath: "registry",
        pathSource: "default",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      getHandoff: async () => ({
        goal: { id: "goal_alpha" } as any,
        handoff: {
          version: 1,
          goalId: "goal_alpha",
          generatedAt: new Date().toISOString(),
          goalStatus: "executing",
          currentPhase: "implementation",
          activeNodeId: "node_runtime",
          resumeMode: "current_node",
          recommendedNodeId: "node_runtime",
          summary: "summary",
          nextAction: "先补 doctor 可视化，再收 goal 通道上下文。",
          tracking: {
            totalNodes: 3,
            completedNodes: 1,
            inProgressNodes: 1,
            blockedNodes: 0,
            pendingReviewNodes: 0,
            validatingNodes: 0,
            failedNodes: 0,
            skippedNodes: 0,
            openCheckpointCount: 0,
          },
          openCheckpoints: [],
          blockers: [],
          recentProgress: [],
        },
        continuationState: {} as any,
        content: "",
      }),
      readTaskGraph: async () => ({
        version: 2,
        goalId: "goal_alpha",
        nodes: [
          {
            id: "node_runtime",
            title: "补 doctor 可视化",
            status: "in_progress",
            phase: "ui",
            dependsOn: [],
            acceptance: [],
            artifacts: [],
            checkpointRequired: false,
            checkpointStatus: "not_required",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        edges: [],
        updatedAt: new Date().toISOString(),
      }),
    });

    expect(result).toContain("【系统提示｜当前长期任务上下文】");
    expect(result).toContain("Goal: 收口 H2 学习闭环 (goal_alpha)");
    expect(result).toContain("Focus: 补 doctor 可视化 (node_runtime) / status=in_progress / phase=ui");
    expect(result).toContain("Next: 先补 doctor 可视化");
  });

  it("builds a node banner for goal node sessions", async () => {
    const result = await buildGoalSessionStartBanner({
      sessionKey: "goal:goal_beta:node:node_ship:run:run_123",
      getGoal: async () => ({
        id: "goal_beta",
        slug: "goal-beta",
        title: "推进 outbound 审计",
        status: "executing",
        objective: "让外发审计与学习闭环能共享同一套诊断语义。",
        goalRoot: "goalRoot",
        runtimeRoot: "runtimeRoot",
        docRoot: "docRoot",
        northstarPath: "northstar",
        tasksPath: "tasks",
        progressPath: "progress",
        handoffPath: "handoff",
        registryPath: "registry",
        pathSource: "default",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      }),
      getHandoff: async () => ({
        goal: { id: "goal_beta" } as any,
        handoff: {
          version: 1,
          goalId: "goal_beta",
          generatedAt: new Date().toISOString(),
          goalStatus: "executing",
          activeNodeId: "node_ship",
          lastRunId: "run_123",
          resumeMode: "current_node",
          recommendedNodeId: "node_ship",
          summary: "summary",
          nextAction: "继续收口这轮 node 的实现和验证。",
          tracking: {
            totalNodes: 2,
            completedNodes: 0,
            inProgressNodes: 1,
            blockedNodes: 0,
            pendingReviewNodes: 0,
            validatingNodes: 0,
            failedNodes: 0,
            skippedNodes: 0,
            openCheckpointCount: 1,
          },
          openCheckpoints: [],
          blockers: [],
          recentProgress: [],
        },
        continuationState: {} as any,
        content: "",
      }),
      readTaskGraph: async () => ({
        version: 2,
        goalId: "goal_beta",
        nodes: [
          {
            id: "node_ship",
            title: "落地外发与 doctor 联动",
            status: "in_progress",
            phase: "verification",
            dependsOn: [],
            acceptance: [],
            artifacts: [],
            checkpointRequired: true,
            checkpointStatus: "required",
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ],
        edges: [],
        updatedAt: new Date().toISOString(),
      }),
    });

    expect(result).toContain("Goal: 推进 outbound 审计 (goal_beta)");
    expect(result).toContain("Node: 落地外发与 doctor 联动 (node_ship) / status=in_progress / phase=verification / run=run_123");
    expect(result).toContain("Next: 继续收口这轮 node 的实现和验证。");
  });
});
