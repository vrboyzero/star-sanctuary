// @vitest-environment jsdom

import { describe, expect, it, vi } from "vitest";

import {
  buildGoalBridgeGovernanceSummary,
  collectGoalTrackingRuntimeTaskIds,
  createGoalsSpecialistPanelsRuntimeFeature,
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

  it("routes governance suggestion actions to experience workbench with fallback filters", async () => {
    document.body.innerHTML = `
      <div id="goalsDetail">
        <div id="goalGovernancePanel">
          <button
            data-goal-open-experience="true"
            data-goal-open-experience-candidate-id=""
            data-goal-open-experience-type="skill"
            data-goal-open-experience-query="Skill candidate from goal"
          ></button>
          <button
            data-goal-open-experience="true"
            data-goal-open-experience-candidate-id="goal_exp_method_1"
            data-goal-open-experience-type="method"
            data-goal-open-experience-query="Method candidate from goal"
          ></button>
        </div>
      </div>
    `;

    const openExperienceWorkbench = vi.fn(async () => {});
    const feature = createGoalsSpecialistPanelsRuntimeFeature({
      refs: {
        goalsDetailEl: document.getElementById("goalsDetail"),
      },
      getGoalsState: () => ({
        capabilityCache: {},
        capabilityPending: {},
      }),
      getGoalsCapabilityPanelFeature: () => null,
      getGoalsReadonlyPanelsFeature: () => null,
      getGoalsTrackingPanelFeature: () => null,
      getGoalsGovernancePanelFeature: () => null,
      readSourceFile: vi.fn(async () => null),
      goalRuntimeFilePath: vi.fn(() => ""),
      safeJsonParse: vi.fn(() => null),
      sendReq: vi.fn(async () => ({ ok: true })),
      makeId: () => "req-1",
      getCanvasContextFeature: () => null,
      openSourcePath: vi.fn(async () => {}),
      openContinuationAction: vi.fn(async () => {}),
      generateGoalHandoff: vi.fn(async () => {}),
      runGoalApprovalScan: vi.fn(async () => {}),
      runGoalSuggestionReviewDecision: vi.fn(async () => {}),
      runGoalSuggestionReviewEscalation: vi.fn(async () => {}),
      runGoalCheckpointEscalation: vi.fn(async () => {}),
      openExperienceWorkbench,
      applyGoalContinuationFocus: vi.fn(),
    });

    feature.bindGoalReviewGovernanceActions({ id: "goal_alpha" });

    const [skillNode, methodNode] = Array.from(document.querySelectorAll("[data-goal-open-experience]"));
    skillNode.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    methodNode.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    await Promise.resolve();

    expect(openExperienceWorkbench).toHaveBeenNthCalledWith(1, {
      candidateId: "",
      filters: {
        type: "skill",
        query: "Skill candidate from goal",
      },
      preferFirst: true,
    });
    expect(openExperienceWorkbench).toHaveBeenNthCalledWith(2, {
      candidateId: "goal_exp_method_1",
      filters: {
        type: "method",
        query: "Method candidate from goal",
      },
      preferFirst: true,
    });
  });
});
