import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import type {
  AgentPromptDelta,
  AgentPromptSnapshot,
  AgentPromptSnapshotMessage,
  ProviderNativeSystemBlock,
} from "@belldandy/agent";
import type { JsonObject } from "@belldandy/protocol";
import {
  buildPromptTokenBreakdown,
  readPromptTokenBreakdownFromMetadata,
  readPromptTruncationReasonFromMetadata,
  renderPromptObservabilityText,
  type PromptTruncationReason,
  type PromptTokenBreakdown,
  withDeltaPromptMetrics,
  withProviderNativeSystemBlockPromptMetrics,
} from "./prompt-observability.js";
import { normalizeLegacyPromptSnapshot } from "./prompt-snapshot-legacy-normalize.js";

const CONVERSATION_DEBUG_DIRNAME = "diagnostics";
const PROMPT_SNAPSHOT_DIRNAME = "prompt-snapshots";
export const CONVERSATION_PROMPT_SNAPSHOT_SCHEMA_VERSION = 1 as const;

export type ConversationPromptSnapshotArtifact = {
  schemaVersion: typeof CONVERSATION_PROMPT_SNAPSHOT_SCHEMA_VERSION;
  manifest: {
    conversationId: string;
    runId?: string;
    agentId?: string;
    createdAt: number;
    persistedAt: number;
    source: "runtime.prompt_snapshot";
  };
  summary: {
    messageCount: number;
    systemPromptChars: number;
    includesHookSystemPrompt: boolean;
    hasPrependContext: boolean;
    deltaCount: number;
    deltaChars: number;
    systemPromptEstimatedTokens: number;
    deltaEstimatedTokens: number;
    providerNativeSystemBlockCount: number;
    providerNativeSystemBlockChars: number;
    providerNativeSystemBlockEstimatedTokens: number;
    tokenBreakdown: PromptTokenBreakdown;
    truncationReason?: PromptTruncationReason;
  };
  snapshot: {
    systemPrompt: string;
    messages: AgentPromptSnapshotMessage[];
    deltas?: Array<AgentPromptDelta & { charLength: number; estimatedChars: number; estimatedTokens: number }>;
    providerNativeSystemBlocks?: Array<ProviderNativeSystemBlock & { charLength: number; estimatedChars: number; estimatedTokens: number }>;
    inputMeta?: JsonObject;
    hookSystemPromptUsed: boolean;
    prependContext?: string;
  };
};

export function buildConversationPromptSnapshotArtifact(input: {
  snapshot: AgentPromptSnapshot;
  persistedAt?: number;
}): ConversationPromptSnapshotArtifact {
  const persistedAt = typeof input.persistedAt === "number" && Number.isFinite(input.persistedAt)
    ? Math.max(0, Math.floor(input.persistedAt))
    : Date.now();
  const promptTokenBreakdown = buildPromptTokenBreakdown({
    systemPromptText: input.snapshot.systemPrompt,
    deltas: input.snapshot.deltas,
    providerNativeSystemBlocks: input.snapshot.providerNativeSystemBlocks,
  });
  const truncationReason = readPromptTruncationReasonFromMetadata(
    input.snapshot.inputMeta as Record<string, unknown> | undefined,
  );

  return {
    schemaVersion: CONVERSATION_PROMPT_SNAPSHOT_SCHEMA_VERSION,
    manifest: {
      conversationId: input.snapshot.conversationId,
      ...(input.snapshot.runId ? { runId: input.snapshot.runId } : {}),
      ...(input.snapshot.agentId ? { agentId: input.snapshot.agentId } : {}),
      createdAt: input.snapshot.createdAt,
      persistedAt,
      source: "runtime.prompt_snapshot",
    },
    summary: {
      messageCount: input.snapshot.messages.length,
      systemPromptChars: input.snapshot.systemPrompt.length,
      includesHookSystemPrompt: input.snapshot.hookSystemPromptUsed === true,
      hasPrependContext: Boolean(input.snapshot.prependContext),
      deltaCount: input.snapshot.deltas?.length ?? 0,
      deltaChars: input.snapshot.deltas?.reduce((sum, delta) => sum + delta.text.length, 0) ?? 0,
      systemPromptEstimatedTokens: promptTokenBreakdown.systemPromptEstimatedTokens,
      deltaEstimatedTokens: promptTokenBreakdown.deltaEstimatedTokens,
      providerNativeSystemBlockCount: input.snapshot.providerNativeSystemBlocks?.length ?? 0,
      providerNativeSystemBlockChars: input.snapshot.providerNativeSystemBlocks?.reduce((sum, block) => sum + block.text.length, 0) ?? 0,
      providerNativeSystemBlockEstimatedTokens: promptTokenBreakdown.providerNativeSystemBlockEstimatedTokens,
      tokenBreakdown: promptTokenBreakdown,
      ...(truncationReason ? { truncationReason } : {}),
    },
    snapshot: {
      systemPrompt: input.snapshot.systemPrompt,
      messages: input.snapshot.messages.map((message) => ({
        ...message,
        content: Array.isArray(message.content)
          ? message.content.map((part) => ({ ...part }))
          : message.content,
      })),
      ...(input.snapshot.deltas
        ? {
          deltas: input.snapshot.deltas.map((delta) => withDeltaPromptMetrics({
            ...delta,
            ...(delta.metadata ? { metadata: { ...delta.metadata } } : {}),
          })),
        }
        : {}),
      ...(input.snapshot.providerNativeSystemBlocks
        ? {
          providerNativeSystemBlocks: input.snapshot.providerNativeSystemBlocks.map((block) => withProviderNativeSystemBlockPromptMetrics({
            ...block,
            sourceSectionIds: [...block.sourceSectionIds],
            sourceDeltaIds: [...block.sourceDeltaIds],
          })),
        }
        : {}),
      ...(input.snapshot.inputMeta ? { inputMeta: { ...input.snapshot.inputMeta } } : {}),
      hookSystemPromptUsed: input.snapshot.hookSystemPromptUsed === true,
      ...(input.snapshot.prependContext ? { prependContext: input.snapshot.prependContext } : {}),
    },
  };
}

