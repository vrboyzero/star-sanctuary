import fs from "node:fs/promises";
import path from "node:path";
import type { SessionTimelineProjection, SessionTranscriptExportBundle } from "@belldandy/agent";
import { getConversationArtifactExportRoot } from "./conversation-export-index.js";

export const SUPPORTED_TRANSCRIPT_EVENT_TYPES = [
  "user_message_accepted",
  "assistant_message_finalized",
  "compact_boundary_recorded",
  "partial_compaction_view_recorded",
] as const;

export const SUPPORTED_TRANSCRIPT_RESTORE_VIEWS = [
  "all",
  "raw",
  "compacted",
  "canonical",
  "none",
] as const;

export const SUPPORTED_TIMELINE_KINDS = [
  "message",
  "compact_boundary",
  "partial_compaction",
  "restore_result",
] as const;

export type SupportedTranscriptEventType = typeof SUPPORTED_TRANSCRIPT_EVENT_TYPES[number];
export type SupportedTranscriptRestoreView = typeof SUPPORTED_TRANSCRIPT_RESTORE_VIEWS[number];
export type SupportedTimelineKind = typeof SUPPORTED_TIMELINE_KINDS[number];

export type TranscriptExportProjectionOptions = {
  eventTypes?: SupportedTranscriptEventType[];
  eventLimit?: number;
  restoreView?: SupportedTranscriptRestoreView;
};

export type TimelineProjectionFilterOptions = {
  kinds?: SupportedTimelineKind[];
  limit?: number;
};

export function parseCommaSeparatedValues(value: string | undefined): string[] | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const values = value.split(",").map((item) => item.trim()).filter(Boolean);
  return values.length > 0 ? values : undefined;
}

export function parsePositiveInteger(value: string | number | undefined): number | undefined {
  const normalized = typeof value === "string" ? Number(value) : value;
  if (typeof normalized !== "number" || !Number.isFinite(normalized)) {
    return undefined;
  }
  return normalized > 0 ? Math.floor(normalized) : undefined;
}

export function normalizeConversationIdPrefix(value: string | undefined): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function normalizeTranscriptEventTypes(values: readonly string[] | undefined): SupportedTranscriptEventType[] | undefined {
  if (!values || values.length === 0) {
    return undefined;
  }
  const supported = new Set<string>(SUPPORTED_TRANSCRIPT_EVENT_TYPES);
  const filtered = values.filter((value): value is SupportedTranscriptEventType => supported.has(value));
  return filtered.length > 0 ? filtered : undefined;
}

export function normalizeTimelineKinds(values: readonly string[] | undefined): SupportedTimelineKind[] | undefined {
  if (!values || values.length === 0) {
    return undefined;
  }
  const supported = new Set<string>(SUPPORTED_TIMELINE_KINDS);
  const filtered = values.filter((value): value is SupportedTimelineKind => supported.has(value));
  return filtered.length > 0 ? filtered : undefined;
}

export function normalizeTranscriptRestoreView(value: string | undefined): SupportedTranscriptRestoreView | undefined {
  if (!value) {
    return undefined;
  }
  return SUPPORTED_TRANSCRIPT_RESTORE_VIEWS.includes(value as SupportedTranscriptRestoreView)
    ? value as SupportedTranscriptRestoreView
    : undefined;
}

export function applyTranscriptExportProjection(
  bundle: SessionTranscriptExportBundle,
  options: TranscriptExportProjectionOptions = {},
): SessionTranscriptExportBundle & {
  projectionFilter: {
    eventTypes?: SupportedTranscriptEventType[];
    eventLimit?: number;
    restoreView: SupportedTranscriptRestoreView;
  };
  projectionSummary: {
    visibleEventCount: number;
    visibleRawMessageCount: number;
    visibleCompactedViewCount: number;
    visibleCanonicalExtractionCount: number;
  };
} {
  let events = bundle.events.slice();
  if (options.eventTypes && options.eventTypes.length > 0) {
    const eventTypes = new Set<string>(options.eventTypes);
    events = events.filter((event) => {
      const type = typeof event.type === "string" ? event.type : "";
      return eventTypes.has(type);
    });
  }
  if (typeof options.eventLimit === "number") {
    events = events.slice(-options.eventLimit);
  }

  const restoreView = options.restoreView ?? "all";
  const restore = {
    ...bundle.restore,
    rawMessages: restoreView === "all" || restoreView === "raw" ? bundle.restore.rawMessages.slice() : [],
    compactedView: restoreView === "all" || restoreView === "compacted" ? bundle.restore.compactedView.slice() : [],
    canonicalExtractionView: restoreView === "all" || restoreView === "canonical"
      ? bundle.restore.canonicalExtractionView.slice()
      : [],
  };

  return {
    ...bundle,
    events,
    restore,
    projectionFilter: {
      ...(options.eventTypes && options.eventTypes.length > 0 ? { eventTypes: [...options.eventTypes] } : {}),
      ...(typeof options.eventLimit === "number" ? { eventLimit: options.eventLimit } : {}),
      restoreView,
    },
    projectionSummary: {
      visibleEventCount: events.length,
      visibleRawMessageCount: restore.rawMessages.length,
      visibleCompactedViewCount: restore.compactedView.length,
      visibleCanonicalExtractionCount: restore.canonicalExtractionView.length,
    },
  };
}

