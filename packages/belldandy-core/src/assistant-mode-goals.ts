import type { GoalManager } from "./goals/manager.js";
import type { GoalHandoffReadResult, GoalStatus, LongTermGoal } from "./goals/types.js";

export type AssistantModeGoalPrimarySummary = {
  goalId: string;
  title: string;
  status: GoalStatus;
  activeConversationId?: string;
  summary?: string;
  nextAction?: string;
  blockerSummary?: string;
  checkpointSummary?: string;
  targetId?: string;
  targetType?: "conversation" | "session" | "node" | "goal";
};

export type AssistantModeGoalRuntimeSummary = {
  totalCount: number;
  activeCount: number;
  blockedCount: number;
  pendingApprovalCount: number;
  reviewingCount: number;
  headline: string;
  primary?: AssistantModeGoalPrimarySummary;
};

type GoalReader = Pick<GoalManager, "listGoals" | "getHandoff">;

function normalizeString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized || undefined;
}

function isActiveGoalStatus(status: GoalStatus): boolean {
  return status !== "draft" && status !== "paused" && status !== "completed" && status !== "archived";
}

function getGoalPriority(status: GoalStatus): number {
  switch (status) {
    case "blocked":
      return 0;
    case "pending_approval":
      return 1;
    case "reviewing":
      return 2;
    case "executing":
      return 3;
    case "ready":
      return 4;
    case "planning":
      return 5;
    case "aligning":
      return 6;
    case "paused":
      return 7;
    case "completed":
      return 8;
    case "archived":
      return 9;
    case "draft":
    default:
      return 10;
  }
}

function selectPrimaryGoal(goals: LongTermGoal[]): LongTermGoal | undefined {
  return [...goals]
    .sort((left, right) => {
      const priority = getGoalPriority(left.status) - getGoalPriority(right.status);
      if (priority !== 0) return priority;
      return String(right.updatedAt || "").localeCompare(String(left.updatedAt || ""));
    })[0];
}

function buildGoalPrimarySummary(
  goal: LongTermGoal,
  handoff?: GoalHandoffReadResult,
): AssistantModeGoalPrimarySummary {
  const blocker = handoff?.handoff?.blockers?.[0];
  const openCheckpoint = handoff?.handoff?.openCheckpoints?.[0];
  const activeConversationId = normalizeString(handoff?.handoff?.activeConversationId)
    || normalizeString(goal.activeConversationId);
  const nextAction = normalizeString(handoff?.handoff?.nextAction);
  const summary = normalizeString(handoff?.handoff?.summary);

  return {
    goalId: goal.id,
    title: goal.title,
    status: goal.status,
    ...(activeConversationId ? { activeConversationId } : {}),
    ...(summary ? { summary } : {}),
    ...(nextAction ? { nextAction } : {}),
    ...(normalizeString(blocker?.reason)
      ? { blockerSummary: normalizeString(blocker?.reason) }
      : normalizeString(blocker?.title)
        ? { blockerSummary: normalizeString(blocker?.title) }
        : {}),
    ...(normalizeString(openCheckpoint?.summary)
      ? { checkpointSummary: normalizeString(openCheckpoint?.summary) }
      : normalizeString(openCheckpoint?.title)
        ? { checkpointSummary: normalizeString(openCheckpoint?.title) }
        : {}),
    ...(activeConversationId
      ? {
        targetId: activeConversationId,
        targetType: "conversation" as const,
      }
      : {}),
  };
}

export async function buildAssistantModeGoalRuntimeSummary(input: {
  goalReader?: GoalReader;
}): Promise<AssistantModeGoalRuntimeSummary | undefined> {
  if (!input.goalReader) {
    return undefined;
  }
  const goals = await input.goalReader.listGoals();
  if (!Array.isArray(goals) || goals.length === 0) {
    return undefined;
  }

  const totalCount = goals.length;
  const activeCount = goals.filter((item) => isActiveGoalStatus(item.status)).length;
  const blockedCount = goals.filter((item) => item.status === "blocked").length;
  const pendingApprovalCount = goals.filter((item) => item.status === "pending_approval").length;
  const reviewingCount = goals.filter((item) => item.status === "reviewing").length;
  const primaryGoal = selectPrimaryGoal(goals);
  const primaryHandoff = primaryGoal
    ? await input.goalReader.getHandoff(primaryGoal.id).catch(() => undefined)
    : undefined;

  const headline = [
    `goals=${totalCount}`,
    `active=${activeCount}`,
    `blocked=${blockedCount}`,
    `pendingApproval=${pendingApprovalCount}`,
    `reviewing=${reviewingCount}`,
  ].join("; ");

  return {
    totalCount,
    activeCount,
    blockedCount,
    pendingApprovalCount,
    reviewingCount,
    headline,
    ...(primaryGoal
      ? { primary: buildGoalPrimarySummary(primaryGoal, primaryHandoff) }
      : {}),
  };
}
