import fs from "node:fs/promises";
import path from "node:path";
import {
  buildDefaultProfile,
  ConversationStore,
  loadAgentProfiles,
  type AgentProfile,
  type PersistedConversationSummary,
  type SessionTimelineProjection,
  type SessionTranscriptExportBundle,
} from "@belldandy/agent";
import { buildAgentLaunchExplainability } from "../../../agent-launch-explainability.js";
import { loadConversationPromptSnapshotArtifact, renderConversationPromptSnapshotText, type ConversationPromptSnapshotArtifact } from "../../../conversation-prompt-snapshot.js";
import { resolveConversationArtifactOutputPath } from "../../../conversation-debug-projection.js";
import { listRecentConversationExports, recordConversationArtifactExport, type ConversationExportIndexRecord } from "../../../conversation-export-index.js";
import { resolveResidentStateBindingViewForAgent } from "../../../resident-state-binding.js";

export function createConversationStoreForCLI(stateDir: string): ConversationStore {
  return new ConversationStore({
    dataDir: path.join(stateDir, "sessions"),
  });
}

export function hasTranscriptLikeData(bundle: SessionTranscriptExportBundle): boolean {
  return bundle.summary.eventCount > 0 || bundle.restore.rawMessages.length > 0;
}

export function hasTimelineLikeData(timeline: SessionTimelineProjection): boolean {
  return timeline.summary.eventCount > 0
    || timeline.summary.messageCount > 0
    || timeline.items.some((item) => item.kind !== "restore_result");
}

export async function writeConversationCommandOutput(targetPath: string, content: string): Promise<string> {
  const resolved = path.resolve(targetPath);
  await fs.mkdir(path.dirname(resolved), { recursive: true });
  await fs.writeFile(resolved, content, "utf-8");
  return resolved;
}

export async function resolveConversationCLIOutputPath(input: {
  output?: string;
  outputDir?: string;
  conversationId: string;
  artifact: "transcript" | "timeline" | "prompt_snapshot";
  variant?: string;
  extension: "json" | "txt";
}): Promise<string | undefined> {
  return resolveConversationArtifactOutputPath(input);
}

export async function listConversationCLIExportables(input: {
  stateDir: string;
  conversationIdPrefix?: string;
  limit?: number;
}): Promise<PersistedConversationSummary[]> {
  const store = createConversationStoreForCLI(input.stateDir);
  return store.listPersistedConversations({
    conversationIdPrefix: input.conversationIdPrefix,
    limit: input.limit,
  });
}

export async function recordConversationCLIExport(input: {
  stateDir: string;
  conversationId: string;
  artifact: "transcript" | "timeline" | "prompt_snapshot";
  format: "json" | "text";
  outputPath: string;
  mode?: string;
  projectionFilter?: Record<string, unknown>;
}): Promise<void> {
  await recordConversationArtifactExport(input);
}

export async function loadConversationPromptSnapshotForCLI(input: {
  stateDir: string;
  conversationId: string;
  runId?: string;
}): Promise<{
  artifact: ConversationPromptSnapshotArtifact;
  launchExplainability?: ReturnType<typeof buildAgentLaunchExplainability> | null;
  residentStateBinding?: ReturnType<typeof resolveResidentStateBindingViewForAgent> | null;
} | undefined> {
  const artifact = await loadConversationPromptSnapshotArtifact(input);
  if (!artifact) {
    return undefined;
  }
  const agentProfiles = await loadConversationPromptSnapshotAgentProfiles(input.stateDir);
  const agentId = typeof artifact.manifest.agentId === "string" && artifact.manifest.agentId.trim()
    ? artifact.manifest.agentId.trim()
    : undefined;
  return {
    artifact,
    launchExplainability: buildAgentLaunchExplainability({
      agentRegistry: agentProfiles,
      agentId,
    }) ?? null,
    residentStateBinding: resolveResidentStateBindingViewForAgent(
      input.stateDir,
      agentProfiles,
      agentId,
    ) ?? null,
  };
}

