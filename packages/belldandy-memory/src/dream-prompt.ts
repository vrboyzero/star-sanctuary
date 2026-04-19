import type {
  DreamInputSnapshot,
  DreamModelOutput,
  DreamPromptBundle,
  DreamShareCandidate,
  DreamShareCandidateVisibility,
} from "./dream-types.js";

function truncateText(value: unknown, maxLength = 240): string | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) return undefined;
  return normalized.length > maxLength ? `${normalized.slice(0, Math.max(0, maxLength - 3))}...` : normalized;
}

function stripMarkdownFence(value: string): string {
  return value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
}

function stripReasoningArtifacts(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .replace(/<think\b[^>]*>[\s\S]*?<\/think>/gi, "")
    .trim();
}

function extractFirstJsonObject(value: string): string | null {
  let start = -1;
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (start < 0) {
      if (char === "{") {
        start = index;
        depth = 1;
        inString = false;
        escaped = false;
      }
      continue;
    }

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }
    if (char === "{") {
      depth += 1;
      continue;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return value.slice(start, index + 1);
      }
    }
  }

  return null;
}

function normalizeDreamJsonCandidate(raw: string): string {
  const direct = stripMarkdownFence(stripReasoningArtifacts(raw));
  if (direct.startsWith("{") && direct.endsWith("}")) {
    return direct;
  }

  const fencedMatches = Array.from(raw.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi));
  for (const match of fencedMatches) {
    const candidate = stripReasoningArtifacts(match[1] ?? "");
    const extracted = extractFirstJsonObject(candidate);
    if (extracted) {
      return extracted;
    }
  }

  const extracted = extractFirstJsonObject(direct);
  if (extracted) {
    return extracted;
  }

  throw new Error(`Dream model did not return a valid JSON object. Preview: ${truncateText(raw, 160) ?? "(empty)"}`);
}

function normalizeStringArray(value: unknown, maxItems: number, maxLength = 200): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => truncateText(item, maxLength))
    .filter((item): item is string => Boolean(item))
    .slice(0, maxItems);
}

function normalizeVisibility(value: unknown): DreamShareCandidateVisibility | undefined {
  switch (value) {
    case "private":
    case "shared_candidate":
    case "unclear":
      return value;
    default:
      return undefined;
  }
}

function normalizeShareCandidates(value: unknown): DreamShareCandidate[] {
  if (!Array.isArray(value)) return [];
  const result: DreamShareCandidate[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue;
    const candidate = item as Record<string, unknown>;
    const title = truncateText(candidate.title, 120);
    if (!title) continue;
    result.push({
      title,
      ...(truncateText(candidate.reason, 240) ? { reason: truncateText(candidate.reason, 240) } : {}),
      ...(truncateText(candidate.evidence, 240) ? { evidence: truncateText(candidate.evidence, 240) } : {}),
      ...(normalizeVisibility(candidate.suggestedVisibility)
        ? { suggestedVisibility: normalizeVisibility(candidate.suggestedVisibility) }
        : {}),
    });
    if (result.length >= 6) break;
  }
  return result;
}

function compactTask(task: DreamInputSnapshot["focusTask"] | DreamInputSnapshot["recentTasks"][number] | undefined): Record<string, unknown> | undefined {
  if (!task) return undefined;
  return {
    id: task.id,
    title: truncateText(task.title, 120),
    objective: truncateText(task.objective, 180),
    status: task.status,
    source: task.source,
    summary: truncateText(task.summary, 240),
    outcome: truncateText(task.outcome, 180),
    reflection: truncateText(task.reflection, 180),
    toolNames: (task.toolCalls ?? []).map((item) => truncateText(item.toolName, 80)).filter(Boolean).slice(0, 8),
    artifactPaths: (task.artifactPaths ?? []).map((item) => truncateText(item, 160)).filter(Boolean).slice(0, 8),
    workRecap: task.workRecap
      ? {
          headline: truncateText(task.workRecap.headline, 180),
          confirmedFacts: (task.workRecap.confirmedFacts ?? []).map((item) => truncateText(item, 160)).filter(Boolean).slice(0, 5),
        }
      : undefined,
    resumeContext: task.resumeContext
      ? {
          currentStopPoint: truncateText(task.resumeContext.currentStopPoint, 180),
          nextStep: truncateText(task.resumeContext.nextStep, 180),
        }
      : undefined,
  };
}

