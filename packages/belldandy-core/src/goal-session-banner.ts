import { parseGoalSessionKey } from "./goals/session.js";
import type { GoalHandoffReadResult, GoalTaskGraph, GoalTaskNode, LongTermGoal } from "./goals/types.js";

function truncateText(value: string | undefined, maxLength = 120): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";
  return normalized.length > maxLength ? `${normalized.slice(0, Math.max(0, maxLength - 3))}...` : normalized;
}

function findFocusNode(input: {
  graph: GoalTaskGraph;
  parsedSession: NonNullable<ReturnType<typeof parseGoalSessionKey>>;
  handoff: GoalHandoffReadResult["handoff"];
}): GoalTaskNode | undefined {
  const preferredNodeId = input.parsedSession.kind === "goal_node"
    ? input.parsedSession.nodeId
    : input.handoff.activeNodeId || input.handoff.recommendedNodeId || input.handoff.lastNodeId;
  if (!preferredNodeId) return undefined;
  return input.graph.nodes.find((node) => node.id === preferredNodeId);
}

export async function buildGoalSessionStartBanner(input: {
  sessionKey?: string;
  getGoal: (goalId: string) => Promise<LongTermGoal | null>;
  getHandoff: (goalId: string) => Promise<GoalHandoffReadResult>;
  readTaskGraph: (goalId: string) => Promise<GoalTaskGraph>;
}): Promise<string | undefined> {
  const parsedSession = parseGoalSessionKey(input.sessionKey);
  if (!parsedSession) {
    return undefined;
  }

  const goal = await input.getGoal(parsedSession.goalId);
  if (!goal) {
    return undefined;
  }

  const [handoff, graph] = await Promise.all([
    input.getHandoff(parsedSession.goalId),
    input.readTaskGraph(parsedSession.goalId),
  ]);
  const focusNode = findFocusNode({
    graph,
    parsedSession,
    handoff: handoff.handoff,
  });

  const lines = [
    `【系统提示｜当前长期任务上下文】`,
    `Goal: ${goal.title} (${goal.id}) / status=${goal.status}${goal.currentPhase ? ` / phase=${goal.currentPhase}` : ""}`,
    goal.objective ? `Objective: ${truncateText(goal.objective, 140)}` : "",
    focusNode
      ? `${parsedSession.kind === "goal_node" ? "Node" : "Focus"}: ${focusNode.title} (${focusNode.id}) / status=${focusNode.status}${focusNode.phase ? ` / phase=${focusNode.phase}` : ""}${parsedSession.kind === "goal_node" && parsedSession.runId ? ` / run=${parsedSession.runId}` : ""}`
      : parsedSession.kind === "goal_node"
        ? `Node: ${parsedSession.nodeId}${parsedSession.runId ? ` / run=${parsedSession.runId}` : ""}`
        : "",
    handoff.handoff.nextAction ? `Next: ${truncateText(handoff.handoff.nextAction, 140)}` : "",
  ].filter(Boolean);

  return lines.length > 1 ? lines.join("\n") : undefined;
}
