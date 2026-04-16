import { describe, expect, it } from "vitest";

import { createGoalsReadonlyPanelsFeature } from "./goals-readonly-panels.js";

describe("goals readonly panels", () => {
  it("renders bridge governance reference summary inside the handoff panel", () => {
    const panel = { innerHTML: "" };
    const feature = createGoalsReadonlyPanelsFeature({
      refs: {
        goalsDetailEl: {
          querySelector(selector) {
            return selector === "#goalHandoffPanel" ? panel : null;
          },
        },
      },
      escapeHtml: (value) => String(value ?? ""),
      formatDateTime: (value) => String(value ?? "-"),
      normalizeGoalBoardId: (value) => String(value ?? ""),
      goalRuntimeFilePath: (_goal, fileName) => `runtime/${fileName}`,
    });

    feature.renderGoalHandoffPanel({
      id: "goal_bridge",
      handoffPath: "runtime/handoff.md",
    }, {
      generatedAt: "2026-04-16T12:00:00.000Z",
      resumeMode: "checkpoint",
      recommendedNodeId: "node_bridge_review",
      lastRunId: "task_bridge",
      summary: "Checkpoint is waiting and the linked bridge runtime must be recovered first.",
      nextAction: "Inspect the bridge artifact / transcript, recover the bridge runtime, then continue the checkpoint flow.",
      tracking: {
        totalNodes: 3,
        completedNodes: 1,
        inProgressNodes: 1,
        blockedNodes: 1,
        openCheckpointCount: 1,
      },
      openCheckpoints: [],
      blockers: [],
      bridgeGovernance: {
        bridgeNodeCount: 1,
        activeCount: 0,
        runtimeLostCount: 1,
        orphanedCount: 0,
        blockedCount: 1,
        artifactCount: 1,
        transcriptCount: 1,
        items: [
          {
            nodeId: "node_bridge_review",
            title: "Review bridge recovery",
            taskId: "task_bridge",
            runtimeState: "runtime-lost",
            closeReason: "runtime-lost",
            blockReason: "Bridge session runtime lost during startup recovery and must be resumed or relaunched before work can continue.",
            summaryLines: ["Bridge session runtime-lost via codex_session.interactive: recover the review runtime."],
            artifactPath: "artifacts/bridge.md",
            transcriptPath: "logs/bridge.jsonl",
          },
        ],
      },
      recentProgress: [],
    }, {
      version: 1,
      scope: "goal",
      targetId: "goal_bridge",
      recommendedTargetId: "node_bridge_review",
      targetType: "node",
      resumeMode: "checkpoint",
      summary: "Checkpoint is waiting and the linked bridge runtime must be recovered first.",
      nextAction: "Inspect the bridge artifact / transcript, recover the bridge runtime, then continue the checkpoint flow.",
      checkpoints: {
        openCount: 1,
        blockerCount: 1,
        labels: ["Bridge session runtime lost during startup recovery and must be resumed or relaunched before work can continue."],
      },
      progress: {
        current: "implementation",
        recent: [],
      },
    });

    expect(panel.innerHTML).toContain("Bridge 引用摘要");
    expect(panel.innerHTML).toContain("运行态丢失 1");
    expect(panel.innerHTML).toContain("Bridge session runtime-lost via codex_session.interactive");
    expect(panel.innerHTML).toContain("artifacts/bridge.md");
    expect(panel.innerHTML).toContain("logs/bridge.jsonl");
  });
});
