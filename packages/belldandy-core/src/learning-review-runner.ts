import {
  type ExperienceCandidate,
  type ExperienceCandidateType,
  type ExperiencePromoteResult,
  type TaskExperienceDetail,
  resolveAutomaticExperiencePromotionTaskGate,
} from "@belldandy/memory";

import type {
  GoalExperienceSuggestResult,
  GoalLearningReviewRefreshState,
  GoalReviewScanLearningReviewRunResult,
  GoalReviewGovernanceSummary,
  GoalSuggestionReviewState,
} from "./goals/types.js";
import { buildLearningReviewInput, type LearningReviewInput } from "./learning-review-input.js";
import { buildMindProfileSnapshot } from "./mind-profile-snapshot.js";
import type { ScopedMemoryManagerRecord } from "./resident-memory-managers.js";

export type LearningReviewTaskAction = {
  type: ExperienceCandidateType;
  status: "generated" | "existing" | "skipped";
  candidateId?: string;
  title?: string;
  reason?: string;
  reusedExisting?: boolean;
};

export type LearningReviewPromotionGate = {
  allowed: boolean;
  reason?: string;
};

export type PostTaskLearningReviewRunResult = {
  taskId: string;
  agentId: string;
  learningReviewInput: LearningReviewInput;
  generated: boolean;
  actions: LearningReviewTaskAction[];
  summary: string;
  recommendations: string[];
};

type GoalRefreshPriorityKind = "method" | "skill" | "flow";

function hasTaskExecutionSignal(task: TaskExperienceDetail): boolean {
  return Boolean(task.summary?.trim())
    || Boolean(task.reflection?.trim())
    || Boolean(task.outcome?.trim())
    || Boolean(task.objective?.trim())
    || (task.toolCalls?.length ?? 0) > 0
    || (task.artifactPaths?.length ?? 0) > 0
    || (task.memoryLinks?.length ?? 0) > 0;
}

function shouldGenerateMethodCandidate(task: TaskExperienceDetail, learningReviewInput: LearningReviewInput): boolean {
  if (task.status !== "success" && task.status !== "partial") return false;
  if (!hasTaskExecutionSignal(task)) return false;
  if ((task.toolCalls?.length ?? 0) > 0 || (task.artifactPaths?.length ?? 0) > 0) return true;
  return learningReviewInput.summary.taskSignalCount >= 2;
}

function shouldGenerateSkillCandidate(task: TaskExperienceDetail, learningReviewInput: LearningReviewInput): boolean {
  if (task.status !== "success" && task.status !== "partial") return false;
  if (!hasTaskExecutionSignal(task)) return false;
  if ((task.toolCalls?.length ?? 0) <= 0) return false;
  return learningReviewInput.summary.taskSignalCount >= 2
    || learningReviewInput.summary.memorySignalCount > 0;
}

function buildTaskAction(
  type: ExperienceCandidateType,
  result: ExperiencePromoteResult | null,
  status: LearningReviewTaskAction["status"],
  reason?: string,
): LearningReviewTaskAction {
  return {
    type,
    status,
    candidateId: result?.candidate.id,
    title: result?.candidate.title,
    reason,
    reusedExisting: result?.reusedExisting,
  };
}

