import { describe, expect, it } from "vitest";

import {
  buildBridgeGovernanceSummaryLines,
  buildSubtaskExecutionExplainabilityLines,
  findSubtaskBySessionId,
  formatBridgeCloseReason,
  formatBridgeRuntimeState,
  parseGoalSessionReference,
} from "./subtasks-overview.js";

describe("subtasks overview linkage helpers", () => {
  it("parses goal base conversations into goal link info", () => {
    expect(parseGoalSessionReference("goal:goal_alpha")).toEqual({
      kind: "goal",
      goalId: "goal_alpha",
    });
  });

  it("parses goal node conversations into goal and run link info", () => {
    expect(parseGoalSessionReference("goal:goal_alpha:node:node_impl:run:run_123")).toEqual({
      kind: "goal_node",
      goalId: "goal_alpha",
      nodeId: "node_impl",
      runId: "run_123",
    });
  });

  it("returns null for non-goal conversations", () => {
    expect(parseGoalSessionReference("conv-default")).toBeNull();
  });

  it("finds a subtask by session id", () => {
    expect(findSubtaskBySessionId([
      { id: "task_1", sessionId: "sub_1" },
      { id: "task_2", sessionId: "sub_2" },
    ], " sub_2 ")).toEqual({
      id: "task_2",
      sessionId: "sub_2",
    });
  });

  it("builds compact execution explainability lines for subtask detail", () => {
    const lines = buildSubtaskExecutionExplainabilityLines({
      launchExplainability: {
        effectiveLaunch: {
          source: "runtime_launch_spec",
          agentId: "coder",
          profileId: "coder",
          permissionMode: "workspace_write",
        },
        delegationReason: {
          source: "delegate_task",
          intentKind: "ad_hoc",
          intentSummary: "Implement structured task runtime",
          expectedDeliverableSummary: "Return the patch summary",
          aggregationMode: "single",
          contextKeys: ["taskId", "workspace"],
        },
      },
      resultEnvelope: {
        status: "done",
        agentId: "coder",
        finishedAt: 1712000000000,
        outputPath: "artifacts/out.md",
      },
      promptSnapshotView: {
        snapshot: {
          manifest: {
            conversationId: "sub_task_1",
            createdAt: 1712000000000,
          },
          summary: {
            messageCount: 2,
            tokenBreakdown: {
              systemPromptEstimatedTokens: 88,
            },
          },
        },
      },
      sessionId: "sub_task_1",
      summarizeSourcePath: (value) => value,
      formatDateTime: (value) => String(value),
    });

    expect(lines.join("\n")).toContain("effective launch: source=runtime_launch_spec, agent=coder");
    expect(lines.join("\n")).toContain("delegation reason: source=delegate_task");
    expect(lines.join("\n")).toContain("result envelope: status=done, agent=coder, finished=1712000000000, output=artifacts/out.md");
    expect(lines.join("\n")).toContain("prompt snapshot: conversation=sub_task_1, messages=2, tokens=88, captured=1712000000000");
  });

  it("reports missing prompt snapshot when the subtask has a session but no persisted artifact", () => {
    const lines = buildSubtaskExecutionExplainabilityLines({
      sessionId: "sub_task_missing",
    });

    expect(lines).toContain("prompt snapshot: missing for session=sub_task_missing");
  });

  it("formats bridge governance runtime state and close reason for orphaned sessions", () => {
    expect(formatBridgeRuntimeState("orphaned")).toBe("orphaned");
    expect(formatBridgeCloseReason("orphan")).toBe("orphan");
  });

  it("builds bridge governance summary lines with structured block reason", () => {
    const lines = buildBridgeGovernanceSummaryLines({
      bridgeSubtaskView: {
        summaryLine: "Bridge review via codex_session.interactive: Inspect the recovery path.",
      },
      bridgeSessionView: {
        summaryLine: "Bridge session orphaned via codex_session.interactive: Inspect the recovery path.",
        blockReason: "Bridge session lost its governed subtask binding and was cleaned up as an orphan session.",
      },
    });

    expect(lines).toContain("Bridge review via codex_session.interactive: Inspect the recovery path.");
    expect(lines).toContain("Bridge session orphaned via codex_session.interactive: Inspect the recovery path.");
    expect(lines).toContain("Block Reason: Bridge session lost its governed subtask binding and was cleaned up as an orphan session.");
  });
});
