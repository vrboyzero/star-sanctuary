import { describe, expect, it } from "vitest";

import { createGoalsGovernancePanelFeature } from "./goals-governance-panel.js";

describe("goals governance panel", () => {
  it("renders bridge governance summary in the governance panel", () => {
    const panel = { innerHTML: "" };
    const feature = createGoalsGovernancePanelFeature({
      refs: {
        goalsDetailEl: {
          querySelector(selector) {
            return selector === "#goalGovernancePanel" ? panel : null;
          },
        },
      },
      escapeHtml: (value) => String(value ?? ""),
      formatDateTime: (value) => String(value ?? "-"),
      goalRuntimeFilePath: (_goal, fileName) => `runtime/${fileName}`,
    });

    feature.renderGoalReviewGovernancePanel({
      id: "goal_bridge",
    }, {
      workflowPendingCount: 1,
      workflowOverdueCount: 0,
      checkpointWorkflowPendingCount: 0,
      checkpointWorkflowOverdueCount: 0,
      reviewers: [],
      templates: [],
      notifications: [],
      notificationDispatches: [],
      notificationDispatchCounts: { total: 0, byChannel: {}, byStatus: {} },
      actionableReviews: [],
      actionableCheckpoints: [],
      bridgeGovernanceSummary: {
        bridgeNodeCount: 2,
        activeCount: 0,
        runtimeLostCount: 1,
        orphanedCount: 1,
        blockedCount: 2,
        artifactCount: 1,
        transcriptCount: 1,
        items: [
          {
            nodeId: "node_review",
            title: "Review recovery",
            taskId: "run_review",
            runtimeState: "runtime-lost",
            closeReason: "runtime-lost",
            blockReason: "Bridge session runtime lost during startup recovery and must be resumed or relaunched before work can continue.",
            summaryLines: ["Bridge review via codex_session.interactive: validate the recovery path."],
            artifactPath: "artifacts/review.md",
            transcriptPath: "logs/review.jsonl",
          },
        ],
      },
    });

    expect(panel.innerHTML).toContain("Bridge 治理摘要");
    expect(panel.innerHTML).toContain("运行态丢失");
    expect(panel.innerHTML).toContain("data-open-task-id=\"run_review\"");
    expect(panel.innerHTML).toContain("data-open-source=\"artifacts/review.md\"");
    expect(panel.innerHTML).toContain("data-open-source=\"logs/review.jsonl\"");
  });

  it("renders experience workbench jump for method and skill suggestion reviews", () => {
    const panel = { innerHTML: "" };
    const feature = createGoalsGovernancePanelFeature({
      refs: {
        goalsDetailEl: {
          querySelector(selector) {
            return selector === "#goalGovernancePanel" ? panel : null;
          },
        },
      },
      escapeHtml: (value) => String(value ?? ""),
      formatDateTime: (value) => String(value ?? "-"),
      goalRuntimeFilePath: (_goal, fileName) => `runtime/${fileName}`,
      t: (_key, _params, fallback) => fallback ?? "",
    });

    feature.renderGoalReviewGovernancePanel({
      id: "goal_experience",
    }, {
      workflowPendingCount: 2,
      workflowOverdueCount: 0,
      checkpointWorkflowPendingCount: 0,
      checkpointWorkflowOverdueCount: 0,
      reviewers: [],
      templates: [],
      notifications: [],
      notificationDispatches: [],
      notificationDispatchCounts: { total: 0, byChannel: {}, byStatus: {} },
      actionableCheckpoints: [],
      bridgeGovernanceSummary: null,
      actionableReviews: [
        {
          id: "review-method-1",
          title: "Method candidate from goal",
          suggestionType: "method_candidate",
          suggestionId: "method_candidate_node_root",
          experienceType: "method",
          experienceCandidateId: "goal_exp_method_1",
          status: "pending_review",
        },
        {
          id: "review-skill-1",
          title: "Skill candidate from goal",
          suggestionType: "skill_candidate",
          suggestionId: "skill_candidate_node_root",
          experienceType: "skill",
          experienceCandidateId: "",
          status: "needs_revision",
        },
      ],
    });

    expect(panel.innerHTML).toContain("data-goal-open-experience=\"true\"");
    expect(panel.innerHTML).toContain("data-goal-open-experience-candidate-id=\"goal_exp_method_1\"");
    expect(panel.innerHTML).toContain("data-goal-open-experience-type=\"method\"");
    expect(panel.innerHTML).toContain("data-goal-open-experience-type=\"skill\"");
    expect(panel.innerHTML).toContain("在经验能力中打开");
  });
});
