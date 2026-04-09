import type {
  ExperienceCandidate,
  ExperienceCandidateType,
  ExperiencePromoteResult,
  TaskExperienceDetail,
} from "@belldandy/memory";

import type {
  GoalExperienceSuggestResult,
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

export type PostTaskLearningReviewRunResult = {
  taskId: string;
  agentId: string;
  learningReviewInput: LearningReviewInput;
  generated: boolean;
  actions: LearningReviewTaskAction[];
  summary: string;
  recommendations: string[];
};

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
  const candidates: ExperienceCandidateType[] = ["method", "skill"];
  for (const type of candidates) {
    const existing = input.findCandidate(input.task.id, type);
    if (existing) {
      actions.push(buildTaskAction(type, { candidate: existing, reusedExisting: true }, "existing", "candidate already exists"));
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

  return {
    taskId: input.task.id,
    agentId,
    learningReviewInput,
    generated: generatedCount > 0,
    actions,
    summary: `task=${input.task.id} | generated=${generatedCount} | existing=${existingCount} | task_signal=${learningReviewInput.summary.taskSignalCount}`,
    recommendations,
  };
}

function countGoalReviews(summary: GoalReviewGovernanceSummary): number {
  return Array.isArray(summary.reviews?.items) ? summary.reviews.items.length : 0;
}

function hasGoalLearningSeed(summary: GoalReviewGovernanceSummary, learningReviewInput: LearningReviewInput): boolean {
  return Boolean(summary.goal.lastRunId || summary.goal.lastNodeId || summary.goal.activeNodeId)
    || summary.actionableCheckpoints.length > 0
    || summary.crossGoal.items.length > 0
    || learningReviewInput.summary.reviewSignalCount > 0;
}

export async function runGoalReviewScanLearningReview(input: {
  stateDir: string;
  residentMemoryManagers?: ScopedMemoryManagerRecord[];
  agentId?: string;
  governanceSummary: GoalReviewGovernanceSummary;
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
  if (!learningReviewInput.summary.available) {
    return {
      goalId: input.governanceSummary.goal.id,
      generated: false,
      learningReviewInput,
      suggestionCounts: { method: 0, skill: 0, flow: 0 },
      summary: `goal=${input.governanceSummary.goal.id} | skipped=empty_input`,
      recommendations: ["learning/review input 仍为空，暂不触发 suggestion 生成。"],
    };
  }
  if (existingReviewCount > 0) {
    return {
      goalId: input.governanceSummary.goal.id,
      generated: false,
      learningReviewInput,
      suggestionCounts: { method: 0, skill: 0, flow: 0 },
      summary: `goal=${input.governanceSummary.goal.id} | skipped=existing_reviews:${existingReviewCount}`,
      recommendations: ["当前 goal 已存在 suggestion/review 记录，review scan 先不重复生成。"],
    };
  }
  if (!hasGoalLearningSeed(input.governanceSummary, learningReviewInput)) {
    return {
      goalId: input.governanceSummary.goal.id,
      generated: false,
      learningReviewInput,
      suggestionCounts: { method: 0, skill: 0, flow: 0 },
      summary: `goal=${input.governanceSummary.goal.id} | skipped=weak_seed`,
      recommendations: ["当前 goal 缺少稳定运行或治理信号，暂不触发 suggestion 生成。"],
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

  return {
    goalId: input.governanceSummary.goal.id,
    generated: generatedCount > 0,
    generatedAt: result.generatedAt,
    learningReviewInput,
    reviews,
    suggestionCounts,
    summary: `goal=${input.governanceSummary.goal.id} | generated=${generatedCount} | method=${suggestionCounts.method} | skill=${suggestionCounts.skill} | flow=${suggestionCounts.flow}`,
    recommendations: [
      generatedCount > 0
        ? `review scan 额外生成 ${generatedCount} 个 suggestion，后续走现有 review/publish 治理链。`
        : "已触发 suggestion runner，但当前没有生成新的 suggestion。",
      ...result.recommendations.slice(0, 2),
      ...learningReviewInput.nudges.slice(0, 1),
    ].filter(Boolean),
  };
}
