import crypto from "node:crypto";

export function createGoalConversationId(goalId: string): string {
  return `goal:${goalId}`;
}

export function createGoalNodeConversationId(goalId: string, nodeId: string, runId = createGoalRunId()): string {
  return `goal:${goalId}:node:${nodeId}:run:${runId}`;
}

export function createGoalRunId(): string {
  return `run_${crypto.randomUUID().slice(0, 8)}`;
}

export type ParsedGoalSession =
  | { kind: "goal"; goalId: string; goalSession: true }
  | { kind: "goal_node"; goalId: string; nodeId: string; runId: string; goalSession: true }
  | null;

export function parseGoalSessionKey(sessionKey?: string): ParsedGoalSession {
  if (!sessionKey) return null;
  const goalNodeMatch = /^goal:([^:]+):node:([^:]+):run:([^:]+)$/.exec(sessionKey);
  if (goalNodeMatch) {
    return {
      kind: "goal_node",
      goalId: goalNodeMatch[1],
      nodeId: goalNodeMatch[2],
      runId: goalNodeMatch[3],
      goalSession: true,
    };
  }
  const goalMatch = /^goal:([^:]+)$/.exec(sessionKey);
  if (goalMatch) {
    return {
      kind: "goal",
      goalId: goalMatch[1],
      goalSession: true,
    };
  }
  return null;
}

