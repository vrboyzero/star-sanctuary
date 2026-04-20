import fs from "node:fs/promises";
import path from "node:path";

import { getConversationPromptSnapshotRoot } from "./conversation-prompt-snapshot.js";
import { parseGoalSessionKey } from "./goals/session.js";
import { loadPromptSnapshotIndex } from "./prompt-snapshot-index.js";

type LearningReviewNudgeSignalKind = "memory" | "candidate" | "method" | "skill" | "review" | "generic";
type LearningReviewNudgeTriggerSource = "explicit_user_intent" | "goal_review_pressure";
type LearningReviewSessionKind = "main" | "goal" | "goal_node";

export type LearningReviewNudgeRuntimeReport = {
  summary: {
    available: boolean;
    triggered: boolean;
    headline: string;
    sessionKind: LearningReviewSessionKind;
    triggerSources: LearningReviewNudgeTriggerSource[];
    signalKinds: LearningReviewNudgeSignalKind[];
    lineCount: number;
  };
  latest?: {
    conversationId: string;
    runId?: string;
    createdAt: number;
    currentTurnPreview?: string;
  };
};

type PromptSnapshotRuntimeDelta = {
  id?: string;
  source?: string;
  text?: string;
  metadata?: Record<string, unknown>;
};

type PromptSnapshotArtifactLike = {
  manifest?: {
    conversationId?: string;
    runId?: string;
    createdAt?: number;
  };
  snapshot?: {
    deltas?: PromptSnapshotRuntimeDelta[];
    messages?: Array<{
      role?: string;
      content?: unknown;
    }>;
  };
};

export async function buildLearningReviewNudgeRuntimeReport(input: {
  stateDir: string;
}): Promise<LearningReviewNudgeRuntimeReport> {
  const artifact = await loadLatestForegroundPromptSnapshotArtifact(input.stateDir);
  if (!artifact?.manifest?.conversationId || typeof artifact.manifest.createdAt !== "number") {
    return {
      summary: {
        available: false,
        triggered: false,
        headline: "no recent foreground prompt snapshot",
        sessionKind: "main",
        triggerSources: [],
        signalKinds: [],
        lineCount: 0,
      },
    };
  }

  const conversationId = artifact.manifest.conversationId;
  const sessionKind = resolveSessionKind(conversationId);
  const delta = findLearningReviewNudgeDelta(artifact.snapshot?.deltas);
  const currentTurnPreview = extractLatestUserPreview(artifact.snapshot?.messages);

  if (!delta) {
    return {
      summary: {
        available: true,
        triggered: false,
        headline: `latest foreground run did not trigger learning/review nudge (session=${sessionKind})`,
        sessionKind,
        triggerSources: [],
        signalKinds: [],
        lineCount: 0,
      },
      latest: {
        conversationId,
        ...(artifact.manifest.runId ? { runId: artifact.manifest.runId } : {}),
        createdAt: artifact.manifest.createdAt,
        ...(currentTurnPreview ? { currentTurnPreview } : {}),
      },
    };
  }

  const metadata = isRecord(delta.metadata) ? delta.metadata : {};
  const triggerSources = readStringArray(metadata.triggerSources)
    .filter(isLearningReviewTriggerSource);
  if (triggerSources.length <= 0) {
    if (metadata.hasExplicitLearningReviewIntent === true) {
      triggerSources.push("explicit_user_intent");
    }
    if (metadata.hasGoalReviewPressure === true) {
      triggerSources.push("goal_review_pressure");
    }
  }
  const signalKinds = readStringArray(metadata.signalKinds)
    .filter(isLearningReviewSignalKind);
  if (signalKinds.length <= 0) {
    signalKinds.push(...extractSignalKindsFromText(delta.text));
  }
  const lineCount = typeof metadata.lineCount === "number" && Number.isFinite(metadata.lineCount)
    ? Math.max(0, Math.floor(metadata.lineCount))
    : countBulletLines(delta.text);
  const headline = [
    "latest foreground run triggered learning/review nudge",
    `session=${resolveSessionKindFromMetadata(metadata.sessionKind, conversationId)}`,
    triggerSources.length > 0 ? `source=${triggerSources.join("+")}` : "source=unknown",
    signalKinds.length > 0 ? `signals=${signalKinds.join("/")}` : "signals=unknown",
    `lines=${lineCount}`,
  ].join("; ");

  return {
    summary: {
      available: true,
      triggered: true,
      headline,
      sessionKind: resolveSessionKindFromMetadata(metadata.sessionKind, conversationId),
      triggerSources,
      signalKinds,
      lineCount,
    },
    latest: {
      conversationId,
      ...(artifact.manifest.runId ? { runId: artifact.manifest.runId } : {}),
      createdAt: artifact.manifest.createdAt,
      ...(currentTurnPreview ? { currentTurnPreview } : {}),
    },
  };
}