function compactInputSnapshot(snapshot: DreamInputSnapshot): Record<string, unknown> {
  return {
    meta: {
      agentId: snapshot.agentId,
      conversationId: snapshot.conversationId,
      collectedAt: snapshot.collectedAt,
      windowStartedAt: snapshot.windowStartedAt,
      windowHours: snapshot.windowHours,
      sourceCounts: snapshot.sourceCounts,
    },
    focusTask: compactTask(snapshot.focusTask),
    recentTasks: snapshot.recentTasks.slice(0, 4).map((item) => compactTask(item)),
    recentWorkItems: snapshot.recentWorkItems.slice(0, 4).map((item) => ({
      taskId: item.taskId,
      title: truncateText(item.title, 120),
      objective: truncateText(item.objective, 180),
      summary: truncateText(item.summary, 200),
      status: item.status,
      toolNames: item.toolNames.slice(0, 8),
      artifactPaths: item.artifactPaths.slice(0, 8),
      recentActivityTitles: item.recentActivityTitles.slice(0, 5),
      workRecapHeadline: truncateText(item.workRecap?.headline, 160),
      resumeNextStep: truncateText(item.resumeContext?.nextStep, 160),
      sourceRefs: item.sourceExplanation?.sourceRefs?.slice(0, 4).map((ref) => ({
        kind: ref.kind,
        label: truncateText(ref.label, 120),
        previews: ref.previews.slice(0, 3).map((preview) => truncateText(preview, 120)).filter(Boolean),
      })),
    })),
    recentDurableMemories: snapshot.recentDurableMemories.slice(0, 8).map((item) => ({
      sourcePath: truncateText(item.sourcePath, 180),
      visibility: item.visibility,
      memoryType: item.memoryType,
      category: item.category,
      summary: truncateText(item.summary, 180),
      snippet: truncateText(item.snippet, 180),
    })),
    recentExperienceUsages: snapshot.recentExperienceUsages.slice(0, 6).map((item) => ({
      usageId: truncateText(item.usageId, 80),
      assetType: item.assetType,
      assetKey: truncateText(item.assetKey, 120),
      usageCount: item.usageCount,
      lastUsedAt: item.lastUsedAt,
      sourceCandidateType: item.sourceCandidateType,
      sourceCandidateTitle: truncateText(item.sourceCandidateTitle, 120),
    })),
    sessionDigest: snapshot.sessionDigest
      ? {
          status: snapshot.sessionDigest.status,
          pendingMessageCount: snapshot.sessionDigest.pendingMessageCount,
          messageCount: snapshot.sessionDigest.messageCount,
          rollingSummary: truncateText(snapshot.sessionDigest.rollingSummary, 500),
          archivalSummary: truncateText(snapshot.sessionDigest.archivalSummary, 500),
        }
      : undefined,
    sessionMemory: snapshot.sessionMemory
      ? {
          summary: truncateText(snapshot.sessionMemory.summary, 300),
          currentGoal: truncateText(snapshot.sessionMemory.currentGoal, 180),
          currentWork: truncateText(snapshot.sessionMemory.currentWork, 180),
          nextStep: truncateText(snapshot.sessionMemory.nextStep, 180),
          decisions: (snapshot.sessionMemory.decisions ?? []).map((item) => truncateText(item, 140)).filter(Boolean).slice(0, 5),
          keyResults: (snapshot.sessionMemory.keyResults ?? []).map((item) => truncateText(item, 140)).filter(Boolean).slice(0, 5),
          pendingTasks: (snapshot.sessionMemory.pendingTasks ?? []).map((item) => truncateText(item, 140)).filter(Boolean).slice(0, 5),
        }
      : undefined,
    mindProfileSnapshot: snapshot.mindProfileSnapshot
      ? {
          headline: truncateText(snapshot.mindProfileSnapshot.profile?.headline, 180),
          summaryHeadline: truncateText(snapshot.mindProfileSnapshot.summary?.headline, 180),
          summaryLines: normalizeStringArray(snapshot.mindProfileSnapshot.profile?.summaryLines, 6, 180),
          privateMemoryCount: snapshot.mindProfileSnapshot.memory?.privateMemoryCount,
          sharedMemoryCount: snapshot.mindProfileSnapshot.memory?.sharedMemoryCount,
          recentMemorySnippets: (snapshot.mindProfileSnapshot.memory?.recentMemorySnippets ?? []).slice(0, 4).map((item) => ({
            scope: item.scope,
            sourcePath: truncateText(item.sourcePath, 160),
            text: truncateText(item.text, 160),
          })),
        }
      : undefined,
    learningReviewInput: snapshot.learningReviewInput
      ? {
          headline: truncateText(snapshot.learningReviewInput.summary?.headline, 180),
          summaryLines: normalizeStringArray(snapshot.learningReviewInput.summaryLines, 6, 180),
          nudges: normalizeStringArray(snapshot.learningReviewInput.nudges, 6, 180),
        }
      : undefined,
  };
}