export function getConversationPromptSnapshotRoot(stateDir: string): string {
  return path.join(stateDir, CONVERSATION_DEBUG_DIRNAME, PROMPT_SNAPSHOT_DIRNAME);
}

export function getConversationPromptSnapshotDirectory(stateDir: string, conversationId: string): string {
  return path.join(getConversationPromptSnapshotRoot(stateDir), sanitizeFileSegment(conversationId));
}

export function getConversationPromptSnapshotArtifactPath(input: {
  stateDir: string;
  conversationId: string;
  runId?: string;
  createdAt?: number;
}): string {
  const dir = getConversationPromptSnapshotDirectory(input.stateDir, input.conversationId);
  const runSegment = input.runId
    ? `run-${sanitizeFileSegment(input.runId)}`
    : `created-${Math.max(0, Math.floor(input.createdAt ?? Date.now()))}`;
  return path.join(dir, `${runSegment}.prompt-snapshot.json`);
}

export async function persistConversationPromptSnapshot(input: {
  stateDir: string;
  snapshot: AgentPromptSnapshot;
}): Promise<{ artifact: ConversationPromptSnapshotArtifact; outputPath: string }> {
  const artifact = buildConversationPromptSnapshotArtifact({ snapshot: input.snapshot });
  const outputPath = getConversationPromptSnapshotArtifactPath({
    stateDir: input.stateDir,
    conversationId: input.snapshot.conversationId,
    runId: input.snapshot.runId,
    createdAt: input.snapshot.createdAt,
  });
  await atomicWriteJson(outputPath, artifact);
  return {
    artifact,
    outputPath,
  };
}

export async function loadConversationPromptSnapshotArtifact(input: {
  stateDir: string;
  conversationId: string;
  runId?: string;
}): Promise<ConversationPromptSnapshotArtifact | undefined> {
  if (input.runId) {
    const artifactPath = getConversationPromptSnapshotArtifactPath({
      stateDir: input.stateDir,
      conversationId: input.conversationId,
      runId: input.runId,
    });
    return readPromptSnapshotArtifactFile(artifactPath);
  }

  const directory = getConversationPromptSnapshotDirectory(input.stateDir, input.conversationId);
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch((error) => {
    const fsError = error as NodeJS.ErrnoException;
    if (fsError.code === "ENOENT") {
      return undefined;
    }
    throw error;
  });
  if (!entries || entries.length === 0) {
    return undefined;
  }

  let latestArtifact: ConversationPromptSnapshotArtifact | undefined;
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".prompt-snapshot.json")) {
      continue;
    }
    const artifact = await readPromptSnapshotArtifactFile(path.join(directory, entry.name));
    if (!artifact) {
      continue;
    }
    if (!latestArtifact || artifact.manifest.createdAt > latestArtifact.manifest.createdAt) {
      latestArtifact = artifact;
    }
  }

  return latestArtifact;
}

