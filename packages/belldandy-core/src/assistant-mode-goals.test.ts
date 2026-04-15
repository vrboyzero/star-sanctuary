import { expect, test } from "vitest";

import { buildAssistantModeGoalRuntimeSummary } from "./assistant-mode-goals.js";

test("assistant mode goal runtime summary prefers blocked goal and reuses handoff context", async () => {
  const report = await buildAssistantModeGoalRuntimeSummary({
    goalReader: {
      async listGoals() {
        return [
          {
            id: "goal_shipping",
            slug: "shipping",
            title: "Shipping",
            status: "executing",
            goalRoot: "E:/goals/shipping",
            runtimeRoot: "E:/goals/shipping/runtime",
            docRoot: "E:/goals/shipping/docs",
            northstarPath: "E:/goals/shipping/NORTHSTAR.md",
            tasksPath: "E:/goals/shipping/tasks.json",
            progressPath: "E:/goals/shipping/progress.md",
            handoffPath: "E:/goals/shipping/handoff.md",
            registryPath: "E:/goals/registry.json",
            pathSource: "default",
            activeConversationId: "goal:shipping",
            createdAt: "2026-04-15T00:00:00.000Z",
            updatedAt: "2026-04-15T02:00:00.000Z",
          },
          {
            id: "goal_review",
            slug: "review",
            title: "Review Flow",
            status: "blocked",
            goalRoot: "E:/goals/review",
            runtimeRoot: "E:/goals/review/runtime",
            docRoot: "E:/goals/review/docs",
            northstarPath: "E:/goals/review/NORTHSTAR.md",
            tasksPath: "E:/goals/review/tasks.json",
            progressPath: "E:/goals/review/progress.md",
            handoffPath: "E:/goals/review/handoff.md",
            registryPath: "E:/goals/registry.json",
            pathSource: "default",
            activeConversationId: "goal:review",
            createdAt: "2026-04-15T00:00:00.000Z",
            updatedAt: "2026-04-15T03:00:00.000Z",
          },
        ];
      },
      async getHandoff(goalId: string) {
        expect(goalId).toBe("goal_review");
        return {
          goal: {
            id: "goal_review",
          },
          handoff: {
            activeConversationId: "goal:review",
            summary: "当前 goal 处于阻塞态，优先解除关键节点阻塞。",
            nextAction: "先解除 review 节点的阻塞，再继续推进。",
            blockers: [
              {
                kind: "node",
                id: "node_review",
                title: "Review Node",
                status: "blocked",
                reason: "等待用户确认策略",
              },
            ],
            openCheckpoints: [
              {
                id: "cp-1",
                status: "waiting_user",
                title: "Review checkpoint",
                summary: "等待用户确认当前评审策略",
                updatedAt: "2026-04-15T03:00:00.000Z",
              },
            ],
          },
        } as any;
      },
    } as any,
  });

  expect(report).toMatchObject({
    totalCount: 2,
    activeCount: 2,
    blockedCount: 1,
    pendingApprovalCount: 0,
    reviewingCount: 0,
    headline: "goals=2; active=2; blocked=1; pendingApproval=0; reviewing=0",
    primary: {
      goalId: "goal_review",
      title: "Review Flow",
      status: "blocked",
      activeConversationId: "goal:review",
      summary: "当前 goal 处于阻塞态，优先解除关键节点阻塞。",
      nextAction: "先解除 review 节点的阻塞，再继续推进。",
      blockerSummary: "等待用户确认策略",
      checkpointSummary: "等待用户确认当前评审策略",
      targetId: "goal:review",
      targetType: "conversation",
    },
  });
});
