import path from "node:path";

import type {
  ExperienceCandidate,
  ExperienceUsage,
  ExperienceUsageStats,
  TaskRecord,
} from "@belldandy/memory";

import {
  findSkillFreshnessManualMark,
  readSkillFreshnessState,
  type SkillFreshnessManualMark,
} from "./skill-freshness-state.js";

type SkillFreshnessManager = {
  listExperienceCandidates: (limit?: number, filter?: any) => ExperienceCandidate[];
  listExperienceUsages: (limit?: number, filter?: any) => ExperienceUsage[];
  getTask: (taskId: string) => TaskRecord | null;
};

export type SkillFreshnessStatus = "healthy" | "warn_stale" | "needs_patch" | "needs_new_skill";
export type SkillFreshnessKind = "accepted_skill" | "candidate_gap" | "usage_skill";
export type SkillFreshnessSignalCode =
  | "manual_stale"
  | "recent_failures"
  | "high_usage_low_success"
  | "pending_update_candidate"
  | "pending_new_skill_candidate";
export type SkillFreshnessSuggestionKind =
  | "monitor"
  | "review_stale_skill"
  | "review_patch_candidate"
  | "review_new_skill_candidate";

export interface SkillFreshnessSignal {
  code: SkillFreshnessSignalCode;
  severity: "info" | "warn";
  summary: string;
}

export interface SkillFreshnessSuggestion {
  kind: SkillFreshnessSuggestionKind;
  summary: string;
  candidateId?: string;
}

export interface SkillFreshnessUsageSummary {
  usageCount: number;
  successCount: number;
  partialCount: number;
  failedCount: number;
  unresolvedCount: number;
  successRate: number;
  lastUsedAt?: string;
  lastUsedTaskId?: string;
}

export interface SkillFreshnessAssessment {
  kind: SkillFreshnessKind;
  status: SkillFreshnessStatus;
  skillKey: string;
  displayName: string;
  sourceCandidateId?: string;
  pendingCandidateId?: string;
  headline: string;
  summary: string;
  signals: SkillFreshnessSignal[];
  suggestion: SkillFreshnessSuggestion;
  usage?: SkillFreshnessUsageSummary;
  manualStaleMark?: SkillFreshnessManualMark;
}

export interface SkillFreshnessSummary {
  available: boolean;
  total: number;
  healthyCount: number;
  warnCount: number;
  needsPatchCount: number;
  needsNewSkillCount: number;
  headline: string;
  topItems: SkillFreshnessAssessment[];
}

export interface SkillFreshnessSnapshot {
  summary: SkillFreshnessSummary;
  items: SkillFreshnessAssessment[];
  bySourceCandidateId: Record<string, SkillFreshnessAssessment>;
  byPendingCandidateId: Record<string, SkillFreshnessAssessment>;
  bySkillKey: Record<string, SkillFreshnessAssessment>;
}

const MAX_SKILL_CANDIDATES = 500;
const MAX_SKILL_USAGES = 2000;
const RECENT_USAGE_WINDOW = 6;
const RECENT_FAILURE_THRESHOLD = 2;
const HIGH_USAGE_THRESHOLD = 4;
const LOW_SUCCESS_RATE_THRESHOLD = 0.5;