export function normalizeConversationPromptSnapshotArtifact(
  artifact: ConversationPromptSnapshotArtifact,
): ConversationPromptSnapshotArtifact {
  const normalizedSnapshot = normalizeLegacyPromptSnapshot({
    agentId: artifact.manifest.agentId,
    conversationId: artifact.manifest.conversationId,
    runId: artifact.manifest.runId,
    createdAt: artifact.manifest.createdAt,
    systemPrompt: artifact.snapshot.systemPrompt,
    messages: artifact.snapshot.messages,
    ...(artifact.snapshot.deltas ? { deltas: artifact.snapshot.deltas } : {}),
    ...(artifact.snapshot.providerNativeSystemBlocks
      ? { providerNativeSystemBlocks: artifact.snapshot.providerNativeSystemBlocks }
      : {}),
    ...(artifact.snapshot.inputMeta ? { inputMeta: artifact.snapshot.inputMeta } : {}),
    hookSystemPromptUsed: artifact.snapshot.hookSystemPromptUsed,
    prependContext: artifact.snapshot.prependContext,
  });
  const rebuiltArtifact = buildConversationPromptSnapshotArtifact({
    snapshot: normalizedSnapshot,
    persistedAt: artifact.manifest.persistedAt,
  });
  const summaryRecord = isRecord(artifact.summary)
    ? artifact.summary
    : undefined;
  const inputMeta = isRecord(normalizedSnapshot.inputMeta)
    ? normalizedSnapshot.inputMeta as Record<string, unknown>
    : undefined;
  const tokenBreakdown = readPromptTokenBreakdownFromMetadata(
    summaryRecord ? { tokenBreakdown: summaryRecord.tokenBreakdown } : undefined,
  ) ?? readPromptTokenBreakdownFromMetadata(
    inputMeta
      ? { tokenBreakdown: inputMeta.tokenBreakdown ?? inputMeta.promptTokenBreakdown }
      : undefined,
  ) ?? rebuiltArtifact.summary.tokenBreakdown;
  const truncationReason = readPromptTruncationReasonFromMetadata(
    summaryRecord ? { truncationReason: summaryRecord.truncationReason } : undefined,
  ) ?? readPromptTruncationReasonFromMetadata(inputMeta)
    ?? rebuiltArtifact.summary.truncationReason;

  return {
    schemaVersion: artifact.schemaVersion,
    manifest: { ...artifact.manifest },
    summary: {
      ...rebuiltArtifact.summary,
      tokenBreakdown,
      systemPromptEstimatedTokens: tokenBreakdown.systemPromptEstimatedTokens,
      deltaEstimatedTokens: tokenBreakdown.deltaEstimatedTokens,
      providerNativeSystemBlockEstimatedTokens: tokenBreakdown.providerNativeSystemBlockEstimatedTokens,
      ...(truncationReason ? { truncationReason } : {}),
    },
    snapshot: rebuiltArtifact.snapshot,
  };
}

