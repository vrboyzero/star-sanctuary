import fs from "node:fs/promises";
import path from "node:path";

import type {
  ExperienceUsageSummary,
  TaskExperienceDetail,
} from "./experience-types.js";
import {
  createTaskWorkSurface,
} from "./task-work-surface.js";
import type {
  DreamConversationArtifactFileOptions,
  DreamDurableMemoryItem,
  DreamInputBuildOptions,
  DreamInputSnapshot,
  DreamSessionDigest,
  DreamSessionMemory,
  DreamWorkItem,
} from "./dream-types.js";
import type { MemorySearchResult, MemorySearchScope, MemoryType, MemoryVisibility } from "./types.js";
import type { TaskStatus } from "./task-types.js";

const INVALID_CONVERSATION_FILENAME_CHARS = /[<>:"/\\|?*\u0000-\u001F%]/g;
const TRAILING_CONVERSATION_FILENAME_CHARS = /[. ]+$/;
const RESERVED_WINDOWS_BASENAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

function encodeConversationChar(char: string): string {
  const codePoint = char.codePointAt(0);
  if (typeof codePoint !== "number") return "_";
  return `%${codePoint.toString(16).toUpperCase().padStart(2, "0")}`;
}

function toSafeConversationFileId(id: string): string {
  let safeId = id.replace(INVALID_CONVERSATION_FILENAME_CHARS, encodeConversationChar);
  safeId = safeId.replace(TRAILING_CONVERSATION_FILENAME_CHARS, (match) => Array.from(match).map(encodeConversationChar).join(""));
  if (!safeId) safeId = "_";
  const windowsBasename = safeId.split(".")[0] ?? safeId;
  if (RESERVED_WINDOWS_BASENAME.test(windowsBasename)) {
    safeId = `_${safeId}`;
  }
  return safeId;
}

function normalizeText(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function normalizeCursorValue(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function normalizeDate(input?: Date | number | string): Date {
  if (input instanceof Date && Number.isFinite(input.getTime())) return new Date(input.getTime());
  if (typeof input === "number" && Number.isFinite(input)) return new Date(input);
  if (typeof input === "string") {
    const parsed = Date.parse(input);
    if (Number.isFinite(parsed)) return new Date(parsed);
  }
  return new Date();
}

function toIso(value: string | number | Date): string {
  return normalizeDate(value).toISOString();
}

function toDateOnlyUtc(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function isWithinWindow(value: string | number | undefined, sinceMs: number): boolean {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value >= sinceMs;
  }
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed >= sinceMs : true;
  }
  return true;
}

function compareByLatestTimestamp(
  left: { updatedAt?: string; finishedAt?: string; startedAt?: string },
  right: { updatedAt?: string; finishedAt?: string; startedAt?: string },
): number {
  return readLatestTimestamp(right) - readLatestTimestamp(left);
}

function readLatestTimestamp(value: { updatedAt?: string; finishedAt?: string; startedAt?: string }): number {
  for (const candidate of [value.updatedAt, value.finishedAt, value.startedAt]) {
    if (typeof candidate !== "string") continue;
    const parsed = Date.parse(candidate);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function toStatusBucket(status: string | undefined): TaskStatus {
  switch (status) {
    case "running":
    case "failed":
    case "partial":
      return status;
    default:
      return "success";
  }
}

function normalizeDreamWorkItem(task: TaskExperienceDetail): DreamWorkItem {
  return {
    taskId: task.id,
    conversationId: task.conversationId,
    title: task.title,
    objective: task.objective,
    summary: task.summary,
    status: toStatusBucket(task.status),
    source: task.source,
    startedAt: task.startedAt,
    finishedAt: task.finishedAt,
    updatedAt: task.updatedAt,
    agentId: task.agentId,
    toolNames: (task.toolCalls ?? []).map((item) => item.toolName).filter((item): item is string => Boolean(item)),
    artifactPaths: [...(task.artifactPaths ?? [])],
    recentActivityTitles: (task.activities ?? [])
      .slice()
      .reverse()
      .filter((item) => item.kind !== "task_completed")
      .map((item) => item.title || item.summary || "")
      .filter((item) => Boolean(item))
      .slice(0, 3),
    workRecap: task.workRecap,
    resumeContext: task.resumeContext,
  };
}

function normalizeDurableMemoryItem(item: MemorySearchResult): DreamDurableMemoryItem {
  return {
    id: item.id,
    sourcePath: item.sourcePath,
    sourceType: item.sourceType,
    memoryType: item.memoryType,
    category: item.category,
    visibility: item.visibility,
    content: item.content,
    snippet: item.snippet,
    summary: item.summary,
    updatedAt: item.updatedAt,
    metadata: item.metadata as Record<string, unknown> | undefined,
  };
}

function dedupeTasks(tasks: TaskExperienceDetail[]): TaskExperienceDetail[] {
  const result: TaskExperienceDetail[] = [];
  const seen = new Set<string>();
  for (const task of tasks) {
    if (!task?.id || seen.has(task.id)) continue;
    seen.add(task.id);
    result.push(task);
  }
  return result;
}

function dedupeWorkItems(items: DreamWorkItem[]): DreamWorkItem[] {
  const result: DreamWorkItem[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    if (!item?.taskId || seen.has(item.taskId)) continue;
    seen.add(item.taskId);
    result.push(item);
  }
  return result;
}

function dedupeUsages(items: ExperienceUsageSummary[]): ExperienceUsageSummary[] {
  const result: ExperienceUsageSummary[] = [];
  const seen = new Set<string>();
  for (const item of items) {
    const key = item.usageId || `${item.assetType}:${item.assetKey}:${item.taskId}`;
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

async function readJsonFile<T>(filePath: string): Promise<T | undefined> {
  try {
    const raw = await fs.readFile(filePath, "utf-8");
    return JSON.parse(raw) as T;
  } catch {
    return undefined;
  }
}

export function buildDreamConversationArtifactPath(options: DreamConversationArtifactFileOptions): string {
  return path.join(options.sessionsDir, `${toSafeConversationFileId(options.conversationId)}${options.suffix}`);
}

export async function readDreamSessionDigestFile(input: {
  sessionsDir: string;
  conversationId: string;
}): Promise<DreamSessionDigest | undefined> {
  return readJsonFile<DreamSessionDigest>(buildDreamConversationArtifactPath({
    sessionsDir: input.sessionsDir,
    conversationId: input.conversationId,
    suffix: ".digest.json",
  }));
}

export async function readDreamSessionMemoryFile(input: {
  sessionsDir: string;
  conversationId: string;
}): Promise<DreamSessionMemory | undefined> {
  return readJsonFile<DreamSessionMemory>(buildDreamConversationArtifactPath({
    sessionsDir: input.sessionsDir,
    conversationId: input.conversationId,
    suffix: ".session-memory.json",
  }));
}

function summarizeVisibility(items: DreamDurableMemoryItem[], visibility: MemoryVisibility): number {
  return items.filter((item) => item.visibility === visibility).length;
}

export async function buildDreamInputSnapshot(input: DreamInputBuildOptions): Promise<DreamInputSnapshot> {
  const agentId = normalizeText(input.agentId) ?? "default";
  const conversationId = normalizeText(input.conversationId);
  const now = normalizeDate(input.now);
  const windowHours = Math.max(1, Math.floor(input.inputWindowHours ?? 72));
  const recentTaskLimit = Math.max(1, Math.floor(input.recentTaskLimit ?? 8));
  const recentWorkLimit = Math.max(1, Math.floor(input.recentWorkLimit ?? 6));
  const recentMemoryLimit = Math.max(1, Math.floor(input.recentMemoryLimit ?? 12));
  const windowStartedAt = new Date(now.getTime() - (windowHours * 60 * 60 * 1000));
  const windowStartedAtIso = windowStartedAt.toISOString();
  const taskFilter = { agentId };
  const memoryFilter = {
    agentId,
    scope: "all" as MemorySearchScope,
    memoryType: ["core", "daily"] as MemoryType[],
    dateFrom: toDateOnlyUtc(windowStartedAt),
  };

  const [mindProfileSnapshot, sessionDigest, sessionMemory, taskChangeSeq, memoryChangeSeq] = await Promise.all([
    input.buildMindProfileSnapshot?.({
      agentId,
      conversationId,
      stateDir: input.stateDir,
      now,
    }),
    conversationId
      ? input.getSessionDigest
        ? input.getSessionDigest(conversationId)
        : input.sessionsDir
          ? readDreamSessionDigestFile({
              sessionsDir: input.sessionsDir,
              conversationId,
            })
          : undefined
      : undefined,
    conversationId
      ? input.getSessionMemory
        ? input.getSessionMemory(conversationId)
        : input.sessionsDir
          ? readDreamSessionMemoryFile({
              sessionsDir: input.sessionsDir,
              conversationId,
            })
          : undefined
      : undefined,
    input.getTaskChangeSeq?.(),
    input.getMemoryChangeSeq?.(),
  ]);

  const recentTaskCandidates = input.memoryManager.getRecentTasks(Math.max(recentTaskLimit * 4, 24), taskFilter);
  const recentTasks = dedupeTasks(
    recentTaskCandidates
      .filter((item) => isWithinWindow(item.updatedAt, windowStartedAt.getTime()))
      .map((item) => input.memoryManager.getTaskDetail(item.id))
      .filter((item): item is TaskExperienceDetail => Boolean(item))
      .sort(compareByLatestTimestamp)
      .slice(0, recentTaskLimit),
  );

  const focusTask = conversationId
    ? (() => {
        const direct = input.memoryManager.getTaskByConversation?.(conversationId);
        if (!direct?.id) return recentTasks[0];
        return input.memoryManager.getTaskDetail(direct.id) ?? recentTasks[0];
      })()
    : recentTasks[0];

  const surface = createTaskWorkSurface({
    getRecentWork: input.memoryManager.getRecentWork
      ? (params) => input.memoryManager.getRecentWork!(params)
      : undefined,
    getTaskDetail: (taskId) => input.memoryManager.getTaskDetail(taskId),
  });

  const recentWorkItems = dedupeWorkItems(
    (
      input.memoryManager.getRecentWork
        ? input.memoryManager.getRecentWork({
            limit: Math.max(recentWorkLimit * 4, 20),
            filter: taskFilter,
          }) ?? []
        : recentTasks.map((task) => normalizeDreamWorkItem(task))
    )
      .filter((item) => isWithinWindow(item.updatedAt, windowStartedAt.getTime()))
      .sort(compareByLatestTimestamp)
      .slice(0, recentWorkLimit)
      .map((item) => ({
        ...item,
        sourceExplanation: surface.explainSources({ item }) ?? null,
      })),
  );

  const recentDurableMemories = input.memoryManager
    .getRecent(Math.max(recentMemoryLimit * 4, 24), memoryFilter, true)
    .filter((item) => item.memoryType === "core" || item.memoryType === "daily")
    .filter((item) => isWithinWindow(item.updatedAt, windowStartedAt.getTime()))
    .slice(0, recentMemoryLimit)
    .map((item) => normalizeDurableMemoryItem(item));

  const recentExperienceUsages = dedupeUsages(
    recentTasks.flatMap((task) => [
      ...(task.usedMethods ?? []),
      ...(task.usedSkills ?? []),
    ]),
  ).slice(0, Math.max(recentTaskLimit * 2, 12));

  const learningReviewInput = input.buildLearningReviewInput
    ? await input.buildLearningReviewInput({
        agentId,
        conversationId,
        stateDir: input.stateDir,
        now,
        mindProfileSnapshot: mindProfileSnapshot ?? undefined,
        focusTask,
        recentTasks,
        recentWorkItems,
        recentDurableMemories,
        recentExperienceUsages,
      })
    : undefined;

  const sourceCounts = {
    recentTaskCount: recentTasks.length,
    recentWorkCount: recentWorkItems.length,
    recentWorkRecapCount: recentWorkItems.filter((item) => Boolean(item.workRecap)).length,
    recentResumeContextCount: recentWorkItems.filter((item) => Boolean(item.resumeContext)).length,
    recentDurableMemoryCount: recentDurableMemories.length,
    recentPrivateMemoryCount: summarizeVisibility(recentDurableMemories, "private"),
    recentSharedMemoryCount: summarizeVisibility(recentDurableMemories, "shared"),
    recentExperienceUsageCount: recentExperienceUsages.length,
    sessionDigestAvailable: Boolean(sessionDigest && (sessionDigest.rollingSummary || sessionDigest.archivalSummary || sessionDigest.pendingMessageCount !== undefined)),
    sessionMemoryAvailable: Boolean(sessionMemory && (sessionMemory.summary || sessionMemory.currentWork || sessionMemory.nextStep)),
    mindProfileAvailable: Boolean(mindProfileSnapshot?.summary?.available || mindProfileSnapshot?.profile?.headline),
    learningReviewAvailable: Boolean(learningReviewInput?.summary?.available || (learningReviewInput?.summaryLines?.length ?? 0) > 0 || (learningReviewInput?.nudges?.length ?? 0) > 0),
  };
  const changeCursor = {
    digestGeneration: normalizeCursorValue(sessionDigest?.digestGeneration),
    sessionMemoryMessageCount: normalizeCursorValue(sessionMemory?.lastSummarizedMessageCount),
    sessionMemoryToolCursor: normalizeCursorValue(sessionMemory?.lastSummarizedToolCursor),
    taskChangeSeq: normalizeCursorValue(taskChangeSeq),
    memoryChangeSeq: normalizeCursorValue(memoryChangeSeq),
  };

  return {
    agentId,
    collectedAt: now.toISOString(),
    conversationId,
    windowHours,
    windowStartedAt: windowStartedAtIso,
    changeCursor,
    sourceCounts,
    ...(mindProfileSnapshot ? { mindProfileSnapshot } : {}),
    ...(sessionDigest ? { sessionDigest } : {}),
    ...(sessionMemory ? { sessionMemory } : {}),
    ...(focusTask ? { focusTask } : {}),
    recentTasks,
    recentWorkItems,
    recentDurableMemories,
    recentExperienceUsages,
    ...(learningReviewInput ? { learningReviewInput } : {}),
  };
}
