import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  GoalCapabilityPlan,
  GoalCheckpointItem,
  GoalCheckpointState,
  GoalHandoffBlocker,
  GoalHandoffCapabilityFocus,
  GoalHandoffCheckpointSummary,
  GoalHandoffGenerateResult,
  GoalHandoffReadResult,
  GoalHandoffResumeMode,
  GoalHandoffSnapshot,
  GoalHandoffTimelineEntry,
  GoalTaskGraph,
  GoalTaskNode,
  GoalTaskNodeStatus,
  GoalRuntimeState,
  LongTermGoal,
} from "./types.js";
import { buildGoalContinuationState } from "../continuation-state.js";
import { parseGoalProgressEntries } from "./progress.js";

export type GoalHandoffInput = {
  goal: LongTermGoal;
  runtime: GoalRuntimeState;
  graph: GoalTaskGraph;
  checkpoints: GoalCheckpointState;
  plans: GoalCapabilityPlan[];
  progressContent: string;
};

function escapeMarkdown(value: string): string {
  return value.replace(/[<>]/g, "").trim();
}

function pickFocusPlan(goal: LongTermGoal, plans: GoalCapabilityPlan[]): GoalCapabilityPlan | null {
  const preferredNodeIds = [goal.activeNodeId, goal.lastNodeId]
    .map((item) => item?.trim())
    .filter((item): item is string => Boolean(item));
  for (const nodeId of preferredNodeIds) {
    const matched = plans.find((plan) => plan.nodeId === nodeId);
    if (matched) return matched;
  }
  return plans
    .slice()
    .sort((left, right) => new Date(right.updatedAt || right.generatedAt).getTime() - new Date(left.updatedAt || left.generatedAt).getTime())[0] ?? null;
}

function summarizeCheckpoint(checkpoint: GoalCheckpointItem): GoalHandoffCheckpointSummary {
  return {
    id: checkpoint.id,
    status: checkpoint.status,
    title: checkpoint.title,
    nodeId: checkpoint.nodeId,
    summary: checkpoint.summary,
    reviewer: checkpoint.reviewer,
    reviewerRole: checkpoint.reviewerRole,
    updatedAt: checkpoint.updatedAt,
  };
}

function buildTracking(graph: GoalTaskGraph, checkpoints: GoalCheckpointState) {
  const countNodeStatus = (status: GoalTaskNodeStatus) => graph.nodes.filter((node) => node.status === status).length;
  return {
    totalNodes: graph.nodes.length,
    completedNodes: countNodeStatus("done"),
    inProgressNodes: countNodeStatus("in_progress"),
    blockedNodes: countNodeStatus("blocked"),
    pendingReviewNodes: countNodeStatus("pending_review"),
    validatingNodes: countNodeStatus("validating"),
    failedNodes: countNodeStatus("failed"),
    skippedNodes: countNodeStatus("skipped"),
    openCheckpointCount: checkpoints.items.filter((item) => item.status === "required" || item.status === "waiting_user").length,
  };
}

function resolveResumeMode(goal: LongTermGoal, openCheckpoints: GoalCheckpointItem[], blockedNodes: GoalTaskNode[]): {
  resumeMode: GoalHandoffResumeMode;
  recommendedNodeId?: string;
} {
  if (openCheckpoints.length > 0) {
    return {
      resumeMode: "checkpoint",
      recommendedNodeId: openCheckpoints[0]?.nodeId,
    };
  }
  if (goal.status === "executing" && goal.activeNodeId) {
    return {
      resumeMode: "current_node",
      recommendedNodeId: goal.activeNodeId,
    };
  }
  if ((goal.status === "blocked" || blockedNodes.length > 0) && (goal.activeNodeId || goal.lastNodeId || blockedNodes[0]?.id)) {
    return {
      resumeMode: "blocked",
      recommendedNodeId: goal.activeNodeId || goal.lastNodeId || blockedNodes[0]?.id,
    };
  }
  if (goal.lastNodeId) {
    return {
      resumeMode: "last_node",
      recommendedNodeId: goal.lastNodeId,
    };
  }
  return { resumeMode: "goal_channel" };
}

function buildBlockers(blockedNodes: GoalTaskNode[], openCheckpoints: GoalCheckpointItem[]): GoalHandoffBlocker[] {
  const nodeBlockers = blockedNodes.map((node) => ({
    kind: "node" as const,
    id: node.id,
    title: node.title,
    status: node.status,
    nodeId: node.id,
    reason: node.blockReason || node.summary || node.description,
  }));
  const checkpointBlockers = openCheckpoints.map((checkpoint) => ({
    kind: "checkpoint" as const,
    id: checkpoint.id,
    title: checkpoint.title,
    status: checkpoint.status,
    nodeId: checkpoint.nodeId,
    reason: checkpoint.summary || checkpoint.note,
  }));
  return [...nodeBlockers, ...checkpointBlockers].slice(0, 8);
}