export async function runPostTaskLearningReview(input: {
  stateDir: string;
  residentMemoryManagers?: ScopedMemoryManagerRecord[];
  agentId?: string;
  task: TaskExperienceDetail | null;
  findCandidate: (taskId: string, type: ExperienceCandidateType) => ExperienceCandidate | null;
  promote: (taskId: string, type: ExperienceCandidateType) => ExperiencePromoteResult | null;
  canPromote?: (type: ExperienceCandidateType) => LearningReviewPromotionGate | boolean;
}): Promise<PostTaskLearningReviewRunResult | null> {
  if (!input.task) {
    return null;
  }
  const agentId = input.agentId?.trim() || input.task.agentId?.trim() || "default";
  const learningReviewInput = buildLearningReviewInput({
    mindProfileSnapshot: await buildMindProfileSnapshot({
      stateDir: input.stateDir,
      residentMemoryManagers: input.residentMemoryManagers,
      agentId,
    }),
    taskExperienceDetail: input.task,
  });

  const actions: LearningReviewTaskAction[] = [];
  const taskGate = resolveAutomaticExperiencePromotionTaskGate(input.task);
  if (!taskGate.allowed) {
    for (const type of ["method", "skill"] satisfies ExperienceCandidateType[]) {
      actions.push(buildTaskAction(type, null, "skipped", taskGate.reason || "task is excluded from automatic promotion"));
    }
    return buildPostTaskLearningReviewRunResult({
      input,
      agentId,
      learningReviewInput,
      actions,
    });
  }

  const candidates: ExperienceCandidateType[] = ["method", "skill"];
  for (const type of candidates) {
    const existing = input.findCandidate(input.task.id, type);
    if (existing) {
      actions.push(buildTaskAction(type, { candidate: existing, reusedExisting: true }, "existing", "candidate already exists"));
      continue;
    }
    const gate = resolvePromotionGate(input.canPromote?.(type));
    if (!gate.allowed) {
      actions.push(buildTaskAction(type, null, "skipped", gate.reason || "promotion is disabled"));
      continue;
    }
    const allowed = type === "method"
      ? shouldGenerateMethodCandidate(input.task, learningReviewInput)
      : shouldGenerateSkillCandidate(input.task, learningReviewInput);
    if (!allowed) {
      actions.push(buildTaskAction(type, null, "skipped", "task signal is below generation threshold"));
      continue;
    }
    const created = input.promote(input.task.id, type);
    actions.push(created
      ? buildTaskAction(type, created, "generated")
      : buildTaskAction(type, null, "skipped", "promotion returned empty result"));
  }

  const generatedCount = actions.filter((item) => item.status === "generated").length;
  const existingCount = actions.filter((item) => item.status === "existing").length;
  const recommendations = [
    generatedCount > 0
      ? `本次 post-run learning review 生成 ${generatedCount} 个 candidate。`
      : "",
    existingCount > 0
      ? `已有 ${existingCount} 个同 task candidate，当前不重复生成。`
      : "",
    ...learningReviewInput.nudges.slice(0, 2),
  ].filter(Boolean);

  return buildPostTaskLearningReviewRunResult({
    input,
    agentId,
    learningReviewInput,
    actions,
  });
}

function buildPostTaskLearningReviewRunResult(input: {
  input: { task: TaskExperienceDetail | null };
  agentId: string;
  learningReviewInput: LearningReviewInput;
  actions: LearningReviewTaskAction[];
}): PostTaskLearningReviewRunResult {
  const { agentId, learningReviewInput, actions } = input;
  const task = input.input.task!;
  const generatedCount = actions.filter((item) => item.status === "generated").length;
  const existingCount = actions.filter((item) => item.status === "existing").length;
  const skippedCount = actions.filter((item) => item.status === "skipped").length;
  const recommendations = [
    generatedCount > 0
      ? `本次 post-run learning review 生成 ${generatedCount} 个 candidate。`
      : "",
    existingCount > 0
      ? `已有 ${existingCount} 个同 task candidate，当前不重复生成。`
      : "",
    skippedCount > 0 && generatedCount === 0 && existingCount === 0
      ? `本次 post-run learning review 跳过 ${skippedCount} 个 candidate。`
      : "",
    ...learningReviewInput.nudges.slice(0, 2),
  ].filter(Boolean);

  return {
    taskId: task.id,
    agentId,
    learningReviewInput,
    generated: generatedCount > 0,
    actions,
    summary: `task=${task.id} | generated=${generatedCount} | existing=${existingCount} | skipped=${skippedCount} | task_signal=${learningReviewInput.summary.taskSignalCount}`,
    recommendations,
  };
}

function resolvePromotionGate(value: LearningReviewPromotionGate | boolean | undefined): LearningReviewPromotionGate {
  if (typeof value === "boolean") {
    return { allowed: value };
  }
  if (value && typeof value.allowed === "boolean") {
    return value;
  }
  return { allowed: true };
}

function countGoalReviews(summary: GoalReviewGovernanceSummary): number {
  return Array.isArray(summary.reviews?.items) ? summary.reviews.items.length : 0;
}

