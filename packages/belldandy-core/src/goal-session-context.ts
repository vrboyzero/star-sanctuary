import type { AgentPromptDelta, BeforeAgentStartResult } from "@belldandy/agent";

import { parseGoalSessionKey } from "./goals/session.js";
import type { GoalHandoffReadResult, GoalTaskGraph, GoalTaskNode, LongTermGoal } from "./goals/types.js";

function truncateText(value: string | undefined, maxLength = 120): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";
  return normalized.length > maxLength ? `${normalized.slice(0, Math.max(0, maxLength - 3))}...` : normalized;
}

function createGoalSessionContextDelta(input: {
  text: string;
  metadata: Record<string, unknown>;
}): AgentPromptDelta {
  return {
    id: "goal-session-context",
    deltaType: "user-prelude",
    role: "user-prelude",
    source: "goal-session-context",
    text: input.text,
    metadata: {
      blockTag: "goal-session-context",
      ...input.metadata,
    },
  };
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

export async function buildGoalSessionContextPrelude(input: {
  sessionKey?: string;
  getGoal: (goalId: string) => Promise<LongTermGoal | null>;
  getHandoff: (goalId: string) => Promise<GoalHandoffReadResult>;
  readTaskGraph: (goalId: string) => Promise<GoalTaskGraph>;
}): Promise<BeforeAgentStartResult | undefined> {
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
    `当前处于长期任务通道：${parsedSession.kind === "goal_node" ? "goal_node" : "goal"} / goal=${goal.title} (${goal.id}) / status=${goal.status}${goal.currentPhase ? ` / phase=${goal.currentPhase}` : ""}`,
    goal.objective ? `目标摘要：${truncateText(goal.objective, 140)}` : "",
    focusNode
      ? `${parsedSession.kind === "goal_node" ? "当前节点" : "当前焦点节点"}：${focusNode.title} (${focusNode.id}) / status=${focusNode.status}${focusNode.phase ? ` / phase=${focusNode.phase}` : ""}${parsedSession.kind === "goal_node" && parsedSession.runId ? ` / run=${parsedSession.runId}` : ""}`
      : parsedSession.kind === "goal_node"
        ? `当前节点：${parsedSession.nodeId} / run=${parsedSession.runId}`
        : "",
    handoff.handoff.nextAction ? `下一步建议：${truncateText(handoff.handoff.nextAction, 140)}` : "",
    "主动自查默认顺序：先用 `goal_get` 核对 goal 级 runtime（status / active node / last run）；若要看节点状态、依赖与 checkpoint 分布，再用 `task_graph_read`。",
    handoff.handoff.openCheckpoints.length > 0 || handoff.handoff.blockers.length > 0
      ? `收口注意：checkpoint ${handoff.handoff.openCheckpoints.length} / blocker ${handoff.handoff.blockers.length}`
      : "",
  ].filter(Boolean);

  if (lines.length <= 0) {
    return undefined;
  }

  const block = `<goal-session-context hint="你当前正处于长期任务通道。回答、规划、工具选择与收口都要显式围绕这个 goal / node 上下文，不要把它当成普通闲聊主会话。">\n${lines.map((line) => `- ${line}`).join("\n")}\n</goal-session-context>`;
  return {
    prependContext: block,
    deltas: [
      createGoalSessionContextDelta({
        text: block,
        metadata: {
          goalId: goal.id,
          goalStatus: goal.status,
          sessionKind: parsedSession.kind,
          ...(goal.currentPhase ? { goalPhase: goal.currentPhase } : {}),
          ...(focusNode
            ? {
              nodeId: focusNode.id,
              nodeStatus: focusNode.status,
              ...(focusNode.phase ? { nodePhase: focusNode.phase } : {}),
            }
            : {}),
          ...(parsedSession.kind === "goal_node" ? { runId: parsedSession.runId } : {}),
          lineCount: lines.length,
          checkpointCount: handoff.handoff.openCheckpoints.length,
          blockerCount: handoff.handoff.blockers.length,
        },
      }),
    ],
  };
}