function normalizeSkillKey(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function normalizeOptionalString(value: unknown): string | undefined {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || undefined;
}

function parseSkillNameFromContent(content: string | undefined): string | undefined {
  const match = String(content ?? "").match(/(?:^|\n)name:\s*["']?([^"\n']+)["']?/i);
  const candidate = match?.[1]?.trim();
  return candidate || undefined;
}

function getSkillIdentity(candidate: ExperienceCandidate): { skillKey: string; displayName: string; aliases: string[] } {
  const parsedName = parseSkillNameFromContent(candidate.content);
  const displayName = parsedName
    || normalizeOptionalString(candidate.title)
    || normalizeOptionalString(candidate.slug)
    || normalizeOptionalString(candidate.publishedPath ? path.basename(path.dirname(candidate.publishedPath)) : undefined)
    || candidate.id;
  const aliases = [
    parsedName,
    normalizeOptionalString(candidate.title),
    normalizeOptionalString(candidate.slug),
    normalizeOptionalString(candidate.publishedPath ? path.basename(path.dirname(candidate.publishedPath)) : undefined),
  ].filter((item): item is string => Boolean(item));
  return {
    skillKey: normalizeSkillKey(displayName),
    displayName,
    aliases,
  };
}

function isUsageFailureStatus(status: TaskRecord["status"] | undefined): boolean {
  return status === "failed" || status === "partial";
}

function toUsageSummary(usages: ExperienceUsage[], manager: SkillFreshnessManager): SkillFreshnessUsageSummary | undefined {
  if (!usages.length) return undefined;

  let successCount = 0;
  let partialCount = 0;
  let failedCount = 0;
  let unresolvedCount = 0;

  for (const usage of usages) {
    const task = manager.getTask(usage.taskId);
    if (!task?.status) {
      unresolvedCount += 1;
      continue;
    }
    if (task.status === "success") {
      successCount += 1;
      continue;
    }
    if (task.status === "partial") {
      partialCount += 1;
      continue;
    }
    if (task.status === "failed") {
      failedCount += 1;
      continue;
    }
    unresolvedCount += 1;
  }

  const resolvedCount = successCount + partialCount + failedCount;
  const successRate = resolvedCount > 0 ? successCount / resolvedCount : 0;
  const latestUsage = [...usages].sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))[0];
  return {
    usageCount: usages.length,
    successCount,
    partialCount,
    failedCount,
    unresolvedCount,
    successRate,
    lastUsedAt: latestUsage?.createdAt,
    lastUsedTaskId: latestUsage?.taskId,
  };
}

function buildHeadline(status: SkillFreshnessStatus, displayName: string): string {
  switch (status) {
    case "needs_patch":
      return `${displayName} 需要补丁或修订`;
    case "needs_new_skill":
      return `${displayName} 对应的新 skill 建议已出现`;
    case "warn_stale":
      return `${displayName} 出现快过期信号`;
    default:
      return `${displayName} 当前状态稳定`;
  }
}

function buildSummary(status: SkillFreshnessStatus, signals: SkillFreshnessSignal[], usage?: SkillFreshnessUsageSummary): string {
  if (signals.length > 0) {
    return signals[0].summary;
  }
  if (usage && usage.usageCount > 0) {
    return `累计使用 ${usage.usageCount} 次，当前未出现明显 stale/gap 信号`;
  }
  if (status === "needs_new_skill") {
    return "近期经验已反复指向一个新的 skill 缺口";
  }
  return "当前未观察到需要处理的 freshness 风险";
}

function compareAssessmentSeverity(left: SkillFreshnessAssessment, right: SkillFreshnessAssessment): number {
  const rank = (value: SkillFreshnessStatus): number => {
    switch (value) {
      case "needs_new_skill":
        return 3;
      case "needs_patch":
        return 2;
      case "warn_stale":
        return 1;
      default:
        return 0;
    }
  };
  return rank(right.status) - rank(left.status)
    || (right.usage?.usageCount ?? 0) - (left.usage?.usageCount ?? 0)
    || String(left.displayName).localeCompare(String(right.displayName));
}

function buildSummaryView(items: SkillFreshnessAssessment[]): SkillFreshnessSummary {
  const healthyCount = items.filter((item) => item.status === "healthy").length;
  const warnCount = items.filter((item) => item.status === "warn_stale").length;
  const needsPatchCount = items.filter((item) => item.status === "needs_patch").length;
  const needsNewSkillCount = items.filter((item) => item.status === "needs_new_skill").length;
  const total = items.length;
  const headline = total > 0
    ? `healthy ${healthyCount} / warn ${warnCount} / patch ${needsPatchCount} / new ${needsNewSkillCount}`
    : "暂无 skill freshness 信号";
  return {
    available: total > 0,
    total,
    healthyCount,
    warnCount,
    needsPatchCount,
    needsNewSkillCount,
    headline,
    topItems: [...items].sort(compareAssessmentSeverity).slice(0, 5),
  };
}

