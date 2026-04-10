import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type {
  GoalCapabilityPlan,
  GoalCheckpointItem,
  GoalLearningReviewRefreshState,
  GoalTaskNode,
  LongTermGoal,
} from "./types.js";

function atomicWriteJson(targetPath: string, value: unknown): Promise<void> {
  return fs.mkdir(path.dirname(targetPath), { recursive: true })
    .then(() => fs.writeFile(targetPath, JSON.stringify(value, null, 2), "utf-8"));
}

export function getGoalLearningReviewRefreshStatePath(goal: Pick<LongTermGoal, "runtimeRoot">): string {
  return path.join(goal.runtimeRoot, "learning-review-refresh.json");
}

export function getDefaultGoalLearningReviewRefreshState(): GoalLearningReviewRefreshState {
  return {
    version: 1,
  };
}

export async function readGoalLearningReviewRefreshState(
  goal: Pick<LongTermGoal, "runtimeRoot">,
): Promise<GoalLearningReviewRefreshState> {
  try {
    const raw = await fs.readFile(getGoalLearningReviewRefreshStatePath(goal), "utf-8");
    const parsed = JSON.parse(raw) as GoalLearningReviewRefreshState | null;
    if (!parsed || typeof parsed !== "object") {
      return getDefaultGoalLearningReviewRefreshState();
    }
    return {
      version: 1,
      lastScanAt: typeof parsed.lastScanAt === "string" ? parsed.lastScanAt : undefined,
      lastScanFingerprint: typeof parsed.lastScanFingerprint === "string" ? parsed.lastScanFingerprint : undefined,
      lastRefreshAt: typeof parsed.lastRefreshAt === "string" ? parsed.lastRefreshAt : undefined,
      lastRefreshFingerprint: typeof parsed.lastRefreshFingerprint === "string" ? parsed.lastRefreshFingerprint : undefined,
      lastGeneratedAt: typeof parsed.lastGeneratedAt === "string" ? parsed.lastGeneratedAt : undefined,
      lastOutcome: typeof parsed.lastOutcome === "string" ? parsed.lastOutcome : undefined,
      lastReason: typeof parsed.lastReason === "string" ? parsed.lastReason : undefined,
      lastPriority: parsed.lastPriority === "method" || parsed.lastPriority === "skill" || parsed.lastPriority === "flow"
        ? parsed.lastPriority
        : undefined,
    };
  } catch (error) {
    if ((error as NodeJS.ErrnoException)?.code === "ENOENT") {
      return getDefaultGoalLearningReviewRefreshState();
    }
    throw error;
  }
}

export async function writeGoalLearningReviewRefreshState(
  goal: Pick<LongTermGoal, "runtimeRoot">,
  state: GoalLearningReviewRefreshState,
): Promise<void> {
  await atomicWriteJson(getGoalLearningReviewRefreshStatePath(goal), {
    version: 1,
    lastScanAt: state.lastScanAt,
    lastScanFingerprint: state.lastScanFingerprint,
    lastRefreshAt: state.lastRefreshAt,
    lastRefreshFingerprint: state.lastRefreshFingerprint,
    lastGeneratedAt: state.lastGeneratedAt,
    lastOutcome: state.lastOutcome,
    lastReason: state.lastReason,
    lastPriority: state.lastPriority,
  });
}

function normalizeText(value: string | undefined): string {
  return value?.trim() || "";
}

function normalizeList(values: string[]): string[] {
  return values
    .map((item) => item.trim())
    .filter(Boolean);
}

function selectRefreshNodes(nodes: GoalTaskNode[]): Array<Record<string, unknown>> {
  return nodes
    .filter((node) =>
      node.status === "done"
      || node.checkpointStatus === "approved"
      || Boolean(node.summary?.trim())
      || node.artifacts.length > 0
      || node.acceptance.length > 0,
    )
    .map((node) => ({
      id: node.id,
      status: node.status,
      checkpointStatus: node.checkpointStatus,
      lastRunId: node.lastRunId ?? "",
      summary: normalizeText(node.summary),
      artifacts: normalizeList(node.artifacts),
      acceptance: normalizeList(node.acceptance),
    }))
    .sort((left, right) => String(left.id).localeCompare(String(right.id), "zh-CN"));
}

function selectRefreshPlans(plans: GoalCapabilityPlan[]): Array<Record<string, unknown>> {
  const latestByNode = new Map<string, GoalCapabilityPlan>();
  for (const plan of plans) {
    const existing = latestByNode.get(plan.nodeId);
    if (!existing || new Date(plan.updatedAt).getTime() >= new Date(existing.updatedAt).getTime()) {
      latestByNode.set(plan.nodeId, plan);
    }
  }
  return [...latestByNode.values()]
    .filter((plan) =>
      plan.gaps.length > 0
      || plan.actualUsage.toolNames.length > 0
      || plan.actualUsage.mcpServers.length > 0
      || plan.executionMode === "multi_agent"
      || plan.analysis.status === "partial"
      || plan.analysis.status === "diverged"
      || plan.checkpoint.approvalMode !== "none",
    )
    .map((plan) => ({
      nodeId: plan.nodeId,
      runId: plan.runId ?? "",
      executionMode: plan.executionMode,
      riskLevel: plan.riskLevel,
      checkpointMode: plan.checkpoint.approvalMode,
      gaps: normalizeList(plan.gaps),
      toolNames: normalizeList(plan.actualUsage.toolNames),
      mcpServers: normalizeList(plan.actualUsage.mcpServers),
      analysisStatus: plan.analysis.status,
      deviations: plan.analysis.deviations.map((item) => ({
        area: item.area,
        summary: normalizeText(item.summary),
      })),
    }))
    .sort((left, right) => String(left.nodeId).localeCompare(String(right.nodeId), "zh-CN"));
}

function selectRefreshCheckpoints(checkpoints: GoalCheckpointItem[]): Array<Record<string, unknown>> {
  return checkpoints
    .filter((item) => item.status === "required" || item.status === "waiting_user")
    .map((item) => ({
      id: item.id,
      nodeId: item.nodeId ?? "",
      runId: item.runId ?? "",
      status: item.status,
      reviewer: item.reviewer ?? "",
      slaAt: item.slaAt ?? "",
    }))
    .sort((left, right) => String(left.id).localeCompare(String(right.id), "zh-CN"));
}

export function buildGoalLearningReviewRefreshFingerprint(input: {
  goal: Pick<LongTermGoal, "id" | "status" | "currentPhase" | "activeNodeId" | "lastNodeId" | "lastRunId">;
  nodes: GoalTaskNode[];
  plans: GoalCapabilityPlan[];
  checkpoints: GoalCheckpointItem[];
}): string {
  const payload = {
    goal: {
      id: input.goal.id,
      status: input.goal.status,
      currentPhase: input.goal.currentPhase ?? "",
      activeNodeId: input.goal.activeNodeId ?? "",
      lastNodeId: input.goal.lastNodeId ?? "",
      lastRunId: input.goal.lastRunId ?? "",
    },
    nodes: selectRefreshNodes(input.nodes),
    plans: selectRefreshPlans(input.plans),
    checkpoints: selectRefreshCheckpoints(input.checkpoints),
  };
  return crypto.createHash("sha1").update(JSON.stringify(payload)).digest("hex");
}