function countActionableGoalReviews(summary: GoalReviewGovernanceSummary): number {
  return Array.isArray(summary.actionableReviews) ? summary.actionableReviews.length : 0;
}

function hasGoalLearningSeed(summary: GoalReviewGovernanceSummary, learningReviewInput: LearningReviewInput): boolean {
  return Boolean(summary.goal.lastRunId || summary.goal.lastNodeId || summary.goal.activeNodeId)
    || summary.actionableCheckpoints.length > 0
    || summary.crossGoal.items.length > 0
    || learningReviewInput.summary.reviewSignalCount > 0;
}

function selectGoalRefreshPriority(input: {
  governanceSummary: GoalReviewGovernanceSummary;
  learningReviewInput: LearningReviewInput;
  suggestionCounts: { method: number; skill: number; flow: number };
}): { kind: GoalRefreshPriorityKind; reason: string } | undefined {
  const { governanceSummary, learningReviewInput, suggestionCounts } = input;
  const reviewTypeCounts = governanceSummary.reviewTypeCounts ?? {
    method_candidate: 0,
    skill_candidate: 0,
    flow_pattern: 0,
  };
  if (
    suggestionCounts.flow > 0
    && (
      governanceSummary.crossGoal.items.length > 0
      || governanceSummary.actionableCheckpoints.length > 0
      || governanceSummary.checkpointWorkflowPendingCount > 0
      || governanceSummary.checkpointWorkflowOverdueCount > 0
    )
  ) {
    return {
      kind: "flow",
      reason: "当前 goal 已出现跨 goal 流程或 checkpoint 治理信号，优先看 flow pattern 更容易收敛治理动作。",
    };
  }
  if (suggestionCounts.method > 0 && (reviewTypeCounts.method_candidate ?? 0) === 0) {
    return {
      kind: "method",
      reason: "当前 goal 还没有 method review 历史，优先补齐 method 线更容易形成首批可治理样本。",
    };
  }
  if (suggestionCounts.skill > 0 && (reviewTypeCounts.skill_candidate ?? 0) === 0) {
    return {
      kind: "skill",
      reason: "当前 goal 还没有 skill review 历史，优先补齐 skill 线更容易暴露能力缺口。",
    };
  }
  if (suggestionCounts.method > 0 && learningReviewInput.summary.taskSignalCount >= learningReviewInput.summary.memorySignalCount) {
    return {
      kind: "method",
      reason: "当前 task execution signal 更强，优先处理 method candidate 更贴近本轮已验证步骤。",
    };
  }
  if (suggestionCounts.skill > 0) {
    return {
      kind: "skill",
      reason: "当前 memory / capability signal 仍可支撑 skill draft，优先看 skill candidate 能更早暴露能力缺口。",
    };
  }
  if (suggestionCounts.flow > 0) {
    return {
      kind: "flow",
      reason: "当前已生成可复用流程模式，优先看 flow pattern 有助于后续治理复用。",
    };
  }
  return undefined;
}

function formatGoalRefreshPriorityHint(priority: { kind: GoalRefreshPriorityKind; reason: string }): string {
  const label = priority.kind === "method"
    ? "method candidate"
    : priority.kind === "skill"
      ? "skill candidate"
      : "flow pattern";
  return `当前 refresh 优先级：${label}；${priority.reason}`;
}