async function loadLatestForegroundPromptSnapshotArtifact(stateDir: string): Promise<PromptSnapshotArtifactLike | undefined> {
  const root = getConversationPromptSnapshotRoot(stateDir);
  const indexedArtifact = await loadLatestForegroundPromptSnapshotArtifactFromIndex(root);
  if (indexedArtifact) {
    return indexedArtifact;
  }
  const directories = await fs.readdir(root, { withFileTypes: true }).catch((error) => {
    const fsError = error as NodeJS.ErrnoException;
    if (fsError.code === "ENOENT") {
      return undefined;
    }
    throw error;
  });
  if (!directories || directories.length <= 0) {
    return undefined;
  }

  let latest: PromptSnapshotArtifactLike | undefined;
  for (const entry of directories) {
    if (!entry.isDirectory() || entry.name.startsWith("_")) {
      continue;
    }
    const files = await fs.readdir(path.join(root, entry.name), { withFileTypes: true }).catch(() => undefined);
    if (!files) continue;
    for (const file of files) {
      if (!file.isFile() || !file.name.endsWith(".prompt-snapshot.json")) {
        continue;
      }
      const candidate = await readPromptSnapshotArtifactLike(path.join(root, entry.name, file.name));
      const createdAt = candidate?.manifest?.createdAt;
      const conversationId = candidate?.manifest?.conversationId;
      if (
        typeof createdAt !== "number"
        || !conversationId
        || isBackgroundConversationId(conversationId)
      ) {
        continue;
      }
      if (!latest || createdAt > Number(latest.manifest?.createdAt ?? 0)) {
        latest = candidate;
      }
    }
  }

  return latest;
}

async function loadLatestForegroundPromptSnapshotArtifactFromIndex(
  root: string,
): Promise<PromptSnapshotArtifactLike | undefined> {
  const index = await loadPromptSnapshotIndex(root);
  if (!index?.entries?.length) {
    return undefined;
  }

  for (const entry of index.entries) {
    if (!entry || typeof entry !== "object" || isBackgroundConversationId(String(entry.conversationId ?? ""))) {
      continue;
    }
    if (typeof entry.directoryName !== "string" || typeof entry.latestFileName !== "string") {
      continue;
    }
    const candidate = await readPromptSnapshotArtifactLike(path.join(root, entry.directoryName, entry.latestFileName));
    const createdAt = candidate?.manifest?.createdAt;
    const conversationId = candidate?.manifest?.conversationId;
    if (
      typeof createdAt !== "number"
      || !conversationId
      || isBackgroundConversationId(conversationId)
    ) {
      continue;
    }
    return candidate;
  }

  return undefined;
}

async function readPromptSnapshotArtifactLike(filePath: string): Promise<PromptSnapshotArtifactLike | undefined> {
  const raw = await fs.readFile(filePath, "utf-8").catch((error) => {
    const fsError = error as NodeJS.ErrnoException;
    if (fsError.code === "ENOENT") {
      return undefined;
    }
    throw error;
  });
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as PromptSnapshotArtifactLike;
    return parsed;
  } catch {
    return undefined;
  }
}

function findLearningReviewNudgeDelta(deltas: PromptSnapshotRuntimeDelta[] | undefined): PromptSnapshotRuntimeDelta | undefined {
  if (!Array.isArray(deltas)) return undefined;
  return deltas.find((delta) => delta?.id === "learning-review-nudge" || delta?.source === "learning-review-nudge");
}

function extractLatestUserPreview(messages: Array<{ role?: string; content?: unknown }> | undefined): string | undefined {
  if (!Array.isArray(messages)) return undefined;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role !== "user") continue;
    const content = message.content;
    if (typeof content === "string" && content.trim()) {
      return truncateText(content, 96);
    }
    if (Array.isArray(content)) {
      const textPart = content.find((item) => isRecord(item) && item.type === "text" && typeof item.text === "string");
      if (textPart && typeof textPart.text === "string" && textPart.text.trim()) {
        return truncateText(textPart.text, 96);
      }
    }
  }
  return undefined;
}

function extractSignalKindsFromText(text: unknown): LearningReviewNudgeSignalKind[] {
  if (typeof text !== "string" || !text.trim()) return [];
  const result = new Set<LearningReviewNudgeSignalKind>();
  if (text.includes("memory_write")) result.add("memory");
  if (text.includes("experience_candidate_list")) result.add("candidate");
  if (text.includes("task_promote_method")) result.add("method");
  if (text.includes("task_promote_skill_draft")) result.add("skill");
  if (text.includes("goal_suggestion_review_list") || text.includes("goal_review_governance_summary")) result.add("review");
  return [...result];
}

function countBulletLines(text: unknown): number {
  if (typeof text !== "string" || !text.trim()) return 0;
  return text.split(/\r?\n/).filter((line) => line.trimStart().startsWith("- ")).length;
}

function truncateText(value: string, maxLength: number): string {
  const normalized = value.trim();
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3))}...`;
}

function resolveSessionKind(conversationId: string): LearningReviewSessionKind {
  const goalSession = parseGoalSessionKey(conversationId);
  if (goalSession?.kind === "goal_node") return "goal_node";
  if (goalSession?.kind === "goal") return "goal";
  return "main";
}

function resolveSessionKindFromMetadata(value: unknown, conversationId: string): LearningReviewSessionKind {
  if (value === "goal" || value === "goal_node" || value === "main") {
    return value;
  }
  return resolveSessionKind(conversationId);
}

function readStringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isLearningReviewSignalKind(value: string): value is LearningReviewNudgeSignalKind {
  return value === "memory" || value === "candidate" || value === "method" || value === "skill" || value === "review" || value === "generic";
}

function isLearningReviewTriggerSource(value: string): value is LearningReviewNudgeTriggerSource {
  return value === "explicit_user_intent" || value === "goal_review_pressure";
}

function isBackgroundConversationId(conversationId: string): boolean {
  return conversationId.startsWith("heartbeat-")
    || conversationId.startsWith("cron-")
    || conversationId.startsWith("sub_");
}
