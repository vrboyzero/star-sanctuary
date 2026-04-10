import { describe, expect, it } from "vitest";

import {
  buildContinuationAction,
  decodeContinuationAction,
  encodeContinuationAction,
  formatContinuationTargetLabel,
} from "./continuation-targets.js";

describe("continuation target helpers", () => {
  it("formats continuation target labels with explicit type", () => {
    expect(formatContinuationTargetLabel({
      recommendedTargetId: "node_impl",
      targetType: "node",
    })).toBe("node:node_impl");
  });

  it("builds session continuation actions with subtask context", () => {
    expect(buildContinuationAction({
      scope: "subtask",
      targetId: "task_sub_1",
      recommendedTargetId: "sub_session_2",
      targetType: "session",
    })).toEqual({
      kind: "session",
      sessionId: "sub_session_2",
      taskId: "task_sub_1",
    });
  });

  it("builds node continuation actions with owning goal context", () => {
    expect(buildContinuationAction({
      scope: "goal",
      targetId: "goal_alpha",
      recommendedTargetId: "node_impl",
      targetType: "node",
    })).toEqual({
      kind: "node",
      goalId: "goal_alpha",
      nodeId: "node_impl",
    });
  });

  it("builds goal replay continuation actions for checkpoint recovery", () => {
    expect(buildContinuationAction({
      scope: "goal",
      targetId: "goal_alpha",
      recommendedTargetId: "node_impl",
      targetType: "node",
      resumeMode: "checkpoint",
      replay: {
        kind: "goal_checkpoint",
        checkpointId: "checkpoint_1",
        nodeId: "node_impl",
      },
    })).toEqual({
      kind: "goalReplay",
      goalId: "goal_alpha",
      nodeId: "node_impl",
      checkpointId: "checkpoint_1",
    });
  });

  it("round-trips continuation actions through encoded html payloads", () => {
    const encoded = encodeContinuationAction({
      kind: "conversation",
      conversationId: "agent:default:main",
    });
    expect(decodeContinuationAction(encoded)).toEqual({
      kind: "conversation",
      conversationId: "agent:default:main",
    });
  });
});
