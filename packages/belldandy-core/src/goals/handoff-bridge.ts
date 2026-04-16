import { getSubTaskBridgeProjection } from "../subtask-bridge-view.js";
import { SubTaskRuntimeStore } from "../task-runtime.js";
import type { GoalHandoffBridgeItem, GoalHandoffBridgeSummary, GoalTaskGraph } from "./types.js";

function normalizeText(value: string | undefined): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeRuntimeState(value: string | undefined): GoalHandoffBridgeItem["runtimeState"] {
  const normalized = normalizeText(value);
  switch (normalized) {
    case "active":
    case "closed":
    case "runtime-lost":
    case "orphaned":
      return normalized;
    default:
      return undefined;
  }
}

function normalizeCloseReason(value: string | undefined): GoalHandoffBridgeItem["closeReason"] {
  const normalized = normalizeText(value);
  switch (normalized) {
    case "manual":
    case "idle-timeout":
    case "runtime-lost":
    case "orphan":
      return normalized;
    default:
      return undefined;
  }
}

function buildSummaryLines(input: ReturnType<typeof getSubTaskBridgeProjection>): string[] {
  const lines: string[] = [];
  if (input.bridgeSubtaskView?.summaryLine) {
    lines.push(input.bridgeSubtaskView.summaryLine);
  }
  if (input.bridgeSessionView?.summaryLine && input.bridgeSessionView.summaryLine !== input.bridgeSubtaskView?.summaryLine) {
    lines.push(input.bridgeSessionView.summaryLine);
  }
  return lines;
}

function getBridgeGovernanceSeverity(
  runtimeState: GoalHandoffBridgeItem["runtimeState"],
  blockReason: string | undefined,
): number {
  if (runtimeState === "runtime-lost") return 0;
  if (runtimeState === "orphaned") return 1;
  if (blockReason) return 2;
  if (runtimeState === "active") return 3;
  if (runtimeState === "closed") return 4;
  return 5;
}

export async function loadGoalHandoffBridgeGovernanceSummary(input: {
  stateDir: string;
  graph: GoalTaskGraph;
  itemLimit?: number;
}): Promise<GoalHandoffBridgeSummary | undefined> {
  const nodes = Array.isArray(input.graph?.nodes) ? input.graph.nodes : [];
  if (!nodes.length) return undefined;

  const store = new SubTaskRuntimeStore(input.stateDir);
  await store.load();

  type BridgeGovernanceItem = GoalHandoffBridgeItem & { order: number };

  const bridgeNodes = (await Promise.all(nodes.map(async (node, index): Promise<BridgeGovernanceItem | null> => {
    const taskId = normalizeText(node?.lastRunId);
    if (!taskId) return null;
    const record = await store.getTask(taskId);
    if (!record) return null;
    const projection = getSubTaskBridgeProjection(record);
    if (!projection.bridgeSubtaskView && !projection.bridgeSessionView) return null;
    const runtimeState = normalizeRuntimeState(projection.bridgeSessionView?.runtimeState);
    const closeReason = normalizeCloseReason(projection.bridgeSessionView?.closeReason);
    const blockReason = normalizeText(projection.bridgeSessionView?.blockReason);
    const artifactPath = normalizeText(projection.bridgeSessionView?.artifactPath);
    const transcriptPath = normalizeText(projection.bridgeSessionView?.transcriptPath);
    return {
      order: index,
      nodeId: normalizeText(node.id) || `node-${index + 1}`,
      title: normalizeText(node.title) || normalizeText(node.id) || `node-${index + 1}`,
      taskId,
      runtimeState,
      closeReason,
      blockReason,
      artifactPath,
      transcriptPath,
      summaryLines: buildSummaryLines(projection),
    };
  }))).filter((item): item is BridgeGovernanceItem => Boolean(item));

  if (!bridgeNodes.length) return undefined;

  return {
    bridgeNodeCount: bridgeNodes.length,
    activeCount: bridgeNodes.filter((item) => item.runtimeState === "active").length,
    runtimeLostCount: bridgeNodes.filter((item) => item.runtimeState === "runtime-lost").length,
    orphanedCount: bridgeNodes.filter((item) => item.runtimeState === "orphaned").length,
    closedCount: bridgeNodes.filter((item) => item.runtimeState === "closed").length,
    blockedCount: bridgeNodes.filter((item) => Boolean(item.blockReason)).length,
    artifactCount: bridgeNodes.filter((item) => Boolean(item.artifactPath)).length,
    transcriptCount: bridgeNodes.filter((item) => Boolean(item.transcriptPath)).length,
    items: bridgeNodes
      .slice()
      .sort((left, right) => {
        const severity = getBridgeGovernanceSeverity(left.runtimeState, left.blockReason)
          - getBridgeGovernanceSeverity(right.runtimeState, right.blockReason);
        if (severity !== 0) return severity;
        return left.order - right.order;
      })
      .slice(0, Math.max(input.itemLimit ?? 4, 0))
      .map(({ order, ...item }) => item),
  };
}