function matchAcceptedCandidates(
  acceptedByAlias: Map<string, ExperienceCandidate>,
  pendingCandidate: ExperienceCandidate,
): ExperienceCandidate | undefined {
  const identity = getSkillIdentity(pendingCandidate);
  return identity.aliases
    .map((alias) => acceptedByAlias.get(normalizeSkillKey(alias)))
    .find((item): item is ExperienceCandidate => Boolean(item))
    ?? acceptedByAlias.get(identity.skillKey);
}

function gatherUsageTasks(usages: ExperienceUsage[], manager: SkillFreshnessManager): {
  recentFailureCount: number;
  usageSummary?: SkillFreshnessUsageSummary;
} {
  const usageSummary = toUsageSummary(usages, manager);
  const recentUsages = [...usages]
    .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
    .slice(0, RECENT_USAGE_WINDOW);
  const recentFailureCount = recentUsages.reduce((count, usage) => {
    const task = manager.getTask(usage.taskId);
    return count + (isUsageFailureStatus(task?.status) ? 1 : 0);
  }, 0);
  return {
    recentFailureCount,
    usageSummary,
  };
}

function finalizeAcceptedAssessment(input: {
  candidate: ExperienceCandidate;
  usages: ExperienceUsage[];
  usageSummary?: SkillFreshnessUsageSummary;
  recentFailureCount: number;
  manualMark?: SkillFreshnessManualMark;
  patchCandidates: ExperienceCandidate[];
}): SkillFreshnessAssessment {
  const signals: SkillFreshnessSignal[] = [];
  if (input.manualMark) {
    signals.push({
      code: "manual_stale",
      severity: "warn",
      summary: input.manualMark.reason
        ? `已人工标记为需复查：${input.manualMark.reason}`
        : "已人工标记为需复查",
    });
  }

  if (input.recentFailureCount >= RECENT_FAILURE_THRESHOLD) {
    signals.push({
      code: "recent_failures",
      severity: "warn",
      summary: `最近 ${Math.min(input.usages.length, RECENT_USAGE_WINDOW)} 次使用里有 ${input.recentFailureCount} 次失败或部分失败`,
    });
  }

  if (
    input.usageSummary
    && input.usageSummary.usageCount >= HIGH_USAGE_THRESHOLD
    && input.usageSummary.successRate < LOW_SUCCESS_RATE_THRESHOLD
  ) {
    signals.push({
      code: "high_usage_low_success",
      severity: "warn",
      summary: `累计使用 ${input.usageSummary.usageCount} 次，但成功率只有 ${(input.usageSummary.successRate * 100).toFixed(0)}%`,
    });
  }

  let status: SkillFreshnessStatus = "healthy";
  let suggestion: SkillFreshnessSuggestion = {
    kind: "monitor",
    summary: "当前无需动作，继续观察真实使用信号",
  };

  if (input.patchCandidates.length > 0) {
    const firstPatchCandidate = input.patchCandidates[0];
    status = "needs_patch";
    signals.unshift({
      code: "pending_update_candidate",
      severity: "warn",
      summary: input.patchCandidates.length === 1
        ? "已出现 1 个待审 skill candidate，疑似用于修补当前 skill"
        : `已出现 ${input.patchCandidates.length} 个待审 skill candidate，疑似用于修补当前 skill`,
    });
    suggestion = {
      kind: "review_patch_candidate",
      summary: `优先审阅 patch candidate：${firstPatchCandidate.title || firstPatchCandidate.id}`,
      candidateId: firstPatchCandidate.id,
    };
  } else if (signals.length > 0) {
    status = "warn_stale";
    suggestion = {
      kind: "review_stale_skill",
      summary: "建议复查该 skill 的适用性、说明与边界是否仍然成立",
    };
  }

  const identity = getSkillIdentity(input.candidate);
  return {
    kind: "accepted_skill",
    status,
    skillKey: identity.skillKey,
    displayName: identity.displayName,
    sourceCandidateId: input.candidate.id,
    headline: buildHeadline(status, identity.displayName),
    summary: buildSummary(status, signals, input.usageSummary),
    signals,
    suggestion,
    ...(input.usageSummary ? { usage: input.usageSummary } : {}),
    ...(input.manualMark ? { manualStaleMark: input.manualMark } : {}),
  };
}

