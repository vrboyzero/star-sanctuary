import { describe, expect, it } from "vitest";

import { buildResidentPanelSummary } from "./resident-observability-summary.js";

function getContinuationAction(continuationState) {
  const summary = buildResidentPanelSummary({
    id: "agent_test",
    continuationState,
  });
  return summary.rows[0]?.action;
}

describe("resident observability continuation actions", () => {
  it("routes conversation continuation to an explicit conversation action", () => {
    expect(getContinuationAction({
      scope: "conversation",
      targetId: "conv_main",
      recommendedTargetId: "conv_main",
      targetType: "conversation",
      resumeMode: "conversation_thread",
      summary: "continue the thread",
      nextAction: "open the conversation",
    })).toEqual({
      kind: "conversation",
      conversationId: "conv_main",
    });
  });

  it("routes session continuation to an explicit session action", () => {
    expect(getContinuationAction({
      scope: "subtask",
      targetId: "task_sub_1",
      recommendedTargetId: "sub_session_2",
      targetType: "session",
      resumeMode: "same_task_relaunch",
      summary: "follow the subtask session",
      nextAction: "open the subtask session",
    })).toEqual({
      kind: "session",
      sessionId: "sub_session_2",
      taskId: "task_sub_1",
    });
  });

  it("routes goal continuation to an explicit goal action", () => {
    expect(getContinuationAction({
      scope: "goal",
      targetId: "goal_alpha",
      recommendedTargetId: "goal_alpha",
      targetType: "goal",
      resumeMode: "goal_channel",
      summary: "resume the long task",
      nextAction: "open the goal detail",
    })).toEqual({
      kind: "goal",
      goalId: "goal_alpha",
    });
  });

  it("routes node continuation to an explicit node action with goal context", () => {
    expect(getContinuationAction({
      scope: "goal",
      targetId: "goal_alpha",
      recommendedTargetId: "node_impl",
      targetType: "node",
      resumeMode: "goal_channel",
      summary: "resume the implementation node",
      nextAction: "open the owning goal detail first",
    })).toEqual({
      kind: "node",
      goalId: "goal_alpha",
      nodeId: "node_impl",
    });
  });
});