function buildSummary(goal: LongTermGoal, openCheckpoints: GoalCheckpointItem[], blockedNodes: GoalTaskNode[], focusNode: GoalTaskNode | undefined) {
  if (openCheckpoints.length > 0) {
    const checkpoint = openCheckpoints[0];
    return `当前 goal 存在待处理 checkpoint（${checkpoint.id}），应先完成审批/流转，再继续执行 ${checkpoint.nodeId || "对应节点"}。`;
  }
  if (blockedNodes.length > 0) {
    const blocked = blockedNodes[0];
    return `当前 goal 处于阻塞态，优先解除节点 ${blocked.id} 的阻塞原因：${blocked.blockReason || blocked.summary || "未填写原因"}。`;
  }
  if (goal.status === "executing" && focusNode) {
    return `当前 goal 正在执行节点 ${focusNode.id}，可按现有执行上下文继续推进。`;
  }
  if (goal.lastNodeId) {
    return `当前 goal 可按最近节点 ${goal.lastNodeId} 恢复，继续补齐执行与验收闭环。`;
  }
  return "当前 goal 还没有明确的恢复节点，建议先回到基础 goal channel 校准目标、计划与任务图。";
}

function buildNextAction(snapshot: {
  resumeMode: GoalHandoffResumeMode;
  recommendedNodeId?: string;
  openCheckpoints: GoalCheckpointItem[];
  blockedNodes: GoalTaskNode[];
  nextReadyNode?: GoalTaskNode;
}): string {
  if (snapshot.openCheckpoints.length > 0) {
    const checkpoint = snapshot.openCheckpoints[0];
    return `优先处理 checkpoint ${checkpoint.id}${checkpoint.nodeId ? `（node ${checkpoint.nodeId}）` : ""}，完成审批后再恢复执行。`;
  }
  if (snapshot.blockedNodes.length > 0) {
    const blocked = snapshot.blockedNodes[0];
    return `先解除节点 ${blocked.id} 的阻塞，再决定是否重新 claim / validating / complete。`;
  }
  if (snapshot.resumeMode === "current_node" || snapshot.resumeMode === "last_node") {
    return snapshot.recommendedNodeId
      ? `恢复节点 ${snapshot.recommendedNodeId}，检查 capability plan、artifact 与验收条件后继续推进。`
      : "回到 goal channel，确认最近执行上下文后继续。";
  }
  if (snapshot.nextReadyNode) {
    return `当前没有待审批项，建议下一步进入 ready 节点 ${snapshot.nextReadyNode.id}。`;
  }
  return "先进入基础 goal channel，补齐目标分解、任务图或恢复策略。";
}

function buildCapabilityFocus(plan: GoalCapabilityPlan | null): GoalHandoffCapabilityFocus | undefined {
  if (!plan) return undefined;
  return {
    planId: plan.id,
    nodeId: plan.nodeId,
    status: plan.status,
    executionMode: plan.executionMode,
    riskLevel: plan.riskLevel,
    alignment: plan.analysis.status,
    summary: plan.summary || plan.analysis.summary || "",
  };
}

function renderList(items: string[]): string {
  return items.length > 0 ? items.map((item) => `- ${escapeMarkdown(item)}`).join("\n") : "- (none)";
}

