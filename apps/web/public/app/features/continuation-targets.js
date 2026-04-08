export function normalizeContinuationTargetType(continuation) {
  return typeof continuation?.targetType === "string"
    ? continuation.targetType.trim()
    : "";
}

export function formatContinuationTargetLabel(continuation) {
  const recommendedTargetId = typeof continuation?.recommendedTargetId === "string"
    ? continuation.recommendedTargetId.trim()
    : "";
  if (!recommendedTargetId) return "-";
  const targetType = normalizeContinuationTargetType(continuation);
  return `${targetType || "target"}:${recommendedTargetId}`;
}

export function buildContinuationAction(continuation) {
  const recommendedTargetId = typeof continuation?.recommendedTargetId === "string"
    ? continuation.recommendedTargetId.trim()
    : "";
  const targetId = typeof continuation?.targetId === "string"
    ? continuation.targetId.trim()
    : "";
  const scope = typeof continuation?.scope === "string"
    ? continuation.scope.trim()
    : "";
  if (!recommendedTargetId) {
    return { kind: "conversation" };
  }
  switch (normalizeContinuationTargetType(continuation)) {
    case "conversation":
      return { kind: "conversation", conversationId: recommendedTargetId };
    case "session":
      return {
        kind: "session",
        sessionId: recommendedTargetId,
        taskId: scope === "subtask" ? targetId : "",
      };
    case "goal":
      return {
        kind: "goal",
        goalId: scope === "goal" ? targetId || recommendedTargetId : recommendedTargetId,
      };
    case "node":
      return scope === "goal" && targetId
        ? { kind: "node", goalId: targetId, nodeId: recommendedTargetId }
        : { kind: "goal", goalId: targetId || "" };
    default:
      return { kind: "conversation", conversationId: recommendedTargetId };
  }
}

export function encodeContinuationAction(action) {
  if (!action || typeof action !== "object") return "";
  try {
    return JSON.stringify(action);
  } catch {
    return "";
  }
}

export function decodeContinuationAction(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}
