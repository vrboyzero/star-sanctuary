import { describe, expect, it } from "vitest";

import { buildGoalSessionContextPrelude } from "./goal-session-context.js";

describe("buildGoalSessionContextPrelude", () => {
  it("builds goal-level context for goal sessions", async () => {
    const result = await buildGoalSessionContextPrelude({
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
        goal: {
          id: "goal_alpha",
        } as any,
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

    expect(result?.prependContext).toContain("<goal-session-context");
    expect(result?.prependContext).toContain("收口 H2 学习闭环");
    expect(result?.prependContext).toContain("当前焦点节点：补 doctor 可视化");
    expect(result?.prependContext).toContain("下一步建议：先补 doctor 可视化");
    expect(result?.prependContext).toContain("主动自查默认顺序：先用 `goal_get`");
    expect(result?.deltas?.[0]?.metadata).toMatchObject({
      goalId: "goal_alpha",
      sessionKind: "goal",
      nodeId: "node_runtime",
      nodeStatus: "in_progress",
    });
  });

  it("builds node-level context for goal node sessions", async () => {
    const result = await buildGoalSessionContextPrelude({
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
        goal: {
          id: "goal_beta",
        } as any,
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
          openCheckpoints: [
            {
              id: "cp_1",
              nodeId: "node_ship",
              title: "确认 doctor UI",
              status: "required",
              updatedAt: new Date().toISOString(),
            },
          ],
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

    expect(result?.prependContext).toContain("当前节点：落地外发与 doctor 联动 (node_ship) / status=in_progress / phase=verification / run=run_123");
    expect(result?.prependContext).toContain("再用 `task_graph_read`");
    expect(result?.prependContext).toContain("收口注意：checkpoint 1 / blocker 0");
    expect(result?.deltas?.[0]?.metadata).toMatchObject({
      goalId: "goal_beta",
      sessionKind: "goal_node",
      nodeId: "node_ship",
      runId: "run_123",
      checkpointCount: 1,
    });
  });
});
