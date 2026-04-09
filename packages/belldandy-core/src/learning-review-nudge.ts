import type { AgentPromptDelta, BeforeAgentStartResult } from "@belldandy/agent";
import type { MemoryManager, TaskExperienceDetail } from "@belldandy/memory";

import { parseGoalSessionKey } from "./goals/session.js";
import { buildLearningReviewInput } from "./learning-review-input.js";
import { buildMindProfileSnapshot } from "./mind-profile-snapshot.js";
import type { ScopedMemoryManagerRecord } from "./resident-memory-managers.js";

type GoalReviewNudgeSummary = {
  pendingReviewCount: number;
  needsRevisionCount: number;
};

type LearningReviewIntent = {
  hasExplicitLearningReviewIntent: boolean;
  wantsMemoryWrite: boolean;
  wantsMethod: boolean;
  wantsSkill: boolean;
  wantsReview: boolean;
};

type LearningReviewNudgeSignalKind = "memory" | "candidate" | "method" | "skill" | "review" | "generic";
type LearningReviewNudgeTriggerSource = "explicit_user_intent" | "goal_review_pressure";

function truncateText(value: string | undefined, maxLength = 72): string {
  const normalized = String(value ?? "").trim();
  if (!normalized) return "";
  return normalized.length > maxLength ? `${normalized.slice(0, Math.max(0, maxLength - 3))}...` : normalized;
}

function detectLearningReviewIntent(currentTurnText?: string): LearningReviewIntent {
  const text = String(currentTurnText ?? "").trim().toLowerCase();
  if (!text) {
    return {
      hasExplicitLearningReviewIntent: false,
      wantsMemoryWrite: false,
      wantsMethod: false,
      wantsSkill: false,
      wantsReview: false,
    };
  }

  const wantsMemoryWrite = /(记住|记下|记录|memory|长期记忆|durable|偏好|事实)/i.test(text);
  const wantsMethod = /(方法|method|流程|经验|复盘|提炼|沉淀|总结|sop)/i.test(text);
  const wantsSkill = /(技能|skill|能力|缺口|封装|复盘|提炼|沉淀|总结)/i.test(text);
  const wantsReview = /(候选|candidate|审阅|review|治理|发布|收口|整理)/i.test(text);

  return {
    hasExplicitLearningReviewIntent: wantsMemoryWrite || wantsMethod || wantsSkill || wantsReview,
    wantsMemoryWrite,
    wantsMethod,
    wantsSkill,
    wantsReview,
  };
}

function createLearningReviewDelta(input: {
  text: string;
  lineCount: number;
  metadata?: Record<string, unknown>;
}): AgentPromptDelta {
  return {
    id: "learning-review-nudge",
    deltaType: "user-prelude",
    role: "user-prelude",
    source: "learning-review-nudge",
    text: input.text,
    metadata: {
      blockTag: "learning-review-nudge",
      lineCount: input.lineCount,
      ...(input.metadata ?? {}),
    },
  };
}

function hasReusableTaskSignal(task: TaskExperienceDetail | null | undefined): boolean {
  if (!task) return false;
  return Boolean(task.summary?.trim())
    || Boolean(task.reflection?.trim())
    || Boolean(task.outcome?.trim())
    || Boolean(task.objective?.trim())
    || (task.toolCalls?.length ?? 0) > 0
    || (task.artifactPaths?.length ?? 0) > 0
    || (task.memoryLinks?.length ?? 0) > 0;
}

function shouldOfferMethodNudge(task: TaskExperienceDetail | null | undefined): boolean {
  return Boolean(task)
    && (task!.status === "success" || task!.status === "partial")
    && hasReusableTaskSignal(task)
    && (((task!.toolCalls?.length ?? 0) > 0) || ((task!.artifactPaths?.length ?? 0) > 0));
}

function shouldOfferSkillNudge(task: TaskExperienceDetail | null | undefined): boolean {
  return Boolean(task)
    && (task!.status === "success" || task!.status === "partial")
    && hasReusableTaskSignal(task)
    && ((task!.toolCalls?.length ?? 0) > 0);
}

function findRecentPromotionTarget(input: {
  manager: MemoryManager;
  agentId: string;
  type: "method" | "skill";
  limit: number;
}): TaskExperienceDetail | null {
  const tasks = input.manager.getRecentTasks(input.limit, {
    agentId: input.agentId,
    status: ["success", "partial"],
  });
  for (const item of tasks) {
    const detail = input.manager.getTaskDetail(item.id);
    if (!detail) continue;
    const existing = input.manager.findExperienceCandidateByTaskAndType(detail.id, input.type);
    if (existing) continue;
    if (input.type === "method" && shouldOfferMethodNudge(detail)) {
      return detail;
    }
    if (input.type === "skill" && shouldOfferSkillNudge(detail)) {
      return detail;
    }
  }
  return null;
}

function formatTaskReference(task: TaskExperienceDetail): string {
  return `${truncateText(task.title || task.objective || task.summary || task.id)} (${task.id})`;
}

async function resolveGoalReviewNudgeSummary(input: {
  sessionKey?: string;
  getGoalReviewNudgeSummary?: (goalId: string) => Promise<GoalReviewNudgeSummary | undefined>;
}): Promise<GoalReviewNudgeSummary | undefined> {
  const goalSession = parseGoalSessionKey(input.sessionKey);
  if (!goalSession || !input.getGoalReviewNudgeSummary) {
    return undefined;
  }
  return input.getGoalReviewNudgeSummary(goalSession.goalId);
}