function finalizeUsageOnlyAssessment(input: {
  skillKey: string;
  displayName: string;
  usages: ExperienceUsage[];
  usageSummary?: SkillFreshnessUsageSummary;
  recentFailureCount: number;
  manualMark?: SkillFreshnessManualMark;
}): SkillFreshnessAssessment | undefined {
  const signals: SkillFreshnessSignal[] = [];
  if (input.manualMark) {
    signals.push({
      code: "manual_stale",
      severity: "warn",
      summary: input.manualMark.reason
        ? `已人工标记为需复查：${input.manualMark.reason}`
        : "已人工标记为需复查",
    });
  }

  if (input.recentFailureCount >= RECENT_FAILURE_THRESHOLD) {
    signals.push({
      code: "recent_failures",
      severity: "warn",
      summary: `最近 ${Math.min(input.usages.length, RECENT_USAGE_WINDOW)} 次使用里有 ${input.recentFailureCount} 次失败或部分失败`,
    });
  }

  if (
    input.usageSummary
    && input.usageSummary.usageCount >= HIGH_USAGE_THRESHOLD
    && input.usageSummary.successRate < LOW_SUCCESS_RATE_THRESHOLD
  ) {
    signals.push({
      code: "high_usage_low_success",
      severity: "warn",
      summary: `累计使用 ${input.usageSummary.usageCount} 次，但成功率只有 ${(input.usageSummary.successRate * 100).toFixed(0)}%`,
    });
  }

  if (!signals.length) {
    return undefined;
  }

  return {
    kind: "usage_skill",
    status: "warn_stale",
    skillKey: input.skillKey,
    displayName: input.displayName,
    headline: buildHeadline("warn_stale", input.displayName),
    summary: buildSummary("warn_stale", signals, input.usageSummary),
    signals,
    suggestion: {
      kind: "review_stale_skill",
      summary: "建议复查该 skill 的适用性、说明与边界是否仍然成立",
    },
    ...(input.usageSummary ? { usage: input.usageSummary } : {}),
    ...(input.manualMark ? { manualStaleMark: input.manualMark } : {}),
  };
}

function buildPendingGapAssessment(
  pendingCandidate: ExperienceCandidate,
  matchedAcceptedCandidate: ExperienceCandidate | undefined,
): SkillFreshnessAssessment {
  const identity = getSkillIdentity(pendingCandidate);
  const status: SkillFreshnessStatus = matchedAcceptedCandidate ? "needs_patch" : "needs_new_skill";
  const signal: SkillFreshnessSignal = matchedAcceptedCandidate
    ? {
      code: "pending_update_candidate",
      severity: "warn",
      summary: "经验层已出现待审 skill candidate，建议作为现有 skill 的 patch 入口处理",
    }
    : {
      code: "pending_new_skill_candidate",
      severity: "warn",
      summary: "经验层已出现待审 skill candidate，说明这里正在形成新的 skill 缺口",
    };
  return {
    kind: "candidate_gap",
    status,
    skillKey: identity.skillKey,
    displayName: identity.displayName,
    pendingCandidateId: pendingCandidate.id,
    ...(matchedAcceptedCandidate ? { sourceCandidateId: matchedAcceptedCandidate.id } : {}),
    headline: buildHeadline(status, identity.displayName),
    summary: signal.summary,
    signals: [signal],
    suggestion: matchedAcceptedCandidate
      ? {
        kind: "review_patch_candidate",
        summary: `优先审阅 patch candidate：${pendingCandidate.title || pendingCandidate.id}`,
        candidateId: pendingCandidate.id,
      }
      : {
        kind: "review_new_skill_candidate",
        summary: `优先审阅 new skill candidate：${pendingCandidate.title || pendingCandidate.id}`,
        candidateId: pendingCandidate.id,
      },
  };
}