export async function runGoalReviewScanLearningReview(input: {
  stateDir: string;
  residentMemoryManagers?: ScopedMemoryManagerRecord[];
  agentId?: string;
  governanceSummary: GoalReviewGovernanceSummary;
  refreshState?: GoalLearningReviewRefreshState;
  refreshFingerprint?: string;
  generateSuggestions: () => Promise<GoalExperienceSuggestResult>;
  syncReviews?: () => Promise<GoalSuggestionReviewState>;
}): Promise<GoalReviewScanLearningReviewRunResult> {
  const learningReviewInput = buildLearningReviewInput({
    mindProfileSnapshot: await buildMindProfileSnapshot({
      stateDir: input.stateDir,
      residentMemoryManagers: input.residentMemoryManagers,
      agentId: input.agentId,
    }),
    goalReviewGovernanceSummary: input.governanceSummary,
  });
  const existingReviewCount = countGoalReviews(input.governanceSummary);
  const actionableReviewCount = countActionableGoalReviews(input.governanceSummary);
  if (!learningReviewInput.summary.available) {
    return {
      goalId: input.governanceSummary.goal.id,
      outcome: "empty_input",
      refreshed: false,
      generated: false,
      learningReviewInput,
      suggestionCounts: { method: 0, skill: 0, flow: 0 },
      summary: `goal=${input.governanceSummary.goal.id} | skipped=empty_input`,
      recommendations: ["learning/review input 仍为空，暂不触发 suggestion 生成。"],
    };
  }
  if (actionableReviewCount > 0) {
    return {
      goalId: input.governanceSummary.goal.id,
      outcome: "actionable_reviews",
      refreshed: false,
      generated: false,
      learningReviewInput,
      suggestionCounts: { method: 0, skill: 0, flow: 0 },
      summary: `goal=${input.governanceSummary.goal.id} | skipped=actionable_reviews:${actionableReviewCount}/${existingReviewCount}`,
      recommendations: [
        "当前 goal 仍有待处理的 review / publish 项，review scan 先不重复生成 suggestion。",
        ...input.governanceSummary.recommendations.slice(0, 2),
      ].filter(Boolean),
    };
  }
  if (!hasGoalLearningSeed(input.governanceSummary, learningReviewInput)) {
    return {
      goalId: input.governanceSummary.goal.id,
      outcome: "weak_seed",
      refreshed: false,
      generated: false,
      learningReviewInput,
      suggestionCounts: { method: 0, skill: 0, flow: 0 },
      summary: `goal=${input.governanceSummary.goal.id} | skipped=weak_seed`,
      recommendations: ["当前 goal 缺少稳定运行或治理信号，暂不触发 suggestion 生成。"],
    };
  }
  if (
    input.refreshFingerprint
    && input.refreshState?.lastRefreshFingerprint
    && input.refreshFingerprint === input.refreshState.lastRefreshFingerprint
  ) {
    return {
      goalId: input.governanceSummary.goal.id,
      outcome: "unchanged_signal",
      refreshed: false,
      generated: false,
      learningReviewInput,
      suggestionCounts: { method: 0, skill: 0, flow: 0 },
      summary: `goal=${input.governanceSummary.goal.id} | skipped=unchanged_signal`,
      recommendations: [
        "当前 goal 自上次 refresh 后没有新的运行信号，review scan 本轮跳过重复生成。",
        ...input.governanceSummary.recommendations.slice(0, 1),
      ].filter(Boolean),
    };
  }

  const result = await input.generateSuggestions();
  const reviews = input.syncReviews ? await input.syncReviews() : undefined;
  const suggestionCounts = {
    method: result.methodCandidates.count,
    skill: result.skillCandidates.count,
    flow: result.flowPatterns.count,
  };
  const generatedCount = suggestionCounts.method + suggestionCounts.skill + suggestionCounts.flow;
  const priority = selectGoalRefreshPriority({
    governanceSummary: input.governanceSummary,
    learningReviewInput,
    suggestionCounts,
  });

  return {
    goalId: input.governanceSummary.goal.id,
    outcome: "generated",
    refreshed: true,
    generated: generatedCount > 0,
    generatedAt: result.generatedAt,
    learningReviewInput,
    reviews,
    suggestionCounts,
    priorityKind: priority?.kind,
    summary: `goal=${input.governanceSummary.goal.id} | generated=${generatedCount} | method=${suggestionCounts.method} | skill=${suggestionCounts.skill} | flow=${suggestionCounts.flow}${priority ? ` | priority=${priority.kind}` : ""}`,
    recommendations: [
      ...(priority ? [formatGoalRefreshPriorityHint(priority)] : []),
      generatedCount > 0
        ? `review scan 额外生成 ${generatedCount} 个 suggestion，后续走现有 review/publish 治理链。`
        : "已触发 suggestion runner，但当前没有生成新的 suggestion。",
      ...input.governanceSummary.recommendations.slice(0, 1),
      ...result.recommendations.slice(0, 2),
      ...learningReviewInput.nudges.slice(0, 1),
    ].filter(Boolean),
  };
}
