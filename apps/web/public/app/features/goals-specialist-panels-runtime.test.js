import { describe, expect, it } from "vitest";

import {
  buildGoalBridgeGovernanceSummary,
  collectGoalTrackingRuntimeTaskIds,
  mergeGoalTrackingRuntimeIndex,
} from "./goals-specialist-panels-runtime.js";

describe("goal tracking runtime helpers", () => {
  it("collects unique runtime task ids from recent nodes and the focused node", () => {
    const nodes = [
      { id: "node_1", lastRunId: "run_1" },
      { id: "node_2", lastRunId: "run_2" },
      { id: "node_3", lastRunId: "run_3" },
      { id: "node_4", lastRunId: "run_4" },
      { id: "node_5", lastRunId: "run_5" },
      { id: "node_6", lastRunId: "run_6" },
      { id: "node_7", lastRunId: "run_7" },
      { id: "node_8", lastRunId: "run_2" },
    ];

    expect(collectGoalTrackingRuntimeTaskIds(nodes, " node_7 ")).toEqual([
      "run_1",
      "run_2",
      "run_3",
      "run_4",
      "run_5",
      "run_6",
      "run_7",
    ]);
  });

  it("merges bridge runtime views back into matching nodes", () => {
    const merged = mergeGoalTrackingRuntimeIndex([
      { id: "node_impl", lastRunId: "run_bridge" },
      { id: "node_docs", lastRunId: "run_docs" },
    ], {
      run_bridge: {
        bridgeSubtaskView: { kind: "ide", label: "Bridge ide", summaryLine: "Bridge ide via vscode.open" },
        bridgeSessionView: {
          runtimeState: "orphaned",
          closeReason: "orphan",
          blockReason: "Bridge session lost its governed subtask binding and was cleaned up as an orphan session.",
          artifactPath: "artifacts/bridge.md",
        },
      },
    });

    expect(merged[0]).toMatchObject({
      id: "node_impl",
      lastRunId: "run_bridge",
      bridgeSubtaskView: {
        kind: "ide",
        label: "Bridge ide",
      },
      bridgeSessionView: {
        runtimeState: "orphaned",
        closeReason: "orphan",
        artifactPath: "artifacts/bridge.md",
      },
    });
    expect(merged[1]).toEqual({
      id: "node_docs",
      lastRunId: "run_docs",
    });
  });

  it("builds an aggregated bridge governance summary ordered by recovery severity", () => {
    const summary = buildGoalBridgeGovernanceSummary([
      {
        id: "node_review",
        title: "Review recovery",
        lastRunId: "run_review",
        bridgeSubtaskView: {
          summaryLine: "Bridge review via codex_session.interactive: validate the recovery path.",
        },
        bridgeSessionView: {
          runtimeState: "runtime-lost",
          closeReason: "runtime-lost",
          blockReason: "Bridge session runtime lost during startup recovery and must be resumed or relaunched before work can continue.",
          artifactPath: "artifacts/review.md",
        },
      },
      {
        id: "node_patch",
        title: "Patch orphan cleanup",
        lastRunId: "run_patch",
        bridgeSubtaskView: {
          summaryLine: "Bridge ide via vscode.open: patch the orphan cleanup flow.",
        },
        bridgeSessionView: {
          runtimeState: "orphaned",
          closeReason: "orphan",
          blockReason: "Bridge session lost its governed subtask binding and was cleaned up as an orphan session.",
          transcriptPath: "logs/orphan.jsonl",
        },
      },
      {
        id: "node_docs",
        title: "Update docs",
        lastRunId: "run_docs",
        bridgeSubtaskView: {
          summaryLine: "Bridge doc via files.open: update the rollout note.",
        },
        bridgeSessionView: {
          runtimeState: "active",
        },
      },
    ]);

    expect(summary).toMatchObject({
      bridgeNodeCount: 3,
      activeCount: 1,
      runtimeLostCount: 1,
      orphanedCount: 1,
      blockedCount: 2,
      artifactCount: 1,
      transcriptCount: 1,
    });
    expect(summary?.items.map((item) => item.nodeId)).toEqual([
      "node_review",
      "node_patch",
      "node_docs",
    ]);
    expect(summary?.items[0]).toMatchObject({
      taskId: "run_review",
      runtimeState: "runtime-lost",
      closeReason: "runtime-lost",
    });
    expect(summary?.items[1]).toMatchObject({
      taskId: "run_patch",
      runtimeState: "orphaned",
      closeReason: "orphan",
    });
  });
});