export async function buildSkillFreshnessSnapshot(input: {
  manager: SkillFreshnessManager | null | undefined;
  stateDir: string;
}): Promise<SkillFreshnessSnapshot> {
  const manager = input.manager;
  if (!manager) {
    return {
      summary: {
        available: false,
        total: 0,
        healthyCount: 0,
        warnCount: 0,
        needsPatchCount: 0,
        needsNewSkillCount: 0,
        headline: "Memory manager is not available",
        topItems: [],
      },
      items: [],
      bySourceCandidateId: {},
      byPendingCandidateId: {},
      bySkillKey: {},
    };
  }

  const state = await readSkillFreshnessState(input.stateDir);
  const acceptedCandidates = manager.listExperienceCandidates(MAX_SKILL_CANDIDATES, {
    type: "skill",
    status: "accepted",
  });
  const pendingCandidates = manager.listExperienceCandidates(MAX_SKILL_CANDIDATES, {
    type: "skill",
    status: ["draft", "reviewed"],
  });

  const acceptedByAlias = new Map<string, ExperienceCandidate>();
  for (const candidate of acceptedCandidates) {
    const identity = getSkillIdentity(candidate);
    acceptedByAlias.set(identity.skillKey, candidate);
    for (const alias of identity.aliases) {
      acceptedByAlias.set(normalizeSkillKey(alias), candidate);
    }
  }

  const patchCandidatesByAcceptedId = new Map<string, ExperienceCandidate[]>();
  const pendingAssessments: SkillFreshnessAssessment[] = [];
  for (const pendingCandidate of pendingCandidates) {
    const matchedAcceptedCandidate = matchAcceptedCandidates(acceptedByAlias, pendingCandidate);
    if (matchedAcceptedCandidate?.id) {
      if (!patchCandidatesByAcceptedId.has(matchedAcceptedCandidate.id)) {
        patchCandidatesByAcceptedId.set(matchedAcceptedCandidate.id, []);
      }
      patchCandidatesByAcceptedId.get(matchedAcceptedCandidate.id)?.push(pendingCandidate);
    }
    pendingAssessments.push(buildPendingGapAssessment(pendingCandidate, matchedAcceptedCandidate));
  }

  const acceptedAssessments = acceptedCandidates.map((candidate) => {
    const identity = getSkillIdentity(candidate);
    const usages = manager.listExperienceUsages(MAX_SKILL_USAGES, {
      assetType: "skill",
      sourceCandidateId: candidate.id,
    });
    const usageByName = identity.skillKey
      ? manager.listExperienceUsages(MAX_SKILL_USAGES, {
        assetType: "skill",
        assetKey: identity.displayName,
      })
      : [];
    const usageMap = new Map<string, ExperienceUsage>();
    for (const usage of [...usages, ...usageByName]) {
      usageMap.set(usage.id, usage);
    }
    const dedupedUsages = [...usageMap.values()];
    const { recentFailureCount, usageSummary } = gatherUsageTasks(dedupedUsages, manager);
    return finalizeAcceptedAssessment({
      candidate,
      usages: dedupedUsages,
      recentFailureCount,
      usageSummary,
      manualMark: findSkillFreshnessManualMark(state, {
        sourceCandidateId: candidate.id,
        skillKey: identity.skillKey,
      }),
      patchCandidates: patchCandidatesByAcceptedId.get(candidate.id) ?? [],
    });
  });

  const takenSkillKeys = new Set<string>();
  for (const item of [...acceptedAssessments, ...pendingAssessments]) {
    if (item.skillKey) {
      takenSkillKeys.add(item.skillKey);
    }
  }

  const usageOnlyAssessments: SkillFreshnessAssessment[] = [];
  const standaloneSkillUsages = manager.listExperienceUsages(MAX_SKILL_USAGES, {
    assetType: "skill",
  });
  const usageGroups = new Map<string, { displayName: string; usages: ExperienceUsage[] }>();
  for (const usage of standaloneSkillUsages) {
    const skillKey = normalizeSkillKey(usage.assetKey);
    if (!skillKey || takenSkillKeys.has(skillKey)) {
      continue;
    }
    const existing = usageGroups.get(skillKey);
    if (existing) {
      existing.usages.push(usage);
      continue;
    }
    usageGroups.set(skillKey, {
      displayName: normalizeOptionalString(usage.assetKey) ?? skillKey,
      usages: [usage],
    });
  }
  for (const [skillKey, group] of usageGroups.entries()) {
    const { recentFailureCount, usageSummary } = gatherUsageTasks(group.usages, manager);
    const assessment = finalizeUsageOnlyAssessment({
      skillKey,
      displayName: group.displayName,
      usages: group.usages,
      usageSummary,
      recentFailureCount,
      manualMark: findSkillFreshnessManualMark(state, {
        skillKey,
      }),
    });
    if (!assessment) {
      continue;
    }
    usageOnlyAssessments.push(assessment);
    takenSkillKeys.add(skillKey);
  }

  const items = [...acceptedAssessments, ...pendingAssessments, ...usageOnlyAssessments].sort(compareAssessmentSeverity);
  const bySourceCandidateId = new Map<string, SkillFreshnessAssessment>();
  const byPendingCandidateId = new Map<string, SkillFreshnessAssessment>();
  const bySkillKey = new Map<string, SkillFreshnessAssessment>();

  for (const item of items) {
    if (item.sourceCandidateId && !bySourceCandidateId.has(item.sourceCandidateId)) {
      bySourceCandidateId.set(item.sourceCandidateId, item);
    }
    if (item.pendingCandidateId && !byPendingCandidateId.has(item.pendingCandidateId)) {
      byPendingCandidateId.set(item.pendingCandidateId, item);
    }
    if (item.skillKey && !bySkillKey.has(item.skillKey)) {
      bySkillKey.set(item.skillKey, item);
    }
  }

  return {
    summary: buildSummaryView(items),
    items,
    bySourceCandidateId: Object.fromEntries(bySourceCandidateId.entries()),
    byPendingCandidateId: Object.fromEntries(byPendingCandidateId.entries()),
    bySkillKey: Object.fromEntries(bySkillKey.entries()),
  };
}