export function renderConversationPromptSnapshotText(
  artifact: ConversationPromptSnapshotArtifact,
): string {
  const promptObservabilityText = renderPromptObservabilityText({
    scope: "run",
    agentId: artifact.manifest.agentId ?? "unknown",
    conversationId: artifact.manifest.conversationId,
    ...(artifact.manifest.runId ? { runId: artifact.manifest.runId } : {}),
    createdAt: artifact.manifest.createdAt,
    counts: {
      deltaCount: artifact.summary.deltaCount,
      providerNativeSystemBlockCount: artifact.summary.providerNativeSystemBlockCount,
    },
    promptSizes: {
      totalChars: artifact.summary.systemPromptChars,
      finalChars: artifact.summary.systemPromptChars,
    },
    tokenBreakdown: artifact.summary.tokenBreakdown,
    flags: {
      includesHookSystemPrompt: artifact.summary.includesHookSystemPrompt,
      hasPrependContext: artifact.summary.hasPrependContext,
    },
    ...(artifact.summary.truncationReason
      ? { truncationReason: artifact.summary.truncationReason }
      : {}),
  });
  const lines: string[] = [
    "Conversation Prompt Snapshot",
    `conversationId: ${artifact.manifest.conversationId}`,
    artifact.manifest.runId ? `runId: ${artifact.manifest.runId}` : "runId: (latest)",
    artifact.manifest.agentId ? `agentId: ${artifact.manifest.agentId}` : "agentId: unknown",
    `createdAt: ${new Date(artifact.manifest.createdAt).toISOString()}`,
    `persistedAt: ${new Date(artifact.manifest.persistedAt).toISOString()}`,
    "",
    `messages: ${artifact.summary.messageCount}`,
    promptObservabilityText,
    "",
    "System Prompt",
    artifact.snapshot.systemPrompt || "(empty)",
    "",
    "Messages",
  ];

  artifact.snapshot.messages.forEach((message, index) => {
    lines.push(``);
    lines.push(`[${index + 1}] role=${message.role}${message.toolCallId ? ` toolCallId=${message.toolCallId}` : ""}`);
    if (Array.isArray(message.content)) {
      message.content.forEach((part, partIndex) => {
        if (part.type === "text") {
          lines.push(`  part[${partIndex}] text: ${part.text}`);
          return;
        }
        lines.push(`  part[${partIndex}] ${part.type}: ${part.url}`);
      });
      return;
    }
    lines.push(String(message.content));
  });

  if (artifact.snapshot.deltas && artifact.snapshot.deltas.length > 0) {
    lines.push("");
    lines.push("Prompt Deltas");
    artifact.snapshot.deltas.forEach((delta, index) => {
      lines.push(`[${index + 1}] ${delta.deltaType} role=${delta.role} id=${delta.id} estimatedTokens=${delta.estimatedTokens}`);
      lines.push(delta.text);
    });
  }

  if (artifact.snapshot.providerNativeSystemBlocks && artifact.snapshot.providerNativeSystemBlocks.length > 0) {
    lines.push("");
    lines.push("Provider-Native System Blocks");
    artifact.snapshot.providerNativeSystemBlocks.forEach((block, index) => {
      lines.push(
        `[${index + 1}] ${block.blockType} id=${block.id} cacheControlEligible=${block.cacheControlEligible ? "yes" : "no"} estimatedTokens=${block.estimatedTokens}`,
      );
      lines.push(`  sourceSectionIds: ${block.sourceSectionIds.join(", ") || "(none)"}`);
      lines.push(`  sourceDeltaIds: ${block.sourceDeltaIds.join(", ") || "(none)"}`);
      lines.push(block.text);
    });
  }

  if (artifact.snapshot.inputMeta && Object.keys(artifact.snapshot.inputMeta).length > 0) {
    lines.push("");
    lines.push("Input Meta");
    lines.push(JSON.stringify(artifact.snapshot.inputMeta, null, 2));
  }

  return lines.join("\n");
}

async function atomicWriteJson(targetPath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  const tempPath = `${targetPath}.${crypto.randomUUID()}.tmp`;
  await fs.writeFile(tempPath, JSON.stringify(value, null, 2), "utf-8");
  await fs.rename(tempPath, targetPath);
}

async function readPromptSnapshotArtifactFile(targetPath: string): Promise<ConversationPromptSnapshotArtifact | undefined> {
  try {
    const raw = await fs.readFile(targetPath, "utf-8");
    const parsed = JSON.parse(raw) as ConversationPromptSnapshotArtifact;
    if (!parsed || typeof parsed !== "object") {
      return undefined;
    }
    if (parsed.schemaVersion !== CONVERSATION_PROMPT_SNAPSHOT_SCHEMA_VERSION) {
      return undefined;
    }
    if (!parsed.manifest || typeof parsed.manifest.conversationId !== "string") {
      return undefined;
    }
    return normalizeConversationPromptSnapshotArtifact(parsed);
  } catch (error) {
    const fsError = error as NodeJS.ErrnoException;
    if (fsError.code === "ENOENT") {
      return undefined;
    }
    throw error;
  }
}

function sanitizeFileSegment(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return sanitized.slice(0, 120) || "conversation";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