export function renderConversationPromptSnapshotArtifactText(
  input: {
    artifact: ConversationPromptSnapshotArtifact;
    launchExplainability?: ReturnType<typeof buildAgentLaunchExplainability> | null;
    residentStateBinding?: ReturnType<typeof resolveResidentStateBindingViewForAgent> | null;
  },
): string {
  return renderConversationPromptSnapshotText(input.artifact, {
    launchExplainability: input.launchExplainability ?? null,
    residentStateBinding: input.residentStateBinding ?? null,
  });
}

export async function listConversationCLIRecentExports(input: {
  stateDir: string;
  conversationIdPrefix?: string;
  limit?: number;
}): Promise<ConversationExportIndexRecord[]> {
  return listRecentConversationExports(input);
}

function formatTimestamp(timestamp: number): string {
  return new Date(timestamp).toISOString();
}

export function renderTimelineProjectionText(timeline: SessionTimelineProjection): string {
  const lines: string[] = [
    "Session Timeline",
    `conversationId: ${timeline.manifest.conversationId}`,
    `items: ${timeline.summary.itemCount}, warnings: ${timeline.warnings.length}`,
    "",
  ];

  for (const item of timeline.items) {
    if (item.kind === "message") {
      lines.push(`[${formatTimestamp(item.createdAt)}] ${item.role} ${item.messageId} ${item.contentPreview}`);
      continue;
    }

    if (item.kind === "compact_boundary") {
      lines.push(
        `[${formatTimestamp(item.createdAt)}] compact ${item.boundaryId} trigger=${item.trigger} delta=${item.tokenDelta} compacted=${item.compactedMessageCount} fallback=${item.fallbackUsed ? "yes" : "no"}`,
      );
      continue;
    }

    if (item.kind === "partial_compaction") {
      lines.push(
        `[${formatTimestamp(item.createdAt)}] partial ${item.partialViewId} direction=${item.direction} delta=${item.tokenDelta} compacted=${item.compactedMessageCount} fallback=${item.fallbackUsed ? "yes" : "no"}`,
      );
      continue;
    }

    lines.push(
      `[${formatTimestamp(item.createdAt)}] restore source=${item.source} relink=${item.relinkApplied ? "yes" : "no"} fallback=${item.fallbackToRaw ? "yes" : "no"} raw=${item.rawMessageCount} compacted=${item.compactedViewCount} canonical=${item.canonicalExtractionCount}`,
    );
  }

  if (timeline.warnings.length > 0) {
    lines.push("");
    lines.push(`warnings: ${timeline.warnings.join(", ")}`);
  }

  return lines.join("\n");
}

export function renderPersistedConversationSummaryList(items: PersistedConversationSummary[]): string {
  if (items.length === 0) {
    return "No exportable conversations found.";
  }
  return items.map((item) => {
    const surfaces = [
      item.hasTranscript ? "transcript" : undefined,
      item.hasMeta ? "meta" : undefined,
      item.hasMessages ? "messages" : undefined,
    ].filter(Boolean).join("+");
    return `${item.conversationId} updated=${new Date(item.updatedAt).toISOString()} messages=${item.messageCount} surfaces=${surfaces || "none"}`;
  }).join("\n");
}

export function renderRecentConversationExports(items: ConversationExportIndexRecord[]): string {
  if (items.length === 0) {
    return "No recent conversation exports found.";
  }
  return items.map((item) =>
    `${new Date(item.exportedAt).toISOString()} ${item.artifact}/${item.format} ${item.conversationId} -> ${item.outputPath}`,
  ).join("\n");
}

async function loadConversationPromptSnapshotAgentProfiles(
  stateDir: string,
): Promise<Pick<{ getProfile(agentId: string): AgentProfile | undefined }, "getProfile">> {
  const configuredProfiles = await loadAgentProfiles(path.join(stateDir, "agents.json"));
  const profiles = new Map<string, AgentProfile>();
  profiles.set("default", buildDefaultProfile());
  configuredProfiles.forEach((profile) => {
    profiles.set(profile.id, profile);
  });
  return {
    getProfile(agentId: string): AgentProfile | undefined {
      return profiles.get(agentId);
    },
  };
}
