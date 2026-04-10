import { createGoalConversationId, createGoalNodeConversationId, parseGoalSessionKey } from "./goals/session.js";
import type { GoalTaskGraph, GoalTaskNode, GoalUpdateEvent } from "./goals/types.js";

const GOAL_EVENT_LABELS: Partial<Record<GoalUpdateEvent["reason"], string>> = {
  goal_resumed: "Goal 已恢复执行",
  goal_paused: "Goal 已暂停",
  task_node_claimed: "当前节点已进入执行",
  task_node_pending_review: "当前节点进入待审阅",
  task_node_validating: "当前节点进入验证",
  task_node_completed: "当前节点已完成",
  task_node_blocked: "当前节点已阻塞",
  task_node_failed: "当前节点执行失败",
  task_node_skipped: "当前节点已跳过",
};

function shouldEmitRuntimeEvent(reason: GoalUpdateEvent["reason"]): boolean {
  return Boolean(GOAL_EVENT_LABELS[reason]);
}

function isCompletionLikeNodeEvent(reason: GoalUpdateEvent["reason"]): boolean {
  return reason === "task_node_completed" || reason === "task_node_skipped";
}

function resolveConversationId(event: GoalUpdateEvent): string | undefined {
  const activeConversationId = typeof event.goal.activeConversationId === "string"
    ? event.goal.activeConversationId.trim()
    : "";
  if (activeConversationId) {
    if (isCompletionLikeNodeEvent(event.reason)) {
      const parsedActiveSession = parseGoalSessionKey(activeConversationId);
      const activeNodeMatches = parsedActiveSession?.kind === "goal_node"
        && parsedActiveSession.nodeId === event.nodeId
        && parsedActiveSession.runId === event.runId;
      if (!activeNodeMatches) {
        return undefined;
      }
    }
    return activeConversationId;
  }
  if (event.nodeId && event.runId) {
    return createGoalNodeConversationId(event.goal.id, event.nodeId, event.runId);
  }
  return createGoalConversationId(event.goal.id);
}

function findNode(graph: GoalTaskGraph, nodeId?: string): GoalTaskNode | undefined {
  if (!nodeId) return undefined;
  return graph.nodes.find((node) => node.id === nodeId);
}

function buildNodeLine(node: GoalTaskNode | undefined, event: GoalUpdateEvent): string {
  if (node) {
    return `Node: ${node.title} (${node.id}) / status=${node.status}${node.phase ? ` / phase=${node.phase}` : ""}${event.runId ? ` / run=${event.runId}` : ""}`;
  }
  if (event.nodeId) {
    return `Node: ${event.nodeId}${event.runId ? ` / run=${event.runId}` : ""}`;
  }
  return "";
}

export async function buildGoalSessionRuntimeEventMessage(input: {
  event: GoalUpdateEvent;
  readTaskGraph: (goalId: string) => Promise<GoalTaskGraph>;
}): Promise<{ conversationId: string; text: string } | undefined> {
  if (!shouldEmitRuntimeEvent(input.event.reason)) {
    return undefined;
  }

  const conversationId = resolveConversationId(input.event);
  if (!conversationId) {
    return undefined;
  }
  const lines = [
    "【系统事件｜长期任务状态变更】",
    `${GOAL_EVENT_LABELS[input.event.reason]}`,
    `Goal: ${input.event.goal.title} (${input.event.goal.id}) / status=${input.event.goal.status}${input.event.goal.currentPhase ? ` / phase=${input.event.goal.currentPhase}` : ""}`,
  ];

  if (input.event.nodeId) {
    const graph = await input.readTaskGraph(input.event.goal.id).catch(() => undefined);
    const nodeLine = buildNodeLine(graph ? findNode(graph, input.event.nodeId) : undefined, input.event);
    if (nodeLine) {
      lines.push(nodeLine);
    }
  }

  return {
    conversationId,
    text: lines.join("\n"),
  };
}