function buildMarkdown(goal: LongTermGoal, handoff: GoalHandoffSnapshot): string {
  const focusCapabilityLine = handoff.focusCapability
    ? `${handoff.focusCapability.planId} | node=${handoff.focusCapability.nodeId} | ${handoff.focusCapability.executionMode} | risk=${handoff.focusCapability.riskLevel} | alignment=${handoff.focusCapability.alignment}`
    : "(none)";
  const checkpointLines = handoff.openCheckpoints.map((item) =>
    `[${item.status}] ${item.id}${item.nodeId ? ` | node=${item.nodeId}` : ""} | ${item.title}${item.summary ? ` | ${item.summary}` : ""}`,
  );
  const blockerLines = handoff.blockers.map((item) =>
    `[${item.kind}:${item.status}] ${item.id}${item.nodeId ? ` | node=${item.nodeId}` : ""} | ${item.title}${item.reason ? ` | ${item.reason}` : ""}`,
  );
  const progressLines = handoff.recentProgress.map((entry) =>
    `${entry.at} | ${entry.event || "-"}${entry.nodeId ? ` | node=${entry.nodeId}` : ""}${entry.checkpointId ? ` | checkpoint=${entry.checkpointId}` : ""}${entry.summary ? ` | ${entry.summary}` : ""}`,
  );

  return [
    "# handoff",
    "",
    "## Meta",
    `- Generated At: ${handoff.generatedAt}`,
    `- Goal ID: ${goal.id}`,
    `- Goal Title: ${goal.title}`,
    `- Goal Status: ${handoff.goalStatus}`,
    `- Current Phase: ${goal.currentPhase ?? "(none)"}`,
    `- Resume Mode: ${handoff.resumeMode}`,
    `- Resume Node: ${handoff.recommendedNodeId ?? "(none)"}`,
    `- Active Node: ${handoff.activeNodeId ?? "(none)"}`,
    `- Last Node: ${handoff.lastNodeId ?? "(none)"}`,
    `- Last Run: ${handoff.lastRunId ?? "(none)"}`,
    "",
    "## Summary",
    handoff.summary,
    "",
    "## Next Action",
    handoff.nextAction,
    "",
    "## Tracking",
    `- Total Nodes: ${handoff.tracking.totalNodes}`,
    `- Completed Nodes: ${handoff.tracking.completedNodes}`,
    `- In Progress Nodes: ${handoff.tracking.inProgressNodes}`,
    `- Blocked Nodes: ${handoff.tracking.blockedNodes}`,
    `- Pending Review Nodes: ${handoff.tracking.pendingReviewNodes}`,
    `- Validating Nodes: ${handoff.tracking.validatingNodes}`,
    `- Failed Nodes: ${handoff.tracking.failedNodes}`,
    `- Skipped Nodes: ${handoff.tracking.skippedNodes}`,
    `- Open Checkpoints: ${handoff.tracking.openCheckpointCount}`,
    "",
    "## Focus Capability",
    `- Plan: ${focusCapabilityLine}`,
    `- Summary: ${handoff.focusCapability?.summary || "(none)"}`,
    "",
    "## Open Checkpoints",
    renderList(checkpointLines),
    "",
    "## Blockers",
    renderList(blockerLines),
    "",
    "## Recent Timeline",
    renderList(progressLines),
    "",
  ].join("\n");
}

async function atomicWriteText(targetPath: string, content: string): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempPath, content, "utf-8");
  await fs.rename(tempPath, targetPath);
}

export function buildGoalHandoffResult(input: GoalHandoffInput): GoalHandoffReadResult {
  const { goal, runtime, graph, checkpoints, plans, progressContent } = input;
  const openCheckpoints = checkpoints.items
    .filter((item) => item.status === "required" || item.status === "waiting_user")
    .sort((left, right) => new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime());
  const blockedNodes = graph.nodes.filter((node) => node.status === "blocked" || node.status === "failed");
  const focusNode = graph.nodes.find((node) => node.id === (goal.activeNodeId || goal.lastNodeId || ""));
  const focusPlan = pickFocusPlan(goal, plans);
  const recentProgress: GoalHandoffTimelineEntry[] = parseGoalProgressEntries(progressContent).slice(0, 6);
  const tracking = buildTracking(graph, checkpoints);
  const resume = resolveResumeMode(goal, openCheckpoints, blockedNodes);
  const nextReadyNode = graph.nodes.find((node) => node.status === "ready");
  const handoff: GoalHandoffSnapshot = {
    version: 1,
    goalId: goal.id,
    generatedAt: new Date().toISOString(),
    goalStatus: goal.status,
    currentPhase: goal.currentPhase,
    activeConversationId: goal.activeConversationId || runtime.activeConversationId,
    activeNodeId: goal.activeNodeId || runtime.activeNodeId,
    lastNodeId: goal.lastNodeId || runtime.lastNodeId,
    lastRunId: goal.lastRunId || runtime.lastRunId,
    resumeMode: resume.resumeMode,
    recommendedNodeId: resume.recommendedNodeId,
    summary: buildSummary(goal, openCheckpoints, blockedNodes, focusNode),
    nextAction: buildNextAction({
      resumeMode: resume.resumeMode,
      recommendedNodeId: resume.recommendedNodeId,
      openCheckpoints,
      blockedNodes,
      nextReadyNode,
    }),
    tracking,
    openCheckpoints: openCheckpoints.slice(0, 6).map(summarizeCheckpoint),
    blockers: buildBlockers(blockedNodes, openCheckpoints),
    focusCapability: buildCapabilityFocus(focusPlan),
    recentProgress,
  };
  const content = buildMarkdown(goal, handoff);
  return {
    goal,
    handoff,
    continuationState: buildGoalContinuationState(handoff),
    content,
  };
}

export async function generateGoalHandoff(input: GoalHandoffInput): Promise<GoalHandoffGenerateResult> {
  const result = buildGoalHandoffResult(input);
  await atomicWriteText(input.goal.handoffPath, result.content);
  return result;
}