export async function buildLearningReviewNudgePrelude(input: {
  stateDir: string;
  agentId?: string;
  sessionKey?: string;
  currentTurnText?: string;
  manager: MemoryManager;
  residentMemoryManagers?: ScopedMemoryManagerRecord[];
  getGoalReviewNudgeSummary?: (goalId: string) => Promise<GoalReviewNudgeSummary | undefined>;
  recentTaskLimit?: number;
}): Promise<BeforeAgentStartResult | undefined> {
  const agentId = input.agentId?.trim() || "default";
  const goalSession = parseGoalSessionKey(input.sessionKey);
  const intent = detectLearningReviewIntent(input.currentTurnText);
  const goalReview = await resolveGoalReviewNudgeSummary({
    sessionKey: input.sessionKey,
    getGoalReviewNudgeSummary: input.getGoalReviewNudgeSummary,
  });
  const hasGoalReviewPressure = Boolean(goalReview && (goalReview.pendingReviewCount > 0 || goalReview.needsRevisionCount > 0));
  if (!intent.hasExplicitLearningReviewIntent && !hasGoalReviewPressure) {
    return undefined;
  }

  const mindProfileSnapshot = await buildMindProfileSnapshot({
    stateDir: input.stateDir,
    residentMemoryManagers: input.residentMemoryManagers,
    agentId,
  });
  const learningReviewInput = buildLearningReviewInput({
    mindProfileSnapshot,
  });

  const lines: string[] = [];
  const signalKinds = new Set<LearningReviewNudgeSignalKind>();
  if (
    intent.wantsMemoryWrite
    && (!mindProfileSnapshot.identity.hasUserProfile || (mindProfileSnapshot.memory.privateMemoryCount + mindProfileSnapshot.memory.sharedMemoryCount) <= 1)
  ) {
    lines.push("若本轮确认了稳定的用户事实或偏好，优先用 `memory_write` 沉淀 durable memory，不要只留在聊天上下文里。");
    signalKinds.add("memory");
  }

  const draftCandidates = input.manager.listExperienceCandidates(6, {
    agentId,
    status: "draft",
  });
  if (draftCandidates.length > 0 && (intent.wantsReview || intent.wantsMethod || intent.wantsSkill)) {
    const methodDrafts = draftCandidates.filter((item) => item.type === "method").length;
    const skillDrafts = draftCandidates.filter((item) => item.type === "skill").length;
    lines.push(`当前已有 draft candidates：method ${methodDrafts} / skill ${skillDrafts}；若要继续治理，优先用 \`experience_candidate_list\` 查看而不是重复生成。`);
    signalKinds.add("candidate");
  }

  const recentTaskLimit = Math.max(1, input.recentTaskLimit ?? 6);
  const methodTask = findRecentPromotionTarget({
    manager: input.manager,
    agentId,
    type: "method",
    limit: recentTaskLimit,
  });
  if (methodTask && (intent.wantsMethod || intent.wantsReview)) {
    lines.push(`近期任务 ${formatTaskReference(methodTask)} 已具备方法沉淀信号；若当前执行验证了其可复用步骤，可用 \`task_promote_method\` 为该 task 生成 method candidate。`);
    signalKinds.add("method");
  }

  const skillTask = findRecentPromotionTarget({
    manager: input.manager,
    agentId,
    type: "skill",
    limit: recentTaskLimit,
  });
  if (skillTask && (intent.wantsSkill || intent.wantsReview)) {
    lines.push(`近期任务 ${formatTaskReference(skillTask)} 已具备 skill draft 信号；若本轮明确暴露出稳定能力缺口或流程模板，可用 \`task_promote_skill_draft\` 为该 task 生成 skill candidate。`);
    signalKinds.add("skill");
  }

  if (goalReview && hasGoalReviewPressure && (goalSession || intent.wantsReview)) {
    lines.push(`当前 goal review 队列：pending ${goalReview.pendingReviewCount} / needs_revision ${goalReview.needsRevisionCount}；需要收口时优先用 \`goal_suggestion_review_list\` 或 \`goal_review_governance_summary\` 查看。`);
    signalKinds.add("review");
  }

  if (lines.length <= 0 && intent.hasExplicitLearningReviewIntent && learningReviewInput.nudges.length > 0) {
    lines.push(...learningReviewInput.nudges.slice(0, 1));
    signalKinds.add("generic");
  }
  if (lines.length <= 0) {
    return undefined;
  }

  const block = `<learning-review-nudge hint="以下提示仅用于帮助你在执行中顺手完成记忆/经验/审阅收口；只有证据充分时才执行，不要为了补记录而制造无效 candidate。">\n${lines.map((line) => `- ${line}`).join("\n")}\n</learning-review-nudge>`;
  const triggerSources: LearningReviewNudgeTriggerSource[] = [];
  if (intent.hasExplicitLearningReviewIntent) {
    triggerSources.push("explicit_user_intent");
  }
  if (hasGoalReviewPressure) {
    triggerSources.push("goal_review_pressure");
  }
  return {
    prependContext: block,
    deltas: [
      createLearningReviewDelta({
        text: block,
        lineCount: lines.length,
        metadata: {
          agentId,
          memorySignalCount: learningReviewInput.summary.memorySignalCount,
          taskSignalCount: learningReviewInput.summary.taskSignalCount,
          candidateSignalCount: learningReviewInput.summary.candidateSignalCount,
          reviewSignalCount: learningReviewInput.summary.reviewSignalCount,
          sessionKind: goalSession?.kind ?? "main",
          triggerSources,
          signalKinds: [...signalKinds],
          hasExplicitLearningReviewIntent: intent.hasExplicitLearningReviewIntent,
          hasGoalReviewPressure,
        },
      }),
    ],
  };
}