export function buildDreamPromptBundle(snapshot: DreamInputSnapshot): DreamPromptBundle {
  const inputView = compactInputSnapshot(snapshot);
  return {
    system: [
      "你是 Star Sanctuary 的 dream 整理器。",
      "你的任务是基于 Agent 最近的会话摘要、session memory、durable memory、任务回顾和经验使用记录，产出一份面向该 Agent 私有记忆空间的梦境整理结果。",
      "请优先提炼稳定认知、修正偏差、标出后续聚焦点；不要编造事实，不要泄露不存在于输入中的信息。",
      "输出必须是 JSON 对象，不要输出 Markdown，不要输出解释。",
      "字段必须包含：headline, summary, narrative, stableInsights, corrections, openQuestions, shareCandidates, nextFocus。",
      "stableInsights / corrections / openQuestions / nextFocus 必须是字符串数组。",
      "shareCandidates 必须是对象数组，字段为 title, reason, evidence, suggestedVisibility。",
      "suggestedVisibility 只能是 private / shared_candidate / unclear。",
      "如果某个字段没有内容，返回空字符串或空数组，不要省略字段。",
    ].join(" "),
    user: [
      `agentId: ${snapshot.agentId}`,
      `conversationId: ${snapshot.conversationId ?? "unknown"}`,
      `collectedAt: ${snapshot.collectedAt}`,
      `windowHours: ${snapshot.windowHours}`,
      "",
      "请根据以下 dream 输入快照，输出一份面向该 Agent 私有 dream 的结构化 JSON：",
      "",
      JSON.stringify(inputView, null, 2),
    ].join("\n"),
    inputView,
  };
}

export function parseDreamModelOutput(raw: string): DreamModelOutput {
  const sanitized = normalizeDreamJsonCandidate(raw);
  const parsed = JSON.parse(sanitized) as Record<string, unknown>;
  return {
    headline: truncateText(parsed.headline, 140),
    summary: truncateText(parsed.summary, 260),
    narrative: truncateText(parsed.narrative, 800),
    stableInsights: normalizeStringArray(parsed.stableInsights, 8),
    corrections: normalizeStringArray(parsed.corrections, 6),
    openQuestions: normalizeStringArray(parsed.openQuestions, 6),
    shareCandidates: normalizeShareCandidates(parsed.shareCandidates),
    nextFocus: normalizeStringArray(parsed.nextFocus, 6),
  };
}

export function summarizeDreamModelOutput(output: DreamModelOutput): string | undefined {
  return truncateText(output.headline || output.summary, 160);
}