export function applyTimelineProjectionFilter(
  timeline: SessionTimelineProjection,
  options: TimelineProjectionFilterOptions = {},
): SessionTimelineProjection & {
  projectionFilter: {
    kinds?: SupportedTimelineKind[];
    limit?: number;
  };
  projectionSummary: {
    visibleItemCount: number;
    visibleWarningCount: number;
  };
} {
  let items = timeline.items.slice();
  if (options.kinds && options.kinds.length > 0) {
    const kinds = new Set<string>(options.kinds);
    items = items.filter((item) => kinds.has(item.kind));
  }
  if (typeof options.limit === "number") {
    items = items.slice(-options.limit);
  }

  return {
    ...timeline,
    items,
    projectionFilter: {
      ...(options.kinds && options.kinds.length > 0 ? { kinds: [...options.kinds] } : {}),
      ...(typeof options.limit === "number" ? { limit: options.limit } : {}),
    },
    projectionSummary: {
      visibleItemCount: items.length,
      visibleWarningCount: timeline.warnings.length,
    },
  };
}

function sanitizeFileSegment(value: string): string {
  const sanitized = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return sanitized.slice(0, 96) || "conversation";
}

async function ensureUniqueFilePath(targetPath: string): Promise<string> {
  const parsed = path.parse(targetPath);
  let attempt = 0;
  let candidate = targetPath;

  while (true) {
    const stat = await fs.stat(candidate).catch(() => null);
    if (!stat) {
      return candidate;
    }
    attempt += 1;
    candidate = path.join(parsed.dir, `${parsed.name}.${attempt}${parsed.ext}`);
  }
}

function isPathInsideDirectory(targetPath: string, directory: string): boolean {
  const relative = path.relative(directory, targetPath);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

export async function resolveConversationArtifactOutputPath(input: {
  output?: string;
  outputDir?: string;
  stateDir?: string;
  conversationId: string;
  artifact: "transcript" | "timeline" | "prompt_snapshot";
  variant?: string;
  extension: "json" | "txt";
}): Promise<string | undefined> {
  const output = input.output?.trim();
  const outputDir = input.outputDir?.trim();
  const sanitizedId = sanitizeFileSegment(input.conversationId);
  const variant = input.variant ? `.${sanitizeFileSegment(input.variant)}` : "";
  const suggestedFileName = `conversation-${sanitizedId}.${input.artifact}${variant}.${input.extension}`;

  if (!output && !outputDir) {
    return undefined;
  }

  if (output) {
    const looksLikeDirectory = /[\\/]$/.test(output);
    const resolvedOutput = path.resolve(output);
    const stat = await fs.stat(resolvedOutput).catch(() => null);
    if (looksLikeDirectory || stat?.isDirectory()) {
      await fs.mkdir(resolvedOutput, { recursive: true });
      if (input.artifact === "prompt_snapshot" && input.stateDir) {
        const promptSnapshotRoot = path.join(path.resolve(input.stateDir), "diagnostics", "prompt-snapshots");
        if (isPathInsideDirectory(resolvedOutput, promptSnapshotRoot)) {
          const exportRoot = getConversationArtifactExportRoot({
            stateDir: input.stateDir,
            artifact: input.artifact,
          });
          await fs.mkdir(exportRoot, { recursive: true });
          return ensureUniqueFilePath(path.join(exportRoot, suggestedFileName));
        }
      }
      return ensureUniqueFilePath(path.join(resolvedOutput, suggestedFileName));
    }
    await fs.mkdir(path.dirname(resolvedOutput), { recursive: true });
    if (input.artifact === "prompt_snapshot" && input.stateDir) {
      const promptSnapshotRoot = path.join(path.resolve(input.stateDir), "diagnostics", "prompt-snapshots");
      if (isPathInsideDirectory(resolvedOutput, promptSnapshotRoot)) {
        const exportRoot = getConversationArtifactExportRoot({
          stateDir: input.stateDir,
          artifact: input.artifact,
        });
        await fs.mkdir(exportRoot, { recursive: true });
        return ensureUniqueFilePath(path.join(exportRoot, path.basename(resolvedOutput)));
      }
    }
    return resolvedOutput;
  }

  const resolvedDir = path.resolve(outputDir!);
  await fs.mkdir(resolvedDir, { recursive: true });
  if (input.artifact === "prompt_snapshot" && input.stateDir) {
    const promptSnapshotRoot = path.join(path.resolve(input.stateDir), "diagnostics", "prompt-snapshots");
    if (isPathInsideDirectory(resolvedDir, promptSnapshotRoot)) {
      const exportRoot = getConversationArtifactExportRoot({
        stateDir: input.stateDir,
        artifact: input.artifact,
      });
      await fs.mkdir(exportRoot, { recursive: true });
      return ensureUniqueFilePath(path.join(exportRoot, suggestedFileName));
    }
  }
  return ensureUniqueFilePath(path.join(resolvedDir, suggestedFileName));
}