export function findSkillFreshnessForCandidate(
  snapshot: SkillFreshnessSnapshot | null | undefined,
  candidate: ExperienceCandidate | null | undefined,
): SkillFreshnessAssessment | undefined {
  if (!snapshot || !candidate || candidate.type !== "skill") {
    return undefined;
  }
  if (candidate.status === "accepted" && candidate.id) {
    return snapshot.bySourceCandidateId[candidate.id];
  }
  return snapshot.byPendingCandidateId[candidate.id] ?? snapshot.bySkillKey[getSkillIdentity(candidate).skillKey];
}

export function findSkillFreshnessForUsage(
  snapshot: SkillFreshnessSnapshot | null | undefined,
  item: Pick<ExperienceUsage, "assetType" | "assetKey" | "sourceCandidateId">
    | Pick<ExperienceUsageStats, "assetType" | "assetKey" | "sourceCandidateId">
    | null
    | undefined,
): SkillFreshnessAssessment | undefined {
  if (!snapshot || !item || item.assetType !== "skill") {
    return undefined;
  }
  if (item.sourceCandidateId && snapshot.bySourceCandidateId[item.sourceCandidateId]) {
    return snapshot.bySourceCandidateId[item.sourceCandidateId];
  }
  return snapshot.bySkillKey[normalizeSkillKey(item.assetKey)];
}
