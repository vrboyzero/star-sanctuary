import { describe, expect, it } from "vitest";

import { buildGoalSessionRuntimeEventMessage } from "./goal-session-runtime-event.js";

describe("buildGoalSessionRuntimeEventMessage", () => {
  it("builds a goal-level runtime event for resumed goals", async () => {
    const result = await buildGoalSessionRuntimeEventMessage({
      event: {
        goal: {
          id: "goal_alpha",
          slug: "goal-alpha",
          title: "收口 H2 学习闭环",
          status: "executing",
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
          activeConversationId: "goal:goal_alpha",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        reason: "goal_resumed",
        areas: ["goal", "handoff", "tracking", "progress"],
        at: new Date().toISOString(),
      },
      readTaskGraph: async () => ({
        version: 2,
        goalId: "goal_alpha",
        nodes: [],
        edges: [],
        updatedAt: new Date().toISOString(),
      }),
    });

    expect(result).toMatchObject({
      conversationId: "goal:goal_alpha",
    });
    expect(result?.text).toContain("【系统事件｜长期任务状态变更】");
    expect(result?.text).toContain("Goal 已恢复执行");
    expect(result?.text).toContain("Goal: 收口 H2 学习闭环 (goal_alpha) / status=executing / phase=implementation");
  });

  it("builds a node runtime event for node status transitions", async () => {
    const result = await buildGoalSessionRuntimeEventMessage({
      event: {
        goal: {
          id: "goal_beta",
          slug: "goal-beta",
          title: "推进 outbound 审计",
          status: "blocked",
          goalRoot: "goalRoot",
          runtimeRoot: "runtimeRoot",
          docRoot: "docRoot",
          northstarPath: "northstar",
          tasksPath: "tasks",
          progressPath: "progress",
          handoffPath: "handoff",
          registryPath: "registry",
          pathSource: "default",
          activeConversationId: "goal:goal_beta:node:node_ship:run:run_123",
          activeNodeId: "node_ship",
          lastNodeId: "node_ship",
          lastRunId: "run_123",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        reason: "task_node_blocked",
        areas: ["goal", "tracking", "progress", "handoff"],
        nodeId: "node_ship",
        runId: "run_123",
        at: new Date().toISOString(),
      },
      readTaskGraph: async () => ({
        version: 2,
        goalId: "goal_beta",
        nodes: [
          {
            id: "node_ship",
            title: "落地外发与 doctor 联动",
            status: "blocked",
            phase: "verification",
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

    expect(result).toMatchObject({
      conversationId: "goal:goal_beta:node:node_ship:run:run_123",
    });
    expect(result?.text).toContain("当前节点已阻塞");
    expect(result?.text).toContain("Goal: 推进 outbound 审计 (goal_beta) / status=blocked");
    expect(result?.text).toContain("Node: 落地外发与 doctor 联动 (node_ship) / status=blocked / phase=verification / run=run_123");
  });
});
